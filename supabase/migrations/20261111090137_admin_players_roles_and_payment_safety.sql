create or replace function private.admin_list_players(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.admin_has_permission('users.read') then raise exception 'Permission joueurs refusée.'; end if;
 select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_result from (
 select jsonb_build_object('id',p.id,'username',coalesce(p.username,p.display_name,'Joueur'),'displayName',p.display_name,'createdAt',p.created_at,'points',coalesce(w.points_balance,0),'tokens',coalesce(w.tokens_balance,0),'cashXaf',coalesce(w.cash_balance_xaf,0),'roles',coalesce((select jsonb_agg(ur.role_key order by ur.role_key) from private.admin_user_roles ur where ur.user_id=p.id),'[]'::jsonb)) row_data,p.created_at
 from public.profiles p left join public.player_wallets w on w.user_id=p.id
 where coalesce(p.username,'') ilike '%'||coalesce(p_search,'')||'%' or coalesce(p.display_name,'') ilike '%'||coalesce(p_search,'')||'%'
 order by p.created_at desc limit 100
 ) players; return v_result;
end; $$;
create or replace function private.admin_update_setting(p_key text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_category text; v_permission text; v_editable boolean;
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 select category,editable into v_category,v_editable from private.admin_settings where setting_key=p_key;
 if v_category is null or not v_editable then raise exception 'Paramètre inconnu ou verrouillé pour sécurité.'; end if;
 v_permission:=case v_category when 'payments' then 'payments.settings.manage' when 'games' then 'games.settings.manage' when 'wallet' then 'wallet.settings.manage' else 'settings.manage' end;
 if not private.admin_has_permission(v_permission) then raise exception 'Permission de configuration refusée.'; end if;
 if p_key in ('payments.enabled','payments.deposits_enabled','payments.withdrawals_enabled') and p_value='true'::jsonb then raise exception 'Les paiements réels restent verrouillés jusqu’à l’intégration et la validation du prestataire.'; end if;
 if pg_column_size(p_value)>4096 then raise exception 'Valeur de paramètre trop volumineuse.'; end if;
 update private.admin_settings set value=p_value,updated_by=auth.uid(),updated_at=now() where setting_key=p_key;
 insert into private.admin_audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'setting.update','setting',p_key,jsonb_build_object('value',p_value));
 return jsonb_build_object('key',p_key,'value',p_value);
end; $$;
revoke all on function private.admin_list_players(text) from public,anon;
revoke all on function private.admin_update_setting(text,jsonb) from public,anon;
grant execute on function private.admin_list_players(text) to authenticated;
grant execute on function private.admin_update_setting(text,jsonb) to authenticated;
