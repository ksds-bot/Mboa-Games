-- Ludo 237: 15-second server-authoritative turns, room chat and virtual points foundation.
alter table public.game_sessions add column if not exists turn_deadline_at timestamptz;
alter table public.rooms add column if not exists points_stake integer not null default 0;
alter table public.rooms drop constraint if exists rooms_points_stake_check;
alter table public.rooms add constraint rooms_points_stake_check check (points_stake >= 0 and points_stake <= 1000000);

create table if not exists public.ludo_chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists ludo_chat_room_created_idx on public.ludo_chat_messages(room_id, created_at desc);
alter table public.ludo_chat_messages enable row level security;
drop policy if exists "Ludo members read room chat" on public.ludo_chat_messages;
create policy "Ludo members read room chat" on public.ludo_chat_messages
for select to authenticated using (exists (
  select 1 from public.room_players rp where rp.room_id = ludo_chat_messages.room_id and rp.user_id = (select auth.uid())
));
grant select on public.ludo_chat_messages to authenticated;
grant usage, select on sequence public.ludo_chat_messages_id_seq to authenticated;

create or replace function private.ludo_set_turn_deadline()
returns trigger language plpgsql set search_path = '' as $$
declare v_reset boolean := false;
begin
  if tg_op = 'INSERT' then v_reset := true;
  elsif coalesce(new.state->>'currentPlayer','') <> coalesce(old.state->>'currentPlayer','')
    or coalesce(new.state->>'turnNumber','') <> coalesce(old.state->>'turnNumber','')
    or (old.state->'lastRoll' is not null and old.state->'lastRoll' <> 'null'::jsonb
      and (new.state->'lastRoll' is null or new.state->'lastRoll' = 'null'::jsonb))
  then v_reset := true; end if;
  if v_reset or new.turn_deadline_at is null then
    new.turn_deadline_at := now() + interval '15 seconds';
    new.state := jsonb_set(new.state, '{turnDeadlineAt}', to_jsonb(new.turn_deadline_at), true);
  end if;
  return new;
end; $$;
drop trigger if exists ludo_game_turn_deadline on public.game_sessions;
create trigger ludo_game_turn_deadline before insert or update of state on public.game_sessions
for each row execute function private.ludo_set_turn_deadline();

create or replace function private.ludo_expire_turn(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room_id uuid; v_user uuid := auth.uid(); v_state jsonb; v_order jsonb;
  v_current integer; v_next integer; v_deadline timestamptz;
begin
  if v_user is null then raise exception 'Connecte-toi pour continuer.'; end if;
  select r.id into v_room_id from public.rooms r join public.room_players rp
    on rp.room_id = r.id and rp.user_id = v_user
    where r.code = upper(trim(p_code)) and r.game_type = 'ludo' and r.status = 'playing';
  if v_room_id is null then raise exception 'Tu ne fais pas partie de cette partie.'; end if;
  select gs.state, gs.turn_deadline_at into v_state, v_deadline
    from public.game_sessions gs where gs.room_id = v_room_id for update;
  if v_state is null or v_deadline is null or now() < v_deadline then return coalesce(v_state, '{}'::jsonb); end if;
  if v_state->>'winner' is not null and v_state->>'winner' <> 'null' then return v_state; end if;
  v_order := v_state->'playerOrder'; v_current := (v_state->>'currentPlayer')::integer;
  v_next := (v_current + 1) % jsonb_array_length(v_order);
  v_state := jsonb_set(v_state, '{currentPlayer}', to_jsonb(v_next));
  v_state := jsonb_set(v_state, '{lastRoll}', 'null'::jsonb);
  v_state := jsonb_set(v_state, '{consecutiveSixes}', '0'::jsonb);
  v_state := jsonb_set(v_state, '{turnNumber}', to_jsonb((v_state->>'turnNumber')::integer + 1));
  v_state := jsonb_set(v_state, '{lastTurnTimedOut}', to_jsonb(v_order->>v_current));
  update public.game_sessions set state = v_state, current_turn_user_id = (v_order->>v_next)::uuid, updated_at = now()
    where room_id = v_room_id returning state into v_state;
  return v_state;
end; $$;
create or replace function public.ludo_expire_turn(p_code text)
returns jsonb language sql set search_path = '' as $$ select private.ludo_expire_turn(p_code); $$;

create or replace function private.ludo_send_chat(p_code text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_room_id uuid; v_message public.ludo_chat_messages%rowtype;
  v_body text := btrim(p_body); v_username text;
begin
  if v_user is null then raise exception 'Connecte-toi pour envoyer un message.'; end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 120 then
    raise exception 'Le message doit contenir entre 1 et 120 caractères.';
  end if;
  select r.id into v_room_id from public.rooms r join public.room_players rp
    on rp.room_id = r.id and rp.user_id = v_user
    where r.code = upper(trim(p_code)) and r.game_type = 'ludo';
  if v_room_id is null then raise exception 'Tu ne fais pas partie de cette salle.'; end if;
  insert into public.ludo_chat_messages(room_id, user_id, body) values(v_room_id, v_user, v_body) returning * into v_message;
  select coalesce(p.username, p.display_name, 'Joueur') into v_username from public.profiles p where p.id = v_user;
  return jsonb_build_object('id',v_message.id,'body',v_message.body,'userId',v_user,
    'username',coalesce(v_username,'Joueur'),'createdAt',v_message.created_at);
end; $$;
create or replace function public.ludo_send_chat(p_code text, p_body text)
returns jsonb language sql set search_path = '' as $$ select private.ludo_send_chat(p_code,p_body); $$;

create or replace function private.ludo_chat_history(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_room_id uuid; v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Connecte-toi pour consulter le chat.'; end if;
  select r.id into v_room_id from public.rooms r join public.room_players rp
    on rp.room_id = r.id and rp.user_id = v_user
    where r.code = upper(trim(p_code)) and r.game_type = 'ludo';
  if v_room_id is null then raise exception 'Tu ne fais pas partie de cette salle.'; end if;
  select coalesce(jsonb_agg(message order by created_at), '[]'::jsonb) into v_result from (
    select jsonb_build_object('id',m.id,'body',m.body,'userId',m.user_id,
      'username',coalesce(p.username,p.display_name,'Joueur'),'createdAt',m.created_at) as message,m.created_at
    from public.ludo_chat_messages m left join public.profiles p on p.id=m.user_id
    where m.room_id=v_room_id order by m.created_at desc limit 40
  ) recent;
  return v_result;
end; $$;
create or replace function public.ludo_chat_history(p_code text)
returns jsonb language sql set search_path = '' as $$ select private.ludo_chat_history(p_code); $$;

revoke all on function private.ludo_expire_turn(text) from public, anon, authenticated;
revoke all on function private.ludo_send_chat(text,text) from public, anon, authenticated;
revoke all on function private.ludo_chat_history(text) from public, anon, authenticated;
grant execute on function private.ludo_expire_turn(text) to authenticated;
grant execute on function private.ludo_send_chat(text,text) to authenticated;
grant execute on function private.ludo_chat_history(text) to authenticated;
grant execute on function public.ludo_expire_turn(text) to authenticated;
grant execute on function public.ludo_send_chat(text,text) to authenticated;
grant execute on function public.ludo_chat_history(text) to authenticated;
do $$ begin alter publication supabase_realtime add table public.ludo_chat_messages;
exception when duplicate_object then null; end; $$;
