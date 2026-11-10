-- Shared Mboa Games player dashboard data.
-- Wallet balances are read-only to players; trusted server functions own all writes.
create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points_balance bigint not null default 0 check (points_balance >= 0),
  tokens_balance bigint not null default 0 check (tokens_balance >= 0),
  cash_balance_xaf bigint not null default 0 check (cash_balance_xaf >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_game_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_type text not null check (char_length(game_type) between 1 and 60),
  outcome text not null check (outcome in ('won', 'lost', 'draw', 'abandoned')),
  score integer not null default 0,
  points_delta integer not null default 0,
  tokens_delta integer not null default 0,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.player_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text not null check (asset in ('points', 'tokens', 'cash_xaf')),
  direction text not null check (direction in ('credit', 'debit')),
  amount bigint not null check (amount > 0),
  balance_after bigint not null check (balance_after >= 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'rejected')),
  description text not null default '',
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists player_game_history_user_created_idx on public.player_game_history (user_id, created_at desc);
create index if not exists player_game_history_user_outcome_idx on public.player_game_history (user_id, outcome);
create index if not exists player_wallet_transactions_user_created_idx on public.player_wallet_transactions (user_id, created_at desc);

alter table public.player_wallets enable row level security;
alter table public.player_game_history enable row level security;
alter table public.player_wallet_transactions enable row level security;

revoke all on table public.player_wallets from public, anon, authenticated;
revoke all on table public.player_game_history from public, anon, authenticated;
revoke all on table public.player_wallet_transactions from public, anon, authenticated;

grant select on table public.player_wallets to authenticated;
grant select on table public.player_game_history to authenticated;
grant select on table public.player_wallet_transactions to authenticated;

grant all on table public.player_wallets to service_role;
grant all on table public.player_game_history to service_role;
grant all on table public.player_wallet_transactions to service_role;

create policy "Players read their own wallet" on public.player_wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players read their own game history" on public.player_game_history for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players read their own wallet transactions" on public.player_wallet_transactions for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.mboa_create_player_wallet()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.player_wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.mboa_create_player_wallet() from public, anon, authenticated;

drop trigger if exists on_profile_created_wallet on public.profiles;
create trigger on_profile_created_wallet after insert on public.profiles
for each row execute function public.mboa_create_player_wallet();

insert into public.player_wallets (user_id) select id from public.profiles on conflict (user_id) do nothing;
