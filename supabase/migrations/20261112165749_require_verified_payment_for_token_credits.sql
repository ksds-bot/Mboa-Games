create or replace function private.admin_adjust_balance(p_user_id uuid,p_asset text,p_amount bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_permission text; v_balance bigint; v_new_balance bigint; v_description text; v_gifts_enabled boolean;
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 if p_asset not in ('points','tokens') then raise exception 'Actif inconnu.'; end if;
 if p_asset='tokens' and p_amount>0 then raise exception 'Un crédit de jetons doit obligatoirement passer par la vérification du paiement et sa référence.'; end if;
 v_permission:=case when p_asset='points' then 'wallet.points.adjust' else 'wallet.tokens.adjust' end;
 if not private.admin_has_permission(v_permission) then raise exception 'Permission financière refusée.'; end if;
 if p_amount=0 or abs(p_amount)>1000000 then raise exception 'Le montant doit être compris entre 1 et 1 000 000.'; end if;
 if char_length(btrim(coalesce(p_reason,'')))<5 or char_length(p_reason)>180 then raise exception 'Indique un motif de 5 à 180 caractères.'; end if;
 if p_amount>0 and p_asset='points' then
  select (value #>> '{}')::boolean into v_gifts_enabled from private.admin_settings where setting_key='wallet.points.gifts_enabled';
  if coalesce(v_gifts_enabled,false)=false then raise exception 'Les ajustements positifs de points sont désactivés.'; end if;
 end if;
 insert into public.player_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select case when p_asset='points' then points_balance else tokens_balance end into v_balance from public.player_wallets where user_id=p_user_id for update;
 v_new_balance:=v_balance+p_amount;
 if v_new_balance<0 then raise exception 'Solde insuffisant pour effectuer cette correction.'; end if;
 if p_asset='points' then update public.player_wallets set points_balance=v_new_balance,updated_at=now() where user_id=p_user_id;
 else update public.player_wallets set tokens_balance=v_new_balance,updated_at=now() where user_id=p_user_id; end if;
 v_description:=case when p_asset='points' then 'Ajustement progression administrateur : ' else 'Correction jetons administrateur : ' end||btrim(p_reason);
 insert into public.player_wallet_transactions(user_id,asset,direction,amount,balance_after,status,description)
 values(p_user_id,p_asset,case when p_amount>0 then 'credit' else 'debit' end,abs(p_amount),v_new_balance,'completed',v_description);
 insert into private.admin_audit_logs(actor_id,action,target_user_id,entity_type,entity_id,details)
 values(auth.uid(),'wallet.adjust',p_user_id,'wallet',p_asset,jsonb_build_object('amount',p_amount,'balanceAfter',v_new_balance,'reason',btrim(p_reason)));
 return jsonb_build_object('userId',p_user_id,'asset',p_asset,'balance',v_new_balance);
end; $$;
revoke all on function private.admin_adjust_balance(uuid,text,bigint,text) from public,anon;
grant execute on function private.admin_adjust_balance(uuid,text,bigint,text) to authenticated;
