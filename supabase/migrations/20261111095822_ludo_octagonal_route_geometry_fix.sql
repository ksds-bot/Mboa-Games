-- Correct the octagonal track length to 47 playable track cells plus six home-lane cells.
create or replace function private.ludo_start_room(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_players uuid[]; v_state jsonb;
  v_player_count integer; v_is_octagonal boolean; v_tokens jsonb;
begin
  select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo' for update;
  if not found or v_room.host_id <> v_user then raise exception 'Seul le créateur peut démarrer la partie.'; end if;
  if v_room.status <> 'waiting' then raise exception 'La partie a déjà commencé.'; end if;
  select array_agg(user_id order by seat) into v_players from public.room_players where room_id=v_room.id;
  v_player_count := coalesce(array_length(v_players,1),0);
  if v_player_count < 2 then raise exception 'Il faut au moins 2 joueurs.'; end if;
  if v_player_count > v_room.max_players then raise exception 'La salle dépasse sa capacité.'; end if;
  if v_room.max_players <= 4 and v_player_count > 4 then raise exception 'Le plateau classique accepte au maximum 4 joueurs.'; end if;
  if v_room.max_players > 4 and v_player_count < 5 then raise exception 'Le plateau à huit places nécessite au moins 5 joueurs.'; end if;
  if exists(select 1 from public.room_players where room_id=v_room.id and not is_ready) then raise exception 'Tous les joueurs doivent être prêts.'; end if;
  v_is_octagonal := v_room.max_players > 4;
  select jsonb_agg(jsonb_build_array(-1,-1,-1,-1) order by n) into v_tokens from generate_series(1,v_player_count) as g(n);
  v_state := jsonb_build_object(
    'playerOrder',to_jsonb(v_players),'tokens',v_tokens,
    'boardVariant',case when v_is_octagonal then 'octagonal8' else 'classic4' end,
    'trackLength',case when v_is_octagonal then 48 else 52 end,
    'routeEnd',case when v_is_octagonal then 46 else 50 end,
    'homeStart',case when v_is_octagonal then 47 else 51 end,
    'goalProgress',case when v_is_octagonal then 52 else 57 end,
    'currentPlayer',0,'lastRoll',null,'consecutiveSixes',0,'winner',null,'turnNumber',1
  );
  update public.rooms set status='playing',updated_at=now() where id=v_room.id;
  insert into public.game_sessions(room_id,state,current_turn_user_id) values(v_room.id,v_state,v_players[1])
  on conflict(room_id) do update set state=excluded.state,current_turn_user_id=excluded.current_turn_user_id,updated_at=now();
  return v_state;
end;
$$;
