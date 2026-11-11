-- Enforce Ludo turn deadlines at the database boundary.
-- A client-side countdown is only a display; expired turns must not accept moves.

create or replace function private.ludo_reject_expired_turn_action()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.turn_deadline_at is not null
    and old.turn_deadline_at <= clock_timestamp()
    and new.state is distinct from old.state
    and coalesce(current_setting('mboa.ludo_expiring_turn', true), '') <> 'on'
  then
    raise exception using
      errcode = 'P0001',
      message = 'Le délai de ce tour est écoulé. Le serveur passe au joueur suivant.';
  end if;

  return new;
end;
$$;

drop trigger if exists ludo_reject_expired_turn_action on public.game_sessions;
create trigger ludo_reject_expired_turn_action
before update of state on public.game_sessions
for each row
execute function private.ludo_reject_expired_turn_action();

create or replace function private.ludo_expire_turn(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_user uuid := auth.uid();
  v_state jsonb;
  v_order jsonb;
  v_current integer;
  v_next integer;
  v_deadline timestamptz;
begin
  if v_user is null then
    raise exception 'Connecte-toi pour continuer.';
  end if;

  select r.id into v_room_id
  from public.rooms r
  join public.room_players rp on rp.room_id = r.id and rp.user_id = v_user
  where r.code = upper(trim(p_code))
    and r.game_type = 'ludo'
    and r.status = 'playing';

  if v_room_id is null then
    raise exception 'Tu ne fais pas partie de cette partie.';
  end if;

  select gs.state, gs.turn_deadline_at
    into v_state, v_deadline
  from public.game_sessions gs
  where gs.room_id = v_room_id
  for update;

  if v_state is null or v_deadline is null or clock_timestamp() < v_deadline then
    return coalesce(v_state, '{}'::jsonb);
  end if;

  if v_state->>'winner' is not null and v_state->>'winner' <> 'null' then
    return v_state;
  end if;

  v_order := v_state->'playerOrder';
  v_current := (v_state->>'currentPlayer')::integer;
  v_next := (v_current + 1) % jsonb_array_length(v_order);

  v_state := jsonb_set(v_state, '{currentPlayer}', to_jsonb(v_next));
  v_state := jsonb_set(v_state, '{lastRoll}', 'null'::jsonb);
  v_state := jsonb_set(v_state, '{consecutiveSixes}', '0'::jsonb);
  v_state := jsonb_set(v_state, '{turnNumber}', to_jsonb((v_state->>'turnNumber')::integer + 1));
  v_state := jsonb_set(v_state, '{lastTurnTimedOut}', to_jsonb(v_order->>v_current));

  -- Permit this one authoritative timeout update through the deadline guard.
  perform set_config('mboa.ludo_expiring_turn', 'on', true);

  update public.game_sessions
    set state = v_state,
        current_turn_user_id = (v_order->>v_next)::uuid,
        updated_at = now()
    where room_id = v_room_id
    returning state into v_state;

  return v_state;
end;
$$;

revoke all on function private.ludo_reject_expired_turn_action() from public, anon, authenticated;
revoke all on function private.ludo_expire_turn(text) from public, anon, authenticated;
grant execute on function private.ludo_expire_turn(text) to authenticated;
