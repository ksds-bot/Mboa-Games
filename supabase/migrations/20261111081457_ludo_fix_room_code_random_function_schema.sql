-- gen_random_bytes is installed in the extensions schema on this project.
create or replace function public.ludo_create_room(p_max_players smallint default 4)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_code text;
begin
  if v_user is null then raise exception 'Connecte-toi pour créer une salle.'; end if;
  if p_max_players < 2 or p_max_players > 4 then raise exception 'Une salle Ludo accepte 2 à 4 joueurs.'; end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 6));
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;
  insert into public.rooms(code,game_type,host_id,max_players,is_private,status)
  values(v_code,'ludo',v_user,p_max_players,true,'waiting') returning * into v_room;
  insert into public.room_players(room_id,user_id,seat,is_ready) values(v_room.id,v_user,0,true);
  return jsonb_build_object('id',v_room.id,'code',v_room.code,'status',v_room.status);
end;
$$;
