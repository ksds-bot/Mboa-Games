-- Let an existing Ludo room member reconnect after a game has started.
create or replace function public.ludo_join_room(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_seat integer;
begin
  if v_user is null then raise exception 'Connecte-toi pour rejoindre une salle.'; end if;
  select * into v_room from public.rooms r
  where r.code=upper(trim(p_code)) and r.game_type='ludo'
  for update;
  if not found then raise exception 'Code de salle introuvable.'; end if;
  if exists(select 1 from public.room_players rp where rp.room_id=v_room.id and rp.user_id=v_user) then
    return jsonb_build_object('id',v_room.id,'code',v_room.code);
  end if;
  if v_room.status <> 'waiting' then raise exception 'Cette partie a déjà commencé.'; end if;
  select count(*) into v_seat from public.room_players rp where rp.room_id=v_room.id;
  if v_seat >= v_room.max_players then raise exception 'Cette salle est complète.'; end if;
  insert into public.room_players(room_id,user_id,seat,is_ready)
  values(v_room.id,v_user,v_seat,false);
  return jsonb_build_object('id',v_room.id,'code',v_room.code);
end;
$$;
