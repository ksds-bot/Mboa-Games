alter table public.profiles add column if not exists must_change_credentials boolean not null default false;

update public.profiles p
set must_change_credentials = true
from private.admin_user_roles r
join private.admin_roles ar on ar.role_key = r.role_key
where r.user_id = p.id
  and p.username = 'karl21'
  and ar.role_key = 'super_admin';
