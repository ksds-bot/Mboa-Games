create or replace function private.ludo_room_snapshot(p_code text)
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
create or replace function private.ludo_set_color(p_code text,p_color_index smallint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_room_id uuid; v_max_players integer;
begin
  if v_user is null then raise exception 'Connecte-toi pour choisir ta couleur.'; end if;
  select r.id,r.max_players into v_room_id,v_max_players
  from public.rooms r join public.room_players rp on rp.room_id=r.id and rp.user_id=v_user
  where r.code=upper(trim(p_code)) and r.game_type='ludo' and r.status='waiting' for update of r;
  if v_room_id is null then raise exception 'Tu ne peux plus changer la couleur de cette salle.'; end if;
  if p_color_index is null or p_color_index < 0 or p_color_index > (case when v_max_players>4 then 7 else 3 end) then raise exception 'Cette couleur ne correspond pas au plateau choisi.'; end if;
  if exists(select 1 from public.room_players rp where rp.room_id=v_room_id and rp.user_id<>v_user and coalesce(rp.color_index,rp.seat::smallint)=p_color_index) then raise exception 'Cette couleur est déjà choisie par un autre joueur.'; end if;
  update public.room_players set color_index=p_color_index where room_id=v_room_id and user_id=v_user;
  return true;
end;
$$;
create or replace function private.ludo_set_stake(p_code text,p_points_stake integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_room_id uuid; v_host uuid; v_old_stake integer;
begin
  if v_user is null then raise exception 'Connecte-toi pour régler la mise.'; end if;
  if p_points_stake not in (0,10,25,50,100,250,500) then raise exception 'Choisis une mise virtuelle proposée.'; end if;
  select r.id,r.host_id,r.points_stake into v_room_id,v_host,v_old_stake from public.rooms r
  join public.room_players rp on rp.room_id=r.id and rp.user_id=v_user
  where r.code=upper(trim(p_code)) and r.game_type='ludo' and r.status='waiting' for update of r;
  if v_room_id is null or v_host<>v_user then raise exception 'Seul l’hôte peut régler la mise avant le départ.'; end if;
  if v_old_stake<>p_points_stake then
    update public.rooms set points_stake=p_points_stake,updated_at=now() where id=v_room_id;
    update public.room_players set is_ready=false where room_id=v_room_id and user_id<>v_user;
  end if;
  return p_points_stake;
end;
$$;
create or replace function public.ludo_room_snapshot(p_code text) returns jsonb language sql set search_path = '' as $$ select private.ludo_room_snapshot(p_code); $$;
create or replace function public.ludo_set_color(p_code text,p_color_index smallint) returns boolean language sql set search_path = '' as $$ select private.ludo_set_color(p_code,p_color_index); $$;
create or replace function public.ludo_set_stake(p_code text,p_points_stake integer) returns integer language sql set search_path = '' as $$ select private.ludo_set_stake(p_code,p_points_stake); $$;
revoke all on function public.ludo_room_snapshot(text) from public,anon;
revoke all on function public.ludo_set_color(text,smallint) from public,anon;
revoke all on function public.ludo_set_stake(text,integer) from public,anon;
grant execute on function public.ludo_room_snapshot(text) to authenticated;
grant execute on function public.ludo_set_color(text,smallint) to authenticated;
grant execute on function public.ludo_set_stake(text,integer) to authenticated;
revoke all on function private.ludo_room_snapshot(text) from public,anon,authenticated;
revoke all on function private.ludo_set_color(text,smallint) from public,anon,authenticated;
revoke all on function private.ludo_set_stake(text,integer) from public,anon,authenticated;
grant execute on function private.ludo_room_snapshot(text) to authenticated;
grant execute on function private.ludo_set_color(text,smallint) to authenticated;
grant execute on function private.ludo_set_stake(text,integer) to authenticated;
