-- Manual token top-ups, manual prize payout records and configurable wager commission.
create table if not exists private.manual_token_credits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 amount bigint not null check(amount > 0),
 provider text not null check(provider in ('orange_money','mtn_momo','other')),
 payment_reference text not null check(char_length(btrim(payment_reference)) between 4 and 120),
 note text not null default '',
 verified_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(provider,payment_reference)
);
create table if not exists private.manual_prize_payouts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 amount_xaf bigint not null check(amount_xaf > 0),
 provider text not null check(provider in ('orange_money','mtn_momo','other')),
 payment_reference text not null check(char_length(btrim(payment_reference)) between 4 and 120),
 game_type text not null,
 room_code text,
 note text not null default '',
 paid_by uuid not null references auth.users(id),
 paid_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(provider,payment_reference)
);
create table if not exists private.wager_commission_ledger (
 id uuid primary key default gen_random_uuid(),
 game_type text not null,
 room_id uuid not null references public.rooms(id) on delete restrict,
 gross_tokens bigint not null check(gross_tokens >= 0),
 commission_percent numeric(5,2) not null check(commission_percent between 0 and 25),
 commission_tokens bigint not null check(commission_tokens >= 0),
 winner_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(room_id)
);
alter table private.manual_token_credits enable row level security;
alter table private.manual_prize_payouts enable row level security;
alter table private.wager_commission_ledger enable row level security;
revoke all on table private.manual_token_credits,private.manual_prize_payouts,private.wager_commission_ledger from public,anon,authenticated;
insert into private.admin_settings(setting_key,category,label,description,value,editable)
values('wallet.wager.commission_percent','wallet','Commission sur les pots','Pourcentage retenu sur les pots de jetons gagnés. 0 désactive la commission.','0'::jsonb,true)
on conflict(setting_key) do nothing;

