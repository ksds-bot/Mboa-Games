-- Mboa Games: first application schema.
-- Every exposed table has RLS enabled. Game state writes are intentionally
-- server-only until authoritative move validation is implemented.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default 'Joueur',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (username is null or char_length(username) between 3 and 20),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 40)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game_type text not null check (game_type in ('ludo', 'damier', 'quiz', 'adages')),
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  max_players smallint not null default 4 check (max_players between 2 and 8),
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_code_format check (code ~ '^[A-Z0-9]{4,10}$')
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat smallint,
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  current_turn_user_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint chat_content_length check (char_length(content) between 1 and 500)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null check (game_type in ('ludo', 'damier', 'quiz', 'adages')),
  points integer not null default 0,
  result text not null check (result in ('win', 'loss', 'draw')),
  created_at timestamptz not null default now()
);

create index if not exists rooms_code_idx on public.rooms(code);
create index if not exists rooms_status_created_idx on public.rooms(status, created_at desc);
create index if not exists room_players_user_idx on public.room_players(user_id);
create index if not exists chat_messages_room_created_idx on public.chat_messages(room_id, created_at);
create index if not exists scores_user_game_created_idx on public.scores(user_id, game_type, created_at desc);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.scores enable row level security;

-- Profiles: authenticated players can view profiles; each player edits only theirs.
drop policy if exists "Profiles are visible to authenticated players" on public.profiles;
create policy "Profiles are visible to authenticated players"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Players create their own profile" on public.profiles;
create policy "Players create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Players update their own profile" on public.profiles;
create policy "Players update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Rooms are visible only to their members and their host.
drop policy if exists "Room members can view their rooms" on public.rooms;
create policy "Room members can view their rooms"
  on public.rooms for select to authenticated
  using (
    host_id = (select auth.uid())
    or exists (
      select 1 from public.room_players rp
      where rp.room_id = rooms.id and rp.user_id = (select auth.uid())
    )
  );

drop policy if exists "Players create rooms as host" on public.rooms;
create policy "Players create rooms as host"
  on public.rooms for insert to authenticated
  with check (host_id = (select auth.uid()));

drop policy if exists "Hosts update their rooms" on public.rooms;
create policy "Hosts update their rooms"
  on public.rooms for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

-- Membership is private to room participants. A user can only add themselves.
drop policy if exists "Room participants can view membership" on public.room_players;
create policy "Players can view their own membership"
  on public.room_players for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Players join as themselves" on public.room_players;
create policy "Players join as themselves"
  on public.room_players for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Players leave their own rooms" on public.room_players;
create policy "Players leave their own rooms"
  on public.room_players for delete to authenticated
  using (user_id = (select auth.uid()));

-- Session state can be read by room members. Writes will be handled by trusted
-- server-side game logic, not directly by browser clients.
drop policy if exists "Room members read game sessions" on public.game_sessions;
create policy "Room members read game sessions"
  on public.game_sessions for select to authenticated
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = game_sessions.room_id and rp.user_id = (select auth.uid())
    )
  );

drop policy if exists "Room members read chat" on public.chat_messages;
create policy "Room members read chat"
  on public.chat_messages for select to authenticated
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = chat_messages.room_id and rp.user_id = (select auth.uid())
    )
  );

drop policy if exists "Players send chat as themselves" on public.chat_messages;
create policy "Players send chat as themselves"
  on public.chat_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_players rp
      where rp.room_id = chat_messages.room_id and rp.user_id = (select auth.uid())
    )
  );

-- Scores are readable for authenticated leaderboards; only trusted server code writes.
drop policy if exists "Authenticated players view scores" on public.scores;
create policy "Authenticated players view scores"
  on public.scores for select to authenticated using (true);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.rooms to authenticated;
grant select, insert, delete on public.room_players to authenticated;
grant select on public.game_sessions to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select on public.scores to authenticated;

-- Enable Realtime for room activity and chat. Game state will be broadcast only
-- after server-side move validation is in place.
do $$
begin
  alter publication supabase_realtime add table public.room_players;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;
