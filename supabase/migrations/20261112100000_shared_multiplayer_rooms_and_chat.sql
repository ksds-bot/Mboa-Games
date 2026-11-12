-- Shared multiplayer foundation for every Mboa Games title.
-- Ludo keeps its authoritative game-specific RPCs; other titles can now use
-- the same room, readiness, snapshot and chat contract.

alter table public.rooms drop constraint if exists rooms_game_type_check;
alter table public.rooms add constraint rooms_game_type_check
  check (game_type = any (array['ludo','cartes','des','damier','quiz','adages']::text[]));

alter table public.scores drop constraint if exists scores_game_type_check;
alter table public.scores add constraint scores_game_type_check
  check (game_type = any (array['ludo','cartes','des','damier','quiz','adages']::text[]));

create or replace function public.mboa_create_room(
  p_game_type text,
  p_max_players smallint default 4
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_code text;
  v_game text := lower(trim(coalesce(p_game_type,'')));
begin
  if v_user is null then raise exception 'Connecte-toi pour créer une salle.'; end if;
  if v_game not in ('ludo','cartes','des','damier','quiz','adages') then
    raise exception 'Ce jeu ne dispose pas encore de salles en ligne.';
  end if;
  if p_max_players < 2 or p_max_players > 8 then
    raise exception 'Une salle accepte de 2 à 8 joueurs.';
  end if;

  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 6));
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;

  insert into public.rooms(code,game_type,host_id,max_players,is_private,status)
  values(v_code,v_game,v_user,p_max_players,true,'waiting')
  returning * into v_room;

  insert into public.room_players(room_id,user_id,seat,is_ready)
  values(v_room.id,v_user,0,true);

  return jsonb_build_object(
    'id',v_room.id,'code',v_room.code,'gameType',v_room.game_type,
    'status',v_room.status,'maxPlayers',v_room.max_players,'hostId',v_room.host_id
  );
end;
$$;

create or replace function public.mboa_join_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_seat integer;
begin
  if v_user is null then raise exception 'Connecte-toi pour rejoindre une salle.'; end if;

  select * into v_room
  from public.rooms r
  where r.code = upper(trim(coalesce(p_code,'')))
  for update;

  if not found then raise exception 'Code de salle introuvable.'; end if;
  if v_room.status <> 'waiting' then raise exception 'Cette partie a déjà commencé ou est terminée.'; end if;

  if exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.user_id = v_user
  ) then
    return jsonb_build_object(
      'id',v_room.id,'code',v_room.code,'gameType',v_room.game_type,
      'status',v_room.status,'maxPlayers',v_room.max_players,'hostId',v_room.host_id
    );
  end if;

  select count(*) into v_seat
  from public.room_players rp where rp.room_id = v_room.id;

  if v_seat >= v_room.max_players then raise exception 'Cette salle est complète.'; end if;

  insert into public.room_players(room_id,user_id,seat,is_ready)
  values(v_room.id,v_user,v_seat,false);

  return jsonb_build_object(
    'id',v_room.id,'code',v_room.code,'gameType',v_room.game_type,
    'status',v_room.status,'maxPlayers',v_room.max_players,'hostId',v_room.host_id
  );
end;
$$;

create or replace function public.mboa_set_ready(p_code text,p_ready boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Connecte-toi pour te préparer.'; end if;

  select id into v_room_id
  from public.rooms
  where code = upper(trim(coalesce(p_code,''))) and status = 'waiting';

  if v_room_id is null then raise exception 'Salle indisponible.'; end if;

  update public.room_players
  set is_ready = p_ready
  where room_id = v_room_id and user_id = v_user;

  if not found then raise exception 'Tu ne fais pas partie de cette salle.'; end if;
  return p_ready;
end;
$$;

create or replace function public.mboa_room_snapshot(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then raise exception 'Connecte-toi pour consulter cette salle.'; end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(coalesce(p_code,'')));

  if not found then raise exception 'Salle introuvable.'; end if;
  if not exists (
    select 1 from public.room_players
    where room_id = v_room.id and user_id = v_user
  ) then
    raise exception 'Tu ne fais pas partie de cette salle.';
  end if;

  return jsonb_build_object(
    'room',jsonb_build_object(
      'id',v_room.id,'code',v_room.code,'gameType',v_room.game_type,
      'status',v_room.status,'maxPlayers',v_room.max_players,
      'hostId',v_room.host_id,'pointsStake',v_room.points_stake
    ),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId',rp.user_id,'seat',rp.seat,'ready',rp.is_ready,
        'username',coalesce(p.username,p.display_name,'Joueur')
      ) order by rp.seat)
      from public.room_players rp
      left join public.profiles p on p.id = rp.user_id
      where rp.room_id = v_room.id
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.mboa_send_chat(p_code text,p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room_id uuid;
  v_message public.chat_messages%rowtype;
  v_body text := trim(coalesce(p_body,''));
begin
  if v_user is null then raise exception 'Connecte-toi pour écrire dans le salon.'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 180 then
    raise exception 'Le message doit contenir de 1 à 180 caractères.';
  end if;

  select id into v_room_id
  from public.rooms
  where code = upper(trim(coalesce(p_code,'')));

  if v_room_id is null or not exists (
    select 1 from public.room_players
    where room_id = v_room_id and user_id = v_user
  ) then
    raise exception 'Tu ne fais pas partie de cette salle.';
  end if;

  insert into public.chat_messages(room_id,user_id,content)
  values(v_room_id,v_user,v_body)
  returning * into v_message;

  return jsonb_build_object(
    'id',v_message.id,'roomId',v_message.room_id,
    'userId',v_message.user_id,'content',v_message.content,
    'createdAt',v_message.created_at
  );
end;
$$;

create or replace function public.mboa_chat_history(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room_id uuid;
begin
  if v_user is null then raise exception 'Connecte-toi pour consulter le chat.'; end if;

  select id into v_room_id
  from public.rooms
  where code = upper(trim(coalesce(p_code,'')));

  if v_room_id is null or not exists (
    select 1 from public.room_players
    where room_id = v_room_id and user_id = v_user
  ) then
    raise exception 'Tu ne fais pas partie de cette salle.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',m.id,'userId',m.user_id,'username',coalesce(p.username,p.display_name,'Joueur'),
      'content',m.content,'createdAt',m.created_at
    ) order by m.created_at desc)
    from (
      select * from public.chat_messages
      where room_id = v_room_id
      order by created_at desc
      limit 60
    ) m
    left join public.profiles p on p.id = m.user_id
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.mboa_create_room(text,smallint) from public,anon;
revoke all on function public.mboa_join_room(text) from public,anon;
revoke all on function public.mboa_set_ready(text,boolean) from public,anon;
revoke all on function public.mboa_room_snapshot(text) from public,anon;
revoke all on function public.mboa_send_chat(text,text) from public,anon;
revoke all on function public.mboa_chat_history(text) from public,anon;

grant execute on function public.mboa_create_room(text,smallint) to authenticated;
grant execute on function public.mboa_join_room(text) to authenticated;
grant execute on function public.mboa_set_ready(text,boolean) to authenticated;
grant execute on function public.mboa_room_snapshot(text) to authenticated;
grant execute on function public.mboa_send_chat(text,text) to authenticated;
grant execute on function public.mboa_chat_history(text) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
