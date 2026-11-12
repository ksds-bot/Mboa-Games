create or replace function private.admin_list_players(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.admin_has_permission('users.read') then raise exception 'Permission joueurs refusée.'; end if;
 select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_result from (
  select jsonb_build_object('id',p.id,'username',coalesce(p.username,p.display_name,'Joueur'),'displayName',p.display_name,'createdAt',p.created_at,'points',coalesce(w.points_balance,0),'tokens',coalesce(w.tokens_balance,0),'roles',coalesce((select jsonb_agg(ur.role_key order by ur.role_key) from private.admin_user_roles ur where ur.user_id=p.id),'[]'::jsonb)) row_data,p.created_at
  from public.profiles p left join public.player_wallets w on w.user_id=p.id
  where coalesce(p.username,'') ilike '%'||coalesce(p_search,'')||'%' or coalesce(p.display_name,'') ilike '%'||coalesce(p_search,'')||'%'
  order by p.created_at desc limit 100
 ) players; return v_result;
end; $$;
revoke all on function private.admin_list_players(text) from public,anon;
grant execute on function private.admin_list_players(text) to authenticated;
alter table public.player_wallets drop column cash_balance_xaf;
