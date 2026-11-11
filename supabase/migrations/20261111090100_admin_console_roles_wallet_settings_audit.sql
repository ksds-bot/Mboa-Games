create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.admin_roles (
 role_key text primary key, label text not null, description text not null default '',
 permissions text[] not null default '{}', is_system boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists private.admin_user_roles (
 user_id uuid not null references auth.users(id) on delete cascade,
 role_key text not null references private.admin_roles(role_key) on delete restrict,
 granted_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 primary key(user_id,role_key)
);
create table if not exists private.admin_settings (
 setting_key text primary key, category text not null, label text not null, description text not null default '',
 value jsonb not null, editable boolean not null default true, updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table if not exists private.admin_audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
 action text not null, target_user_id uuid references auth.users(id) on delete set null, entity_type text not null,
 entity_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists admin_user_roles_user_idx on private.admin_user_roles(user_id);
create index if not exists admin_audit_logs_created_idx on private.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_target_idx on private.admin_audit_logs(target_user_id,created_at desc);
alter table private.admin_roles enable row level security;
alter table private.admin_user_roles enable row level security;
alter table private.admin_settings enable row level security;
alter table private.admin_audit_logs enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;

insert into private.admin_roles(role_key,label,description,permissions) values
('super_admin','Super administrateur','Tous les droits, y compris la gestion des rôles.',array['*']),
('operations_admin','Administrateur opérations','Gestion des joueurs, parties, paramètres généraux et modération.',array['dashboard.read','users.read','users.manage','games.read','games.manage','settings.read','settings.manage','chat.moderate','audit.read']),
('finance_admin','Administrateur finances','Gestion des points cadeaux, jetons et paramètres financiers.',array['dashboard.read','users.read','wallet.read','wallet.points.adjust','wallet.tokens.adjust','wallet.settings.manage','payments.read','payments.settings.manage','audit.read']),
('game_admin','Gestionnaire des jeux','Configuration des jeux et suivi des parties.',array['dashboard.read','games.read','games.manage','games.settings.manage','settings.read','audit.read']),
('support_admin','Support joueurs','Consultation des comptes et assistance.',array['dashboard.read','users.read','chat.moderate']),
('moderator','Modérateur','Modération du chat et signalements.',array['dashboard.read','chat.moderate']),
('analyst','Analyste','Consultation des indicateurs et journaux.',array['dashboard.read','analytics.read','audit.read'])
on conflict(role_key) do update set label=excluded.label,description=excluded.description,permissions=excluded.permissions;

insert into private.admin_settings(setting_key,category,label,description,value) values
('site.maintenance_mode','general','Mode maintenance','Bloquer temporairement les nouvelles sessions de jeu.','false'::jsonb),
('games.ludo.enabled','games','Ludo activé','Autoriser la création de nouvelles parties Ludo.','true'::jsonb),
('games.ludo.max_players','games','Joueurs maximum Ludo','Limite actuelle du moteur Ludo (4 tant que le plateau 8 joueurs n’est pas validé).','4'::jsonb),
('games.ludo.turn_seconds','games','Durée d’un tour Ludo','Durée en secondes avant passage automatique du tour.','15'::jsonb),
('wallet.points.gifts_enabled','wallet','Cadeaux de points activés','Autoriser les administrateurs habilités à offrir des points.','true'::jsonb),
('wallet.tokens.gifts_enabled','wallet','Cadeaux de jetons activés','Autoriser les administrateurs habilités à offrir des jetons de courtoisie.','true'::jsonb),
('payments.enabled','payments','Paiements activés','Désactivé tant que le prestataire et les contrôles ne sont pas validés.','false'::jsonb),
('payments.provider','payments','Prestataire de paiement','Aucun prestataire configuré.','"none"'::jsonb),
('payments.currency','payments','Devise','Devise de référence des paiements.','"XAF"'::jsonb),
('payments.deposits_enabled','payments','Dépôts activés','Dépôts réels désactivés par défaut.','false'::jsonb),
('payments.withdrawals_enabled','payments','Retraits activés','Retraits réels désactivés par défaut.','false'::jsonb)
on conflict(setting_key) do nothing;

create or replace function private.admin_has_permission(p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from private.admin_user_roles ur join private.admin_roles r on r.role_key=ur.role_key where ur.user_id=(select auth.uid()) and ('*'=any(r.permissions) or p_permission=any(r.permissions))); $$;

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

create or replace function private.admin_list_audit_logs(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.admin_has_permission('audit.read') then raise exception 'Permission journal refusée.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actor',coalesce(p.username,p.display_name,'Administrateur'),'targetUserId',a.target_user_id,'entityType',a.entity_type,'entityId',a.entity_id,'details',a.details,'createdAt',a.created_at) order by a.created_at desc),'[]'::jsonb)
 into v_result from (select * from private.admin_audit_logs order by created_at desc limit greatest(1,least(coalesce(p_limit,50),100))) a left join public.profiles p on p.id=a.actor_id;
 return v_result;
