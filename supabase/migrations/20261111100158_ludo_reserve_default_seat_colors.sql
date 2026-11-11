create or replace function public.ludo_set_color(p_code text,p_color_index smallint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_room_id uuid; v_max_players integer;
begin
  if v_user is null then raise exception 'Connecte-toi pour choisir ta couleur.'; end if;
  select r.id,r.max_players into v_room_id,v_max_players
  from public.rooms r join public.room_players rp on rp.room_id=r.id and rp.user_id=v_user
  where r.code=upper(trim(p_code)) and r.game_type='ludo' and r.status='waiting'
  for update of r;
  if v_room_id is null then raise exception 'Tu ne peux plus changer la couleur de cette salle.'; end if;
  if p_color_index < 0 or p_color_index > (case when v_max_players>4 then 7 else 3 end) then
    raise exception 'Cette couleur ne correspond pas au plateau choisi.';
  end if;
  if exists(select 1 from public.room_players rp where rp.room_id=v_room_id and rp.user_id<>v_user
    and coalesce(rp.color_index,rp.seat::smallint)=p_color_index) then
    raise exception 'Cette couleur est déjà choisie par un autre joueur.';
  end if;
  update public.room_players set color_index=p_color_index where room_id=v_room_id and user_id=v_user;
  return true;
end;
$$;
