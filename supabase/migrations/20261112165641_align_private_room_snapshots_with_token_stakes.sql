-- Keep private compatibility functions aligned with the renamed tokens_stake column.
drop function private.ludo_set_stake(text,integer);
create function private.ludo_set_stake(p_code text,p_tokens_stake integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_room_id uuid; v_host uuid; v_old_stake integer;
begin
 if v_user is null then raise exception 'Connecte-toi pour régler la mise.'; end if;
 if p_tokens_stake not in (0,10,25,50,100,250,500) then raise exception 'Choisis une mise virtuelle proposée.'; end if;
 select r.id,r.host_id,r.tokens_stake into v_room_id,v_host,v_old_stake
 from public.rooms r join public.room_players rp on rp.room_id=r.id and rp.user_id=v_user
 where r.code=upper(trim(p_code)) and r.game_type='ludo' and r.status='waiting' for update of r;
 if v_room_id is null or v_host<>v_user then raise exception 'Seul l’hôte peut régler la mise avant le départ.'; end if;
 if v_old_stake<>p_tokens_stake then
  update public.rooms set tokens_stake=p_tokens_stake,updated_at=now() where id=v_room_id;
  update public.room_players set is_ready=false where room_id=v_room_id and user_id<>v_user;
 end if;
 return p_tokens_stake;
end; $$;
revoke all on function private.ludo_set_stake(text,integer) from public,anon;
grant execute on function private.ludo_set_stake(text,integer) to authenticated;
create or replace function private.ludo_room_snapshot(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_room public.rooms%rowtype; v_user uuid:=auth.uid(); v_result jsonb;
begin
 if v_user is null then raise exception 'Connecte-toi pour consulter cette salle.'; end if;
 select * into v_room from public.rooms where code=upper(trim(p_code)) and game_type='ludo';
 if not found then raise exception 'Salle introuvable.'; end if;
 if not exists(select 1 from public.room_players where room_id=v_room.id and user_id=v_user) then raise exception 'Tu ne fais pas partie de cette salle.'; end if;
 select jsonb_build_object('room',jsonb_build_object('id',v_room.id,'code',v_room.code,'status',v_room.status,'maxPlayers',v_room.max_players,'hostId',v_room.host_id,'tokensStake',v_room.tokens_stake),
  'players',coalesce((select jsonb_agg(jsonb_build_object('userId',rp.user_id,'seat',rp.seat,'ready',rp.is_ready,'username',coalesce(p.username,p.display_name,'Joueur'),'colorIndex',rp.color_index) order by rp.seat) from public.room_players rp left join public.profiles p on p.id=rp.user_id where rp.room_id=v_room.id),'[]'::jsonb),
  'game',(select gs.state from public.game_sessions gs where gs.room_id=v_room.id)) into v_result;
 return v_result;
end; $$;
revoke all on function private.ludo_room_snapshot(text) from public,anon;
grant execute on function private.ludo_room_snapshot(text) to authenticated;
create or replace function private.mboa_room_snapshot(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_room public.rooms%rowtype;
begin
 if v_user is null then raise exception 'Connecte-toi pour consulter cette salle.'; end if;
 select * into v_room from public.rooms where code=upper(trim(coalesce(p_code,'')));
 if not found then raise exception 'Salle introuvable.'; end if;
 if not exists(select 1 from public.room_players where room_id=v_room.id and user_id=v_user) then raise exception 'Tu ne fais pas partie de cette salle.'; end if;
 return jsonb_build_object('room',jsonb_build_object('id',v_room.id,'code',v_room.code,'gameType',v_room.game_type,'status',v_room.status,'maxPlayers',v_room.max_players,'hostId',v_room.host_id,'tokensStake',v_room.tokens_stake),
  'players',coalesce((select jsonb_agg(jsonb_build_object('userId',rp.user_id,'seat',rp.seat,'ready',rp.is_ready,'username',coalesce(p.username,p.display_name,'Joueur')) order by rp.seat) from public.room_players rp left join public.profiles p on p.id=rp.user_id where rp.room_id=v_room.id),'[]'::jsonb));
end; $$;
revoke all on function private.mboa_room_snapshot(text) from public,anon;
grant execute on function private.mboa_room_snapshot(text) to authenticated;