end; $$;

create or replace function private.admin_set_user_role(p_user_id uuid,p_role_key text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if auth.uid() is null or not private.admin_has_permission('roles.manage') then raise exception 'Seul le super administrateur peut gérer les rôles.'; end if;
 if p_role_key not in (select role_key from private.admin_roles) then raise exception 'Rôle inconnu.'; end if;
 if p_role_key='super_admin' and not p_enabled then
  select count(*) into v_count from private.admin_user_roles where role_key='super_admin';
  if exists(select 1 from private.admin_user_roles where user_id=p_user_id and role_key='super_admin') and v_count<=1 then raise exception 'Impossible de retirer le dernier super administrateur.'; end if;
 end if;
 if p_enabled then insert into private.admin_user_roles(user_id,role_key,granted_by) values(p_user_id,p_role_key,auth.uid()) on conflict do nothing;
 else delete from private.admin_user_roles where user_id=p_user_id and role_key=p_role_key; end if;
 insert into private.admin_audit_logs(actor_id,action,target_user_id,entity_type,entity_id,details) values(auth.uid(),case when p_enabled then 'role.grant' else 'role.revoke' end,p_user_id,'role',p_role_key,'{}'::jsonb);
 return jsonb_build_object('userId',p_user_id,'role',p_role_key,'enabled',p_enabled);
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

create or replace function public.admin_console_snapshot() returns jsonb language sql set search_path='' as $$ select private.admin_console_snapshot(); $$;
create or replace function public.admin_list_players(p_search text default '') returns jsonb language sql set search_path='' as $$ select private.admin_list_players(p_search); $$;
create or replace function public.admin_adjust_balance(p_user_id uuid,p_asset text,p_amount bigint,p_reason text) returns jsonb language sql set search_path='' as $$ select private.admin_adjust_balance(p_user_id,p_asset,p_amount,p_reason); $$;
create or replace function public.admin_update_setting(p_key text,p_value jsonb) returns jsonb language sql set search_path='' as $$ select private.admin_update_setting(p_key,p_value); $$;
create or replace function public.admin_list_audit_logs(p_limit integer default 50) returns jsonb language sql set search_path='' as $$ select private.admin_list_audit_logs(p_limit); $$;
create or replace function public.admin_set_user_role(p_user_id uuid,p_role_key text,p_enabled boolean) returns jsonb language sql set search_path='' as $$ select private.admin_set_user_role(p_user_id,p_role_key,p_enabled); $$;
revoke all on function public.admin_console_snapshot() from public,anon;
revoke all on function public.admin_list_players(text) from public,anon;
revoke all on function public.admin_adjust_balance(uuid,text,bigint,text) from public,anon;
revoke all on function public.admin_update_setting(text,jsonb) from public,anon;
revoke all on function public.admin_list_audit_logs(integer) from public,anon;
revoke all on function public.admin_set_user_role(uuid,text,boolean) from public,anon;
grant execute on function public.admin_console_snapshot() to authenticated;
grant execute on function public.admin_list_players(text) to authenticated;
grant execute on function public.admin_adjust_balance(uuid,text,bigint,text) to authenticated;
grant execute on function public.admin_update_setting(text,jsonb) to authenticated;
grant execute on function public.admin_list_audit_logs(integer) to authenticated;
grant execute on function public.admin_set_user_role(uuid,text,boolean) to authenticated;
