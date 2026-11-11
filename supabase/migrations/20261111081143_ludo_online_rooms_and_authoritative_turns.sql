-- Online Ludo rooms with server-authoritative game state.
-- Applied to the Mboa Games Supabase project as migration 20261111081143.

create or replace function public.is_ludo_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.user_id = auth.uid()
  );
$$;
revoke all on function public.is_ludo_room_member(uuid) from public;
grant execute on function public.is_ludo_room_member(uuid) to authenticated;

drop policy if exists "Room members can view all seats" on public.room_players;
create policy "Room members can view all seats"
on public.room_players for select to authenticated
using (public.is_ludo_room_member(room_id));

create or replace function public.ludo_create_room(p_max_players smallint default 4)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_code text;
begin
  if v_user is null then raise exception 'Connecte-toi pour créer une salle.'; end if;
  if p_max_players < 2 or p_max_players > 4 then raise exception 'Une salle Ludo accepte 2 à 4 joueurs.'; end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 6));
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;
  insert into public.rooms(code,game_type,host_id,max_players,is_private,status)
  values(v_code,'ludo',v_user,p_max_players,true,'waiting') returning * into v_room;
  insert into public.room_players(room_id,user_id,seat,is_ready) values(v_room.id,v_user,0,true);
  return jsonb_build_object('id',v_room.id,'code',v_room.code,'status',v_room.status);
end;
$$;