create or replace function private.admin_credit_tokens_after_payment(p_user_id uuid,p_amount bigint,p_provider text,p_reference text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_balance bigint; v_new_balance bigint; v_credit_id uuid;
begin
 if auth.uid() is null or not private.admin_has_permission('wallet.tokens.adjust') then raise exception 'Permission de crédit des jetons refusée.'; end if;
 if p_amount is null or p_amount<1 or p_amount>1000000 then raise exception 'Montant de jetons invalide.'; end if;
 if p_provider not in ('orange_money','mtn_momo','other') then raise exception 'Opérateur de paiement invalide.'; end if;
 if char_length(btrim(coalesce(p_reference,'')))<4 or char_length(p_reference)>120 then raise exception 'Référence du paiement obligatoire (4 à 120 caractères).'; end if;
 if char_length(coalesce(p_note,''))>180 then raise exception 'Note trop longue.'; end if;
 insert into private.manual_token_credits(user_id,amount,provider,payment_reference,note,verified_by)
 values(p_user_id,p_amount,p_provider,btrim(p_reference),btrim(coalesce(p_note,'')),auth.uid()) returning id into v_credit_id;
 insert into public.player_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select tokens_balance into v_balance from public.player_wallets where user_id=p_user_id for update;
 v_new_balance:=v_balance+p_amount;
 update public.player_wallets set tokens_balance=v_new_balance,updated_at=now() where user_id=p_user_id;
 insert into public.player_wallet_transactions(user_id,asset,direction,amount,balance_after,status,description,reference)
 values(p_user_id,'tokens','credit',p_amount,v_new_balance,'completed','Recharge manuelle vérifiée · '||p_provider,'manual-topup:'||v_credit_id::text);
 insert into private.admin_audit_logs(actor_id,action,target_user_id,entity_type,entity_id,details)
 values(auth.uid(),'wallet.tokens.manual_credit',p_user_id,'manual_token_credit',v_credit_id::text,jsonb_build_object('amount',p_amount,'provider',p_provider,'paymentReference',btrim(p_reference),'balanceAfter',v_new_balance));
 return jsonb_build_object('id',v_credit_id,'userId',p_user_id,'tokensBalance',v_new_balance);
end; $$;

create or replace function private.admin_record_manual_prize_payout(p_user_id uuid,p_amount_xaf bigint,p_provider text,p_reference text,p_game_type text,p_room_code text default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not private.admin_has_permission('wallet.tokens.adjust') then raise exception 'Permission de paiement des gagnants refusée.'; end if;
 if p_amount_xaf is null or p_amount_xaf<1 or p_amount_xaf>100000000 then raise exception 'Montant FCFA invalide.'; end if;
 if p_provider not in ('orange_money','mtn_momo','other') then raise exception 'Opérateur de paiement invalide.'; end if;
 if char_length(btrim(coalesce(p_reference,'')))<4 or char_length(p_reference)>120 then raise exception 'Référence du paiement obligatoire.'; end if;
 if char_length(coalesce(p_game_type,''))<1 or char_length(p_game_type)>60 then raise exception 'Jeu invalide.'; end if;
 insert into private.manual_prize_payouts(user_id,amount_xaf,provider,payment_reference,game_type,room_code,note,paid_by)
 values(p_user_id,p_amount_xaf,p_provider,btrim(p_reference),p_game_type,nullif(btrim(coalesce(p_room_code,'')),''),btrim(coalesce(p_note,'')),auth.uid()) returning id into v_id;
 insert into private.admin_audit_logs(actor_id,action,target_user_id,entity_type,entity_id,details)
 values(auth.uid(),'prize.manual_payout',p_user_id,'manual_prize_payout',v_id::text,jsonb_build_object('amountXaf',p_amount_xaf,'provider',p_provider,'paymentReference',btrim(p_reference),'gameType',p_game_type,'roomCode',p_room_code));
 return jsonb_build_object('id',v_id,'status','paid');
end; $$;
revoke all on function private.admin_credit_tokens_after_payment(uuid,bigint,text,text,text) from public,anon;
revoke all on function private.admin_record_manual_prize_payout(uuid,bigint,text,text,text,text,text) from public,anon;
grant execute on function private.admin_credit_tokens_after_payment(uuid,bigint,text,text,text) to authenticated;
grant execute on function private.admin_record_manual_prize_payout(uuid,bigint,text,text,text,text,text) to authenticated;

create or replace function private.ludo_move(p_code text,p_token_index integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms%rowtype; v_room_id uuid; v_user uuid:=auth.uid(); v_state jsonb; v_order jsonb; v_current integer; v_player uuid;
  v_roll integer; v_tokens jsonb; v_previous integer; v_next integer; v_square integer; v_safe boolean;
  v_opponent integer; v_other_token integer; v_other_progress integer; v_captured boolean:=false; v_winner boolean:=false; v_bonus boolean;
  v_track_length integer; v_route_end integer; v_goal integer; v_offset integer; v_stake integer; v_pot bigint;
  v_member uuid; v_member_index integer; v_balance bigint; v_commission_rate numeric(5,2):=0; v_commission bigint:=0; v_payout bigint:=0;
begin
  if p_token_index<0 or p_token_index>3 then raise exception 'Pion invalide.'; end if;
  select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo' and status='playing';
  if not found or v_user is null then raise exception 'Partie indisponible.'; end if;
  v_room_id:=v_room.id;
  select state into v_state from public.game_sessions where room_id=v_room_id for update;
  if v_state is null then raise exception 'État de partie introuvable.'; end if;
  v_order:=v_state->'playerOrder'; v_current:=(v_state->>'currentPlayer')::integer; v_player:=(v_order->>v_current)::uuid;
  if v_player<>v_user then raise exception 'Ce n’est pas ton tour.'; end if;
  if v_state->'lastRoll' is null or v_state->'lastRoll'='null'::jsonb then raise exception 'Lance le dé avant de déplacer un pion.'; end if;
  v_track_length:=coalesce((v_state->>'trackLength')::integer,52); v_route_end:=coalesce((v_state->>'routeEnd')::integer,50);
  v_goal:=coalesce((v_state->>'goalProgress')::integer,57); v_offset:=case when v_track_length=48 then v_current*6 else v_current*13 end;
  v_roll:=(v_state->>'lastRoll')::integer; v_tokens:=v_state->'tokens'; v_previous:=(v_tokens->v_current->>p_token_index)::integer;
  if not private.ludo_can_move(v_state,v_current,p_token_index,v_roll) then raise exception 'Ce pion ne peut pas avancer : chemin bloqué ou arrivée impossible.'; end if;
  v_next:=case when v_previous=-1 then 0 else v_previous+v_roll end;
  v_state:=jsonb_set(v_state,array['tokens',v_current::text,p_token_index::text],to_jsonb(v_next));
  if v_next<=v_route_end then
    v_square:=mod(v_offset+v_next,v_track_length);
    v_safe:=case when v_track_length=48 then v_square in (0,6,12,18,24,30,36,42) else v_square in (0,8,13,21,26,34,39,47) end;
    if not v_safe then
      for v_opponent in 0..jsonb_array_length(v_order)-1 loop
        if v_opponent<>v_current then
          for v_other_token in 0..3 loop
            v_other_progress:=(v_state->'tokens'->v_opponent->>v_other_token)::integer;
            if v_other_progress>=0 and v_other_progress<=v_route_end and mod((case when v_track_length=48 then v_opponent*6 else v_opponent*13 end)+v_other_progress,v_track_length)=v_square then
              v_state:=jsonb_set(v_state,array['tokens',v_opponent::text,v_other_token::text],'-1'::jsonb); v_captured:=true;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;
  select bool_and((value::text)::integer=v_goal) into v_winner from jsonb_array_elements(v_state->'tokens'->v_current);
  v_bonus:=v_roll=6 or v_captured; v_state:=jsonb_set(v_state,'{lastRoll}','null'::jsonb);
  if v_winner then
    v_state:=jsonb_set(v_state,'{winner}',to_jsonb(v_current));
    v_stake:=coalesce((v_state->>'tokensStake')::integer,v_room.tokens_stake,0); v_pot:=v_stake*jsonb_array_length(v_order);
    select coalesce((value #>> '{}')::numeric,0) into v_commission_rate from private.admin_settings where setting_key='wallet.wager.commission_percent';
    v_commission_rate:=greatest(0,least(25,coalesce(v_commission_rate,0)));
    v_commission:=floor(v_pot*v_commission_rate/100)::bigint; v_payout:=v_pot-v_commission;
    if v_stake>0 then
      insert into public.player_wallets(user_id) values(v_player) on conflict(user_id) do nothing;
      select tokens_balance into v_balance from public.player_wallets where user_id=v_player for update;
      v_balance:=v_balance+v_payout;
      update public.player_wallets set tokens_balance=v_balance,updated_at=now() where user_id=v_player;
      if v_payout>0 then
        insert into public.player_wallet_transactions(user_id,asset,direction,amount,balance_after,status,description,reference)
        values(v_player,'tokens','credit',v_payout,v_balance,'completed','Gain Ludo après commission · salle '||v_room.code,'ludo:'||v_room.id::text);
      end if;
      if v_commission>0 then
        insert into private.wager_commission_ledger(game_type,room_id,gross_tokens,commission_percent,commission_tokens,winner_user_id)
        values('ludo',v_room.id,v_pot,v_commission_rate,v_commission,v_player) on conflict(room_id) do nothing;
      end if;
    end if;
    for v_member_index in 0..jsonb_array_length(v_order)-1 loop
      v_member:=(v_order->>v_member_index)::uuid;
      insert into public.player_game_history(user_id,game_type,outcome,score,points_delta,tokens_delta,metadata)
      values(v_member,'ludo',case when v_member_index=v_current then 'won' else 'lost' end,0,0,
        case when v_member_index=v_current then (v_payout-v_stake)::integer else -v_stake end,
        jsonb_build_object('roomCode',v_room.code,'boardVariant',v_state->>'boardVariant','tokensStake',v_stake,'tokensPot',v_pot,'commissionTokens',v_commission,'winnerPayoutTokens',v_payout));
    end loop;
    update public.rooms set status='finished',updated_at=now() where id=v_room_id;
  elsif not v_bonus then
    v_state:=jsonb_set(v_state,'{currentPlayer}',to_jsonb((v_current+1)%jsonb_array_length(v_order)));
    v_state:=jsonb_set(v_state,'{consecutiveSixes}','0'::jsonb);
    v_state:=jsonb_set(v_state,'{turnNumber}',to_jsonb((v_state->>'turnNumber')::integer+1));
  end if;
  update public.game_sessions set state=v_state,current_turn_user_id=(v_order->>((v_state->>'currentPlayer')::integer))::uuid,updated_at=now() where room_id=v_room_id;
  return jsonb_build_object('state',v_state,'captured',v_captured,'winner',v_winner,'tokensPot',case when v_winner then v_pot else 0 end,'commissionTokens',case when v_winner then v_commission else 0 end,'winnerPayoutTokens',case when v_winner then v_payout else 0 end);
end;
$$;
