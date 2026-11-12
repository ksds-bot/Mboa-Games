alter table private.manual_token_credits add column if not exists paid_amount_xaf bigint not null default 0 check(paid_amount_xaf >= 0);
drop function private.admin_credit_tokens_after_payment(uuid,bigint,text,text,text);
drop function public.admin_credit_tokens_after_payment(uuid,bigint,text,text,text);
create or replace function private.admin_credit_tokens_after_payment(p_user_id uuid,p_amount bigint,p_paid_amount_xaf bigint,p_provider text,p_reference text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_balance bigint; v_new_balance bigint; v_credit_id uuid;
begin
 if auth.uid() is null or not private.admin_has_permission('wallet.tokens.adjust') then raise exception 'Permission de crédit des jetons refusée.'; end if;
 if p_amount is null or p_amount<1 or p_amount>1000000 then raise exception 'Montant de jetons invalide.'; end if;
 if p_paid_amount_xaf is null or p_paid_amount_xaf<1 or p_paid_amount_xaf>100000000 then raise exception 'Montant reçu en FCFA invalide.'; end if;
 if p_provider not in ('orange_money','mtn_momo','other') then raise exception 'Opérateur de paiement invalide.'; end if;
 if char_length(btrim(coalesce(p_reference,'')))<4 or char_length(p_reference)>120 then raise exception 'Référence du paiement obligatoire (4 à 120 caractères).'; end if;
 if char_length(coalesce(p_note,''))>180 then raise exception 'Note trop longue.'; end if;
 insert into private.manual_token_credits(user_id,amount,paid_amount_xaf,provider,payment_reference,note,verified_by)
 values(p_user_id,p_amount,p_paid_amount_xaf,p_provider,btrim(p_reference),btrim(coalesce(p_note,'')),auth.uid()) returning id into v_credit_id;
 insert into public.player_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select tokens_balance into v_balance from public.player_wallets where user_id=p_user_id for update;
 v_new_balance:=v_balance+p_amount;
 update public.player_wallets set tokens_balance=v_new_balance,updated_at=now() where user_id=p_user_id;
 insert into public.player_wallet_transactions(user_id,asset,direction,amount,balance_after,status,description,reference)
 values(p_user_id,'tokens','credit',p_amount,v_new_balance,'completed','Recharge manuelle vérifiée · '||p_provider,'manual-topup:'||v_credit_id::text);
 insert into private.admin_audit_logs(actor_id,action,target_user_id,entity_type,entity_id,details)
 values(auth.uid(),'wallet.tokens.manual_credit',p_user_id,'manual_token_credit',v_credit_id::text,jsonb_build_object('tokens',p_amount,'paidAmountXaf',p_paid_amount_xaf,'provider',p_provider,'paymentReference',btrim(p_reference),'balanceAfter',v_new_balance));
 return jsonb_build_object('id',v_credit_id,'userId',p_user_id,'tokensBalance',v_new_balance);
end; $$;
create or replace function public.admin_credit_tokens_after_payment(p_user_id uuid,p_amount bigint,p_paid_amount_xaf bigint,p_provider text,p_reference text,p_note text default '')
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_credit_tokens_after_payment(p_user_id,p_amount,p_paid_amount_xaf,p_provider,p_reference,p_note); $$;
revoke all on function private.admin_credit_tokens_after_payment(uuid,bigint,bigint,text,text,text) from public,anon;
grant execute on function private.admin_credit_tokens_after_payment(uuid,bigint,bigint,text,text,text) to authenticated;
revoke all on function public.admin_credit_tokens_after_payment(uuid,bigint,bigint,text,text,text) from public,anon;
grant execute on function public.admin_credit_tokens_after_payment(uuid,bigint,bigint,text,text,text) to authenticated;
