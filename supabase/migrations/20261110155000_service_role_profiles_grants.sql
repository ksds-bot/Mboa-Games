-- Allow the trusted player-auth Edge Function service role to manage player profiles.
-- The service-role key remains server-side only; clients retain their existing RLS grants.
grant select, insert, update, delete on table public.profiles to service_role;
