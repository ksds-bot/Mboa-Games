-- Enforce Ludo blockades in both legal-move discovery and server-side move validation.
create or replace function private.ludo_can_move(p_state jsonb,p_player integer,p_token integer,p_roll integer)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  v_previous integer; v_next integer; v_step integer; v_square integer; v_owner integer;
  v_other_token integer; v_other_progress integer; v_blockade_count integer; v_player_count integer;
begin
  if p_player<0 or p_player>=jsonb_array_length(p_state->'playerOrder') or p_token<0 or p_token>3 or p_roll<1 or p_roll>6 then return false; end if;
  v_previous:=(p_state->'tokens'->p_player->>p_token)::integer;
  if v_previous=57 or (v_previous=-1 and p_roll<>6) then return false; end if;
  v_next:=case when v_previous=-1 then 0 else v_previous+p_roll end;
  if v_previous>=0 and v_next>57 then return false; end if;
  v_player_count:=jsonb_array_length(p_state->'playerOrder');
  for v_step in case when v_previous=-1 then 0 else v_previous+1 end..v_next loop
    if v_step<=50 then
      v_square:=mod(case p_player when 0 then 0 when 1 then 13 when 2 then 26 else 39 end+v_step,52);
      for v_owner in 0..v_player_count-1 loop
        v_blockade_count:=0;
        for v_other_token in 0..3 loop
          if not (v_owner=p_player and v_other_token=p_token) then
            v_other_progress:=(p_state->'tokens'->v_owner->>v_other_token)::integer;
            if v_other_progress>=0 and v_other_progress<=50 and
              mod(case v_owner when 0 then 0 when 1 then 13 when 2 then 26 else 39 end+v_other_progress,52)=v_square then
              v_blockade_count:=v_blockade_count+1;
            end if;
          end if;
        end loop;
        if v_blockade_count>=2 then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function private.ludo_roll(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_room_id uuid; v_user uuid:=auth.uid(); v_state jsonb; v_order jsonb; v_current integer;
  v_roll integer; v_sixes integer; v_player uuid; v_has_move boolean:=false; v_i integer;
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
    for v_i in 0..3 loop
      if private.ludo_can_move(v_state,v_current,v_i,v_roll) then v_has_move:=true; exit; end if;
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

create or replace function private.ludo_move(p_code text,p_token_index integer)
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
  if not private.ludo_can_move(v_state,v_current,p_token_index,v_roll) then raise exception 'Ce pion ne peut pas avancer : chemin bloqué ou arrivée impossible.'; end if;
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
            if v_other_progress>=0 and v_other_progress<=50 and
              mod(case v_opponent when 0 then 0 when 1 then 13 when 2 then 26 else 39 end+v_other_progress,52)=v_square then
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
