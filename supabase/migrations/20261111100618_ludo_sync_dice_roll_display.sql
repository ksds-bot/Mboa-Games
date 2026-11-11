create or replace function private.ludo_roll(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room_id uuid; v_user uuid:=auth.uid(); v_state jsonb; v_order jsonb; v_current integer;
  v_roll integer; v_sixes integer; v_player uuid; v_has_move boolean:=false; v_i integer;
begin
  select id into v_room_id from public.rooms where code=upper(trim(p_code)) and game_type='ludo' and status='playing';
  if v_room_id is null or v_user is null then raise exception 'Partie indisponible.'; end if;
  select state into v_state from public.game_sessions where room_id=v_room_id for update;
  if v_state is null then raise exception 'État de partie introuvable.'; end if;
  v_order:=v_state->'playerOrder'; v_current:=(v_state->>'currentPlayer')::integer; v_player:=(v_order->>v_current)::uuid;
  if v_player<>v_user then raise exception 'Ce n’est pas ton tour.'; end if;
  if v_state->>'winner' is not null and v_state->>'winner'<>'null' then raise exception 'La partie est terminée.'; end if;
  if v_state->'lastRoll' is not null and v_state->'lastRoll'<>'null'::jsonb then raise exception 'Déplace ton pion avant de relancer.'; end if;
  v_roll:=floor(random()*6)::integer+1;
  v_state:=jsonb_set(v_state,'{lastRollDisplay}',to_jsonb(v_roll),true);
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
