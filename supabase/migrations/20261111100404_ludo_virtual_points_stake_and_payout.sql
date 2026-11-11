create or replace function public.ludo_set_stake(p_code text,p_points_stake integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_room_id uuid; v_host uuid; v_old_stake integer;
begin
  if v_user is null then raise exception 'Connecte-toi pour régler la mise.'; end if;
  if p_points_stake not in (0,10,25,50,100,250,500) then raise exception 'Choisis une mise virtuelle proposée.'; end if;
  select r.id,r.host_id,r.points_stake into v_room_id,v_host,v_old_stake
  from public.rooms r join public.room_players rp on rp.room_id=r.id and rp.user_id=v_user
  where r.code=upper(trim(p_code)) and r.game_type='ludo' and r.status='waiting' for update of r;
  if v_room_id is null or v_host<>v_user then raise exception 'Seul l’hôte peut régler la mise avant le départ.'; end if;
  if v_old_stake<>p_points_stake then
    update public.rooms set points_stake=p_points_stake,updated_at=now() where id=v_room_id;
    update public.room_players set is_ready=false where room_id=v_room_id and user_id<>v_user;
  end if;
  return p_points_stake;
end;
$$;

create or replace function public.ludo_room_snapshot(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_room public.rooms%rowtype; v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Connecte-toi pour consulter cette salle.'; end if;
  select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo';
  if not found then raise exception 'Salle introuvable.'; end if;
  if not exists(select 1 from public.room_players where room_id=v_room.id and user_id=v_user) then raise exception 'Tu ne fais pas partie de cette salle.'; end if;
  select jsonb_build_object(
    'room',jsonb_build_object('id',v_room.id,'code',v_room.code,'status',v_room.status,'maxPlayers',v_room.max_players,'hostId',v_room.host_id,'pointsStake',v_room.points_stake),
    'players',coalesce((select jsonb_agg(jsonb_build_object('userId',rp.user_id,'seat',rp.seat,'ready',rp.is_ready,
      'username',coalesce(p.username,p.display_name,'Joueur'),'colorIndex',rp.color_index)
      order by rp.seat) from public.room_players rp left join public.profiles p on p.id=rp.user_id where rp.room_id=v_room.id),'[]'::jsonb),
    'game',(select gs.state from public.game_sessions gs where gs.room_id=v_room.id)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function private.ludo_start_room(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_room public.rooms%rowtype; v_players uuid[]; v_state jsonb;
  v_player_count integer; v_is_octagonal boolean; v_tokens jsonb; v_wallet record; v_balance bigint; v_stake integer;
begin
  select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo' for update;
  if not found or v_room.host_id<>v_user then raise exception 'Seul le créateur peut démarrer la partie.'; end if;
  if v_room.status<>'waiting' then raise exception 'La partie a déjà commencé.'; end if;
  select array_agg(user_id order by seat) into v_players from public.room_players where room_id=v_room.id;
  v_player_count:=coalesce(array_length(v_players,1),0);
  if v_player_count<2 then raise exception 'Il faut au moins 2 joueurs.'; end if;
  if v_player_count>v_room.max_players then raise exception 'La salle dépasse sa capacité.'; end if;
  if v_room.max_players<=4 and v_player_count>4 then raise exception 'Le plateau classique accepte au maximum 4 joueurs.'; end if;
  if v_room.max_players>4 and v_player_count<5 then raise exception 'Le plateau à huit places nécessite au moins 5 joueurs.'; end if;
  if exists(select 1 from public.room_players where room_id=v_room.id and not is_ready) then raise exception 'Tous les joueurs doivent être prêts.'; end if;
  v_stake:=v_room.points_stake;
  if v_stake>0 then
    insert into public.player_wallets(user_id) select unnest(v_players) on conflict(user_id) do nothing;
    for v_wallet in select w.user_id,w.points_balance from public.player_wallets w where w.user_id=any(v_players) order by w.user_id for update loop
      if v_wallet.points_balance<v_stake then raise exception 'Un joueur ne possède pas assez de points pour cette mise.'; end if;
      v_balance:=v_wallet.points_balance-v_stake;
      update public.player_wallets set points_balance=v_balance,updated_at=now() where user_id=v_wallet.user_id;
      insert into public.player_wallet_transactions(user_id,asset,direction,amount,balance_after,status,description,reference)
      values(v_wallet.user_id,'points','debit',v_stake,v_balance,'completed','Mise virtuelle Ludo · salle '||v_room.code,'ludo:'||v_room.id::text);
    end loop;
  end if;
  v_is_octagonal:=v_room.max_players>4;
  select jsonb_agg(jsonb_build_array(-1,-1,-1,-1) order by n) into v_tokens from generate_series(1,v_player_count) as g(n);
  v_state:=jsonb_build_object('playerOrder',to_jsonb(v_players),'tokens',v_tokens,
    'boardVariant',case when v_is_octagonal then 'octagonal8' else 'classic4' end,
    'trackLength',case when v_is_octagonal then 48 else 52 end,
    'routeEnd',case when v_is_octagonal then 46 else 50 end,
    'homeStart',case when v_is_octagonal then 47 else 51 end,
    'goalProgress',case when v_is_octagonal then 52 else 57 end,
    'pointsStake',v_stake,'pointsPot',v_stake*v_player_count,
    'currentPlayer',0,'lastRoll',null,'consecutiveSixes',0,'winner',null,'turnNumber',1);
  update public.rooms set status='playing',updated_at=now() where id=v_room.id;
  insert into public.game_sessions(room_id,state,current_turn_user_id) values(v_room.id,v_state,v_players[1])
  on conflict(room_id) do update set state=excluded.state,current_turn_user_id=excluded.current_turn_user_id,updated_at=now();
  return v_state;
end;
$$;

create or replace function private.ludo_move(p_code text,p_token_index integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms%rowtype; v_room_id uuid; v_user uuid:=auth.uid(); v_state jsonb; v_order jsonb; v_current integer; v_player uuid;
  v_roll integer; v_tokens jsonb; v_previous integer; v_next integer; v_square integer; v_safe boolean;
  v_opponent integer; v_other_token integer; v_other_progress integer; v_captured boolean:=false; v_winner boolean:=false; v_bonus boolean;
  v_track_length integer; v_route_end integer; v_goal integer; v_offset integer; v_stake integer; v_pot bigint;
  v_member uuid; v_member_index integer; v_balance bigint;
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
            if v_other_progress>=0 and v_other_progress<=v_route_end
              and mod((case when v_track_length=48 then v_opponent*6 else v_opponent*13 end)+v_other_progress,v_track_length)=v_square then
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
    v_stake:=coalesce((v_state->>'pointsStake')::integer,v_room.points_stake,0); v_pot:=v_stake*jsonb_array_length(v_order);
    if v_stake>0 then
      insert into public.player_wallets(user_id) values(v_player) on conflict(user_id) do nothing;
      select points_balance into v_balance from public.player_wallets where user_id=v_player for update;
      v_balance:=v_balance+v_pot;
      update public.player_wallets set points_balance=v_balance,updated_at=now() where user_id=v_player;
      insert into public.player_wallet_transactions(user_id,asset,direction,amount,balance_after,status,description,reference)
      values(v_player,'points','credit',v_pot,v_balance,'completed','Gain de la partie Ludo · salle '||v_room.code,'ludo:'||v_room.id::text);
    end if;
    for v_member_index in 0..jsonb_array_length(v_order)-1 loop
      v_member:=(v_order->>v_member_index)::uuid;
      insert into public.player_game_history(user_id,game_type,outcome,score,points_delta,tokens_delta,metadata)
      values(v_member,'ludo',case when v_member_index=v_current then 'won' else 'lost' end,0,
        case when v_member_index=v_current then (v_pot-v_stake)::integer else -v_stake end,0,
        jsonb_build_object('roomCode',v_room.code,'boardVariant',v_state->>'boardVariant','pointsStake',v_stake,'pointsPot',v_pot));
    end loop;
    update public.rooms set status='finished',updated_at=now() where id=v_room_id;
  elsif not v_bonus then
    v_state:=jsonb_set(v_state,'{currentPlayer}',to_jsonb((v_current+1)%jsonb_array_length(v_order)));
    v_state:=jsonb_set(v_state,'{consecutiveSixes}','0'::jsonb);
    v_state:=jsonb_set(v_state,'{turnNumber}',to_jsonb((v_state->>'turnNumber')::integer+1));
  end if;
  update public.game_sessions set state=v_state,current_turn_user_id=(v_order->>((v_state->>'currentPlayer')::integer))::uuid,updated_at=now()
  where room_id=v_room_id;
  return jsonb_build_object('state',v_state,'captured',v_captured,'winner',v_winner,'pointsPot',case when v_winner then v_pot else 0 end);
end;
$$;

revoke all on function public.ludo_set_stake(text,integer) from public,anon;
grant execute on function public.ludo_set_stake(text,integer) to authenticated;
