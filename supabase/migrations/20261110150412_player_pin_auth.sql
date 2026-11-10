create table if not exists public.player_auth_attempts (
  attempt_key text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.player_auth_attempts enable row level security;
revoke all on table public.player_auth_attempts from public, anon, authenticated;
grant all on table public.player_auth_attempts to service_role;

create or replace function public.mboa_take_auth_attempt(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
  v_window_started_at timestamptz;
  v_locked_until timestamptz;
begin
  if p_key is null or length(p_key) < 1 or length(p_key) > 160 then
    return false;
  end if;

  insert into public.player_auth_attempts (attempt_key)
  values (p_key)
  on conflict (attempt_key) do nothing;

  select attempts, window_started_at, locked_until
    into v_attempts, v_window_started_at, v_locked_until
    from public.player_auth_attempts
    where attempt_key = p_key
    for update;

  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;

  if v_window_started_at < now() - interval '30 minutes' then
    update public.player_auth_attempts
      set attempts = 1, window_started_at = now(), locked_until = null, updated_at = now()
      where attempt_key = p_key;
    return true;
  end if;

  if v_attempts >= 5 then
    update public.player_auth_attempts
      set locked_until = now() + interval '30 minutes', updated_at = now()
      where attempt_key = p_key;
    return false;
  end if;

  update public.player_auth_attempts
    set attempts = v_attempts + 1, updated_at = now()
    where attempt_key = p_key;

  return true;
end;
$$;

create or replace function public.mboa_reset_auth_attempts(p_key text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.player_auth_attempts where attempt_key = p_key;
$$;

revoke all on function public.mboa_take_auth_attempt(text) from public, anon, authenticated;
revoke all on function public.mboa_reset_auth_attempts(text) from public, anon, authenticated;
grant execute on function public.mboa_take_auth_attempt(text) to service_role;
grant execute on function public.mboa_reset_auth_attempts(text) to service_role;
