update private.admin_roles set permissions=array_append(permissions,'wallet.settings.manage') where role_key='finance_admin' and not ('wallet.settings.manage'=any(permissions));
update private.admin_settings set editable=false where setting_key in ('payments.enabled','payments.deposits_enabled','payments.withdrawals_enabled');
insert into private.admin_settings(setting_key,category,label,description,value,editable)
values('payments.integration_verified','payments','Intégration vérifiée','État technique de validation du prestataire de paiement. Modifiable uniquement après intégration serveur.','false'::jsonb,false)
on conflict(setting_key) do nothing;
create or replace function private.admin_console_snapshot()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
 if v_user is null or not private.admin_has_permission('dashboard.read') then raise exception 'Accès administrateur refusé.'; end if;
 select jsonb_build_object(
 'roles',coalesce((select jsonb_agg(jsonb_build_object('key',r.role_key,'label',r.label,'description',r.description,'permissions',r.permissions) order by r.label) from private.admin_user_roles ur join private.admin_roles r on r.role_key=ur.role_key where ur.user_id=v_user),'[]'::jsonb),
 'permissions',coalesce((select jsonb_agg(distinct perm.permission) from private.admin_user_roles ur join private.admin_roles r on r.role_key=ur.role_key cross join lateral unnest(r.permissions) as perm(permission) where ur.user_id=v_user),'[]'::jsonb),
 'roleCatalog',case when private.admin_has_permission('roles.manage') then coalesce((select jsonb_agg(jsonb_build_object('key',role_key,'label',label,'description',description,'permissions',permissions) order by label) from private.admin_roles),'[]'::jsonb) else '[]'::jsonb end,
 'summary',jsonb_build_object('players',(select count(*) from public.profiles),'rooms',(select count(*) from public.rooms),'active_rooms',(select count(*) from public.rooms where status='playing'),'points_in_circulation',(select coalesce(sum(points_balance),0) from public.player_wallets),'tokens_in_circulation',(select coalesce(sum(tokens_balance),0) from public.player_wallets)),
 'settings',coalesce((select jsonb_agg(jsonb_build_object('key',setting_key,'category',category,'label',label,'description',description,'value',value,'editable',editable) order by category,setting_key) from private.admin_settings where (category='general' and private.admin_has_permission('settings.read')) or (category='games' and (private.admin_has_permission('games.read') or private.admin_has_permission('games.settings.manage'))) or (category='wallet' and private.admin_has_permission('wallet.read')) or (category='payments' and private.admin_has_permission('payments.read'))),'[]'::jsonb)
 ) into v_result; return v_result;
end; $$;
create or replace function private.admin_adjust_balance(p_user_id uuid,p_asset text,p_amount bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_permission text; v_balance bigint; v_new_balance bigint; v_description text; v_gifts_enabled boolean;
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 if p_asset not in ('points','tokens') then raise exception 'Seuls les points et jetons cadeaux sont gérables ici.'; end if;
 v_permission:=case when p_asset='points' then 'wallet.points.adjust' else 'wallet.tokens.adjust' end;
 if not private.admin_has_permission(v_permission) then raise exception 'Permission financière refusée.'; end if;
 if p_amount=0 or abs(p_amount)>1000000 then raise exception 'Le montant doit être compris entre 1 et 1 000 000.'; end if;
 if char_length(btrim(coalesce(p_reason,'')))<5 or char_length(p_reason)>180 then raise exception 'Indique un motif de 5 à 180 caractères.'; end if;
 if p_amount>0 then
  select (value #>> '{}')::boolean into v_gifts_enabled from private.admin_settings where setting_key=case when p_asset='points' then 'wallet.points.gifts_enabled' else 'wallet.tokens.gifts_enabled' end;
  if coalesce(v_gifts_enabled,false)=false then raise exception 'Les cadeaux de cet actif sont désactivés dans les paramètres.'; end if;
 end if;
 insert into public.player_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select case when p_asset='points' then points_balance else tokens_balance end into v_balance from public.player_wallets where user_id=p_user_id for update;
 v_new_balance:=v_balance+p_amount; if v_new_balance<0 then raise exception 'Solde insuffisant pour effectuer cette correction.'; end if;
 if p_asset='points' then update public.player_wallets set points_balance=v_new_balance,updated_at=now() where user_id=p_user_id;
 else update public.player_wallets set tokens_balance=v_new_balance,updated_at=now() where user_id=p_user_id; end if;
 v_description:=case when p_amount>0 then 'Cadeau administrateur : ' else 'Correction administrateur : ' end||btrim(p_reason);
 insert into public.player_wallet_transactions(user_id,asset,direction,amount,balance_after,status,description) values(p_user_id,p_asset,case when p_amount>0 then 'credit' else 'debit' end,abs(p_amount),v_new_balance,'completed',v_description);
 insert into private.admin_audit_logs(actor_id,action,target_user_id,entity_type,entity_id,details) values(auth.uid(),'wallet.adjust',p_user_id,'wallet',p_asset,jsonb_build_object('amount',p_amount,'balanceAfter',v_new_balance,'reason',btrim(p_reason)));
 return jsonb_build_object('userId',p_user_id,'asset',p_asset,'balance',v_new_balance);
end; $$;
revoke all on function private.admin_has_permission(text) from public,anon;
revoke all on function private.admin_console_snapshot() from public,anon;
revoke all on function private.admin_list_players(text) from public,anon;
revoke all on function private.admin_adjust_balance(uuid,text,bigint,text) from public,anon;
revoke all on function private.admin_update_setting(text,jsonb) from public,anon;
revoke all on function private.admin_list_audit_logs(integer) from public,anon;
revoke all on function private.admin_set_user_role(uuid,text,boolean) from public,anon;
grant execute on function private.admin_has_permission(text) to authenticated;
grant execute on function private.admin_console_snapshot() to authenticated;
grant execute on function private.admin_list_players(text) to authenticated;
grant execute on function private.admin_adjust_balance(uuid,text,bigint,text) to authenticated;
grant execute on function private.admin_update_setting(text,jsonb) to authenticated;
grant execute on function private.admin_list_audit_logs(integer) to authenticated;
grant execute on function private.admin_set_user_role(uuid,text,boolean) to authenticated;
