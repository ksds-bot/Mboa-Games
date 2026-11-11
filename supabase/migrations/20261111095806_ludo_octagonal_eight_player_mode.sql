-- Ludo 237: add an independent 5-8 player octagonal board while preserving classic 2-4 player rules.
create or replace function private.ludo_create_room(p_max_players smallint default 4)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_code text;
begin
  if v_user is null then raise exception 'Connecte-toi pour créer une salle.'; end if;
  if p_max_players < 2 or p_max_players > 8 then raise exception 'Une salle Ludo accepte 2 à 8 joueurs.'; end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 6));
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;
  insert into public.rooms(code,game_type,host_id,max_players,is_private,status)
  values(v_code,'ludo',v_user,p_max_players,true,'waiting') returning * into v_room;
  insert into public.room_players(room_id,user_id,seat,is_ready) values(v_room.id,v_user,0,true);
  return jsonb_build_object('id',v_room.id,'code',v_room.code,'status',v_room.status);
end;
$$;

create or replace function private.ludo_start_room(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_players uuid[]; v_state jsonb;
  v_player_count integer; v_is_octagonal boolean; v_tokens jsonb;
begin
  select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo' for update;
  if not found or v_room.host_id <> v_user then raise exception 'Seul le créateur peut démarrer la partie.'; end if;
  if v_room.status <> 'waiting' then raise exception 'La partie a déjà commencé.'; end if;
  select array_agg(user_id order by seat) into v_players from public.room_players where room_id=v_room.id;
  v_player_count := coalesce(array_length(v_players,1),0);
  if v_player_count < 2 then raise exception 'Il faut au moins 2 joueurs.'; end if;
  if v_player_count > v_room.max_players then raise exception 'La salle dépasse sa capacité.'; end if;
  if v_room.max_players <= 4 and v_player_count > 4 then raise exception 'Le plateau classique accepte au maximum 4 joueurs.'; end if;
  if v_room.max_players > 4 and v_player_count < 5 then raise exception 'Le plateau à huit places nécessite au moins 5 joueurs.'; end if;
  if exists(select 1 from public.room_players where room_id=v_room.id and not is_ready) then raise exception 'Tous les joueurs doivent être prêts.'; end if;
  v_is_octagonal := v_room.max_players > 4;
  select jsonb_agg(jsonb_build_array(-1,-1,-1,-1) order by n) into v_tokens from generate_series(1,v_player_count) as g(n);
  v_state := jsonb_build_object(
    'playerOrder',to_jsonb(v_players),'tokens',v_tokens,
    'boardVariant',case when v_is_octagonal then 'octagonal8' else 'classic4' end,
    'trackLength',case when v_is_octagonal then 48 else 52 end,
    'routeEnd',case when v_is_octagonal then 46 else 50 end,
    'homeStart',case when v_is_octagonal then 47 else 51 end,
    'goalProgress',case when v_is_octagonal then 52 else 57 end,
    'currentPlayer',0,'lastRoll',null,'consecutiveSixes',0,'winner',null,'turnNumber',1
  );
  update public.rooms set status='playing',updated_at=now() where id=v_room.id;
  insert into public.game_sessions(room_id,state,current_turn_user_id) values(v_room.id,v_state,v_players[1])
  on conflict(room_id) do update set state=excluded.state,current_turn_user_id=excluded.current_turn_user_id,updated_at=now();
  return v_state;
end;
$$;

create or replace function private.ludo_can_move(p_state jsonb, p_player integer, p_token integer, p_roll integer)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_previous integer; v_next integer; v_step integer; v_square integer; v_owner integer;
  v_other_token integer; v_other_progress integer; v_blockade_count integer; v_player_count integer;
  v_track_length integer; v_route_end integer; v_goal integer; v_offset integer;
begin
  v_player_count := jsonb_array_length(p_state->'playerOrder');
  if p_player<0 or p_player>=v_player_count or p_token<0 or p_token>3 or p_roll<1 or p_roll>6 then return false; end if;
  v_track_length := coalesce((p_state->>'trackLength')::integer,52);
  v_route_end := coalesce((p_state->>'routeEnd')::integer,50);
  v_goal := coalesce((p_state->>'goalProgress')::integer,57);
  v_previous := (p_state->'tokens'->p_player->>p_token)::integer;
  if v_previous=v_goal or (v_previous=-1 and p_roll<>6) then return false; end if;
  v_next := case when v_previous=-1 then 0 else v_previous+p_roll end;
  if v_previous>=0 and v_next>v_goal then return false; end if;
  for v_step in case when v_previous=-1 then 0 else v_previous+1 end..least(v_next,v_route_end) loop
    v_offset := case when v_track_length=48 then p_player*6 else p_player*13 end;
    v_square := mod(v_offset+v_step,v_track_length);
    for v_owner in 0..v_player_count-1 loop
      v_blockade_count := 0;
      for v_other_token in 0..3 loop
        if not (v_owner=p_player and v_other_token=p_token) then
          v_other_progress := (p_state->'tokens'->v_owner->>v_other_token)::integer;
          if v_other_progress>=0 and v_other_progress<=v_route_end
            and mod((case when v_track_length=48 then v_owner*6 else v_owner*13 end)+v_other_progress,v_track_length)=v_square then
            v_blockade_count := v_blockade_count+1;
          end if;
        end if;
      end loop;
      if v_blockade_count>=2 then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;

create or replace function private.ludo_move(p_code text,p_token_index integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room_id uuid; v_user uuid:=auth.uid(); v_state jsonb; v_order jsonb; v_current integer; v_player uuid;
  v_roll integer; v_tokens jsonb; v_previous integer; v_next integer; v_square integer; v_safe boolean;
  v_opponent integer; v_other_token integer; v_other_progress integer; v_captured boolean:=false; v_winner boolean:=false; v_bonus boolean;
  v_track_length integer; v_route_end integer; v_goal integer; v_offset integer;
begin
  if p_token_index<0 or p_token_index>3 then raise exception 'Pion invalide.'; end if;
  select id into v_room_id from public.rooms where code=upper(trim(p_code)) and game_type='ludo' and status='playing';
  if v_room_id is null or v_user is null then raise exception 'Partie indisponible.'; end if;
  select state into v_state from public.game_sessions where room_id=v_room_id for update;
  if v_state is null then raise exception 'État de partie introuvable.'; end if;
  v_order:=v_state->'playerOrder'; v_current:=(v_state->>'currentPlayer')::integer; v_player:=(v_order->>v_current)::uuid;
  if v_player<>v_user then raise exception 'Ce n’est pas ton tour.'; end if;
  if v_state->'lastRoll' is null or v_state->'lastRoll'='null'::jsonb then raise exception 'Lance le dé avant de déplacer un pion.'; end if;
  v_track_length:=coalesce((v_state->>'trackLength')::integer,52);
  v_route_end:=coalesce((v_state->>'routeEnd')::integer,50);
  v_goal:=coalesce((v_state->>'goalProgress')::integer,57);
  v_offset:=case when v_track_length=48 then v_current*6 else v_current*13 end;
  v_roll:=(v_state->>'lastRoll')::integer; v_tokens:=v_state->'tokens'; v_previous:=(v_tokens->v_current->>p_token_index)::integer;
  if not private.ludo_can_move(v_state,v_current,p_token_index,v_roll) then raise exception 'Ce pion ne peut pas avancer : chemin bloqué ou arrivée impossible.'; end if;
  v_next:=case when v_previous=-1 then 0 else v_previous+v_roll end;
  v_state:=jsonb_set(v_state,array['tokens',v_current::text,p_token_index::text],to_jsonb(v_next));
  if v_next<=v_route_end then
    v_square:=mod(v_offset+v_next,v_track_length);
    v_safe:=case when v_track_length=48 then v_square in (0,6,12,18,24,30,36,42) else v_square in (0,8,13,21,26,34,39,47) end;
    if not v_safe then
      for v_opponent in 0..jsonb_array_length(v_order)-1 loop
        if v_opponent<>v_current then
          for v_other_token in 0..3 loop
            v_other_progress:=(v_state->'tokens'->v_opponent->>v_other_token)::integer;
            if v_other_progress>=0 and v_other_progress<=v_route_end
              and mod((case when v_track_length=48 then v_opponent*6 else v_opponent*13 end)+v_other_progress,v_track_length)=v_square then
              v_state:=jsonb_set(v_state,array['tokens',v_opponent::text,v_other_token::text],'-1'::jsonb);
              v_captured:=true;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;
  select bool_and((value::text)::integer=v_goal) into v_winner from jsonb_array_elements(v_state->'tokens'->v_current);
  v_bonus:=v_roll=6 or v_captured;
  v_state:=jsonb_set(v_state,'{lastRoll}','null'::jsonb);
  if v_winner then
    v_state:=jsonb_set(v_state,'{winner}',to_jsonb(v_current));
    update public.rooms set status='finished',updated_at=now() where id=v_room_id;
  elsif not v_bonus then
    v_state:=jsonb_set(v_state,'{currentPlayer}',to_jsonb((v_current+1)%jsonb_array_length(v_order)));
    v_state:=jsonb_set(v_state,'{consecutiveSixes}','0'::jsonb);
    v_state:=jsonb_set(v_state,'{turnNumber}',to_jsonb((v_state->>'turnNumber')::integer+1));
  end if;
  update public.game_sessions set state=v_state,current_turn_user_id=(v_order->>((v_state->>'currentPlayer')::integer))::uuid,updated_at=now()
  where room_id=v_room_id;
  return jsonb_build_object('state',v_state,'captured',v_captured,'winner',v_winner);
end;
$$;

revoke all on function private.ludo_create_room(smallint) from public, anon, authenticated;
revoke all on function private.ludo_start_room(text) from public, anon, authenticated;
revoke all on function private.ludo_can_move(jsonb,integer,integer,integer) from public, anon, authenticated;
revoke all on function private.ludo_move(text,integer) from public, anon, authenticated;
grant execute on function private.ludo_create_room(smallint) to authenticated;
grant execute on function private.ludo_start_room(text) to authenticated;
grant execute on function private.ludo_move(text,integer) to authenticated;
grant execute on function private.ludo_can_move(jsonb,integer,integer,integer) to authenticated;
