-- Keep SECURITY DEFINER game logic outside the exposed Data API schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.is_ludo_room_member(uuid) set schema private;
alter function public.ludo_create_room(smallint) set schema private;
alter function public.ludo_join_room(text) set schema private;
alter function public.ludo_set_ready(text,boolean) set schema private;
alter function public.ludo_room_snapshot(text) set schema private;
alter function public.ludo_start_room(text) set schema private;
alter function public.ludo_roll(text) set schema private;
alter function public.ludo_move(text,integer) set schema private;

grant execute on function private.is_ludo_room_member(uuid) to authenticated;
grant execute on function private.ludo_create_room(smallint) to authenticated;
grant execute on function private.ludo_join_room(text) to authenticated;
grant execute on function private.ludo_set_ready(text,boolean) to authenticated;
grant execute on function private.ludo_room_snapshot(text) to authenticated;
grant execute on function private.ludo_start_room(text) to authenticated;
grant execute on function private.ludo_roll(text) to authenticated;
grant execute on function private.ludo_move(text,integer) to authenticated;

drop policy if exists "Room members can view all seats" on public.room_players;
create policy "Room members can view all seats"
on public.room_players for select to authenticated
using (private.is_ludo_room_member(room_id));

create or replace function public.ludo_create_room(p_max_players smallint default 4)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.ludo_create_room(p_max_players); $$;
create or replace function public.ludo_join_room(p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.ludo_join_room(p_code); $$;
create or replace function public.ludo_set_ready(p_code text,p_ready boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select private.ludo_set_ready(p_code,p_ready); $$;
create or replace function public.ludo_room_snapshot(p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.ludo_room_snapshot(p_code); $$;
create or replace function public.ludo_start_room(p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.ludo_start_room(p_code); $$;
create or replace function public.ludo_roll(p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.ludo_roll(p_code); $$;
create or replace function public.ludo_move(p_code text,p_token_index integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.ludo_move(p_code,p_token_index); $$;

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