create or replace function public.ludo_join_room(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_seat integer;
begin
  if v_user is null then raise exception 'Connecte-toi pour rejoindre une salle.'; end if;
  select * into v_room from public.rooms r where r.code=upper(trim(p_code)) and r.game_type='ludo' for update;
  if not found then raise exception 'Code de salle introuvable.'; end if;
  if v_room.status<>'waiting' then raise exception 'Cette partie a déjà commencé.'; end if;
  if exists(select 1 from public.room_players rp where rp.room_id=v_room.id and rp.user_id=v_user) then
    return jsonb_build_object('id',v_room.id,'code',v_room.code);
  end if;
  select count(*) into v_seat from public.room_players rp where rp.room_id=v_room.id;
  if v_seat>=v_room.max_players then raise exception 'Cette salle est complète.'; end if;
  insert into public.room_players(room_id,user_id,seat,is_ready) values(v_room.id,v_user,v_seat,false);
  return jsonb_build_object('id',v_room.id,'code',v_room.code);
end;
$$;

create or replace function public.ludo_set_ready(p_code text,p_ready boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_room_id uuid; v_user uuid := auth.uid();
begin
  select id into v_room_id from public.rooms where code=upper(trim(p_code)) and game_type='ludo' and status='waiting';
  if v_room_id is null or v_user is null then raise exception 'Salle indisponible.'; end if;
  update public.room_players set is_ready=p_ready where room_id=v_room_id and user_id=v_user;
  if not found then raise exception 'Tu ne fais pas partie de cette salle.'; end if;
  return p_ready;
end;
$$;

create or replace function public.ludo_room_snapshot(p_code text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_room public.rooms%rowtype; v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Connecte-toi pour consulter cette salle.'; end if;
  select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo';
  if not found then raise exception 'Salle introuvable.'; end if;
  if not exists(select 1 from public.room_players where room_id=v_room.id and user_id=v_user) then
    raise exception 'Tu ne fais pas partie de cette salle.';
  end if;
  select jsonb_build_object(
    'room',jsonb_build_object('id',v_room.id,'code',v_room.code,'status',v_room.status,'maxPlayers',v_room.max_players,'hostId',v_room.host_id),
    'players',coalesce((select jsonb_agg(jsonb_build_object(
      'userId',rp.user_id,'seat',rp.seat,'ready',rp.is_ready,'username',coalesce(p.username,p.display_name,'Joueur')
    ) order by rp.seat) from public.room_players rp left join public.profiles p on p.id=rp.user_id where rp.room_id=v_room.id),'[]'::jsonb),
    'game',(select gs.state from public.game_sessions gs where gs.room_id=v_room.id)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.ludo_start_room(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_players uuid[]; v_state jsonb;
begin
  select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo' for update;
  if not found or v_room.host_id<>v_user then raise exception 'Seul le créateur peut démarrer la partie.'; end if;
  if v_room.status<>'waiting' then raise exception 'La partie a déjà commencé.'; end if;
  select array_agg(user_id order by seat) into v_players from public.room_players where room_id=v_room.id;
  if coalesce(array_length(v_players,1),0)<2 then raise exception 'Il faut au moins 2 joueurs.'; end if;
  if exists(select 1 from public.room_players where room_id=v_room.id and not is_ready) then raise exception 'Tous les joueurs doivent être prêts.'; end if;
  v_state:=jsonb_build_object(
    'playerOrder',to_jsonb(v_players),
    'tokens',jsonb_build_array(jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1)),
    'currentPlayer',0,'lastRoll',null,'consecutiveSixes',0,'winner',null,'turnNumber',1
  );
  update public.rooms set status='playing',updated_at=now() where id=v_room.id;
  insert into public.game_sessions(room_id,state,current_turn_user_id) values(v_room.id,v_state,v_players[1])
  on conflict(room_id) do update set state=excluded.state,current_turn_user_id=excluded.current_turn_user_id,updated_at=now();
  return v_state;
end;
$$;

create or replace function public.ludo_roll(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_room_id uuid; v_user uuid:=auth.uid(); v_state jsonb; v_order jsonb; v_current integer;
  v_roll integer; v_sixes integer; v_player uuid; v_tokens jsonb; v_has_move boolean:=false;
  v_i integer; v_progress integer;
begin
  select id into v_room_id from public.rooms where code=upper(trim(p_code)) and game_type='ludo' and status='playing';
  if v_room_id is null or v_user is null then raise exception 'Partie indisponible.'; end if;
  select state into v_state from public.game_sessions where room_id=v_room_id for update;
  if v_state is null then raise exception 'État de partie introuvable.'; end if;
  v_order:=v_state->'playerOrder'; v_current:=(v_state->>'currentPlayer')::integer; v_player:=(v_order->>v_current)::uuid;
  if v_player<>v_user then raise exception 'Ce n’est pas ton tour.'; end if;
  if v_state->>'winner' is not null then raise exception 'La partie est terminée.'; end if;
  if v_state->'lastRoll' is not null and v_state->'lastRoll'<>'null'::jsonb then raise exception 'Déplace ton pion avant de relancer.'; end if;
  v_roll:=floor(random()*6)::integer+1;
  v_sixes:=case when v_roll=6 then (v_state->>'consecutiveSixes')::integer+1 else 0 end;
  if v_sixes>=3 then
    v_state:=jsonb_set(v_state,'{currentPlayer}',to_jsonb((v_current+1)%jsonb_array_length(v_order)));
    v_state:=jsonb_set(v_state,'{lastRoll}','null'::jsonb);
    v_state:=jsonb_set(v_state,'{consecutiveSixes}','0'::jsonb);
    v_state:=jsonb_set(v_state,'{turnNumber}',to_jsonb((v_state->>'turnNumber')::integer+1));
  else
    v_tokens:=v_state->'tokens'->v_current;
    for v_i in 0..3 loop
      v_progress:=(v_tokens->>v_i)::integer;
      if v_progress=-1 and v_roll=6 then v_has_move:=true;
      elsif v_progress>=0 and v_progress<57 and v_progress+v_roll<=57 then v_has_move:=true; end if;
    end loop;
    v_state:=jsonb_set(v_state,'{consecutiveSixes}',to_jsonb(v_sixes));
    if v_has_move then v_state:=jsonb_set(v_state,'{lastRoll}',to_jsonb(v_roll));
    else
      v_state:=jsonb_set(v_state,'{lastRoll}','null'::jsonb);
      if v_roll<>6 then
        v_state:=jsonb_set(v_state,'{currentPlayer}',to_jsonb((v_current+1)%jsonb_array_length(v_order)));
        v_state:=jsonb_set(v_state,'{consecutiveSixes}','0'::jsonb);
        v_state:=jsonb_set(v_state,'{turnNumber}',to_jsonb((v_state->>'turnNumber')::integer+1));
      end if;
    end if;
  end if;
  update public.game_sessions set state=v_state,current_turn_user_id=(v_order->>((v_state->>'currentPlayer')::integer))::uuid,updated_at=now()
  where room_id=v_room_id;
  return jsonb_build_object('roll',v_roll,'state',v_state);
end;
$$;

create or replace function public.ludo_move(p_code text,p_token_index integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_room_id uuid; v_user uuid:=auth.uid(); v_state jsonb; v_order jsonb; v_current integer; v_player uuid;
  v_roll integer; v_tokens jsonb; v_previous integer; v_next integer; v_square integer; v_safe boolean;
  v_opponent integer; v_other_token integer; v_other_progress integer; v_captured boolean:=false; v_winner boolean:=false; v_bonus boolean;
begin
  if p_token_index<0 or p_token_index>3 then raise exception 'Pion invalide.'; end if;
  select id into v_room_id from public.rooms where code=upper(trim(p_code)) and game_type='ludo' and status='playing';
  if v_room_id is null or v_user is null then raise exception 'Partie indisponible.'; end if;
  select state into v_state from public.game_sessions where room_id=v_room_id for update;
  v_order:=v_state->'playerOrder'; v_current:=(v_state->>'currentPlayer')::integer; v_player:=(v_order->>v_current)::uuid;
  if v_player<>v_user then raise exception 'Ce n’est pas ton tour.'; end if;
  if v_state->'lastRoll' is null or v_state->'lastRoll'='null'::jsonb then raise exception 'Lance le dé avant de déplacer un pion.'; end if;
  v_roll:=(v_state->>'lastRoll')::integer; v_tokens:=v_state->'tokens'; v_previous:=(v_tokens->v_current->>p_token_index)::integer;
  if v_previous=57 or (v_previous=-1 and v_roll<>6) or (v_previous>=0 and v_previous+v_roll>57) then raise exception 'Ce pion ne peut pas avancer.'; end if;
  v_next:=case when v_previous=-1 then 0 else v_previous+v_roll end;
  v_state:=jsonb_set(v_state,array['tokens',v_current::text,p_token_index::text],to_jsonb(v_next));
  if v_next<=50 then
    v_square:=mod(case v_current when 0 then 0 when 1 then 13 when 2 then 26 else 39 end+v_next,52);
    v_safe:=v_square in (0,8,13,21,26,34,39,47);
    if not v_safe then
      for v_opponent in 0..jsonb_array_length(v_order)-1 loop
        if v_opponent<>v_current then
          for v_other_token in 0..3 loop
            v_other_progress:=(v_state->'tokens'->v_opponent->>v_other_token)::integer;
            if v_other_progress>=0 and v_other_progress<=50 and mod(case v_opponent when 0 then 0 when 1 then 13 when 2 then 26 else 39 end+v_other_progress,52)=v_square then
              v_state:=jsonb_set(v_state,array['tokens',v_opponent::text,v_other_token::text],'-1'::jsonb);
              v_captured:=true;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;
  select bool_and((value::text)::integer=57) into v_winner from jsonb_array_elements(v_state->'tokens'->v_current);
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

revoke all on function public.ludo_create_room(smallint) from public,anon;
revoke all on function public.ludo_join_room(text) from public,anon;
revoke all on function public.ludo_set_ready(text,boolean) from public,anon;
revoke all on function public.ludo_room_snapshot(text) from public,anon;
revoke all on function public.ludo_start_room(text) from public,anon;
revoke all on function public.ludo_roll(text) from public,anon;
revoke all on function public.ludo_move(text,integer) from public,anon;
grant execute on function public.ludo_create_room(smallint) to authenticated;
grant execute on function public.ludo_join_room(text) to authenticated;
grant execute on function public.ludo_set_ready(text,boolean) to authenticated;
grant execute on function public.ludo_room_snapshot(text) to authenticated;
grant execute on function public.ludo_start_room(text) to authenticated;
grant execute on function public.ludo_roll(text) to authenticated;
grant execute on function public.ludo_move(text,integer) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_sessions') then
    alter publication supabase_realtime add table public.game_sessions;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_players') then
    alter publication supabase_realtime add table public.room_players;
  end if;
end $$;
