-- Persist the net prize and platform commission in the authoritative game snapshot.
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
    v_state:=jsonb_set(v_state,'{commissionTokens}',to_jsonb(v_commission));
    v_state:=jsonb_set(v_state,'{winnerPayoutTokens}',to_jsonb(v_payout));
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
