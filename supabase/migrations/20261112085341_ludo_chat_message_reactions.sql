-- Reactions rapides du chat Ludo, limitées aux membres de chaque salle.
create table if not exists public.ludo_chat_reactions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  message_id bigint not null references public.ludo_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🔥','👏','🤝')),
  created_at timestamptz not null default now(),
  constraint ludo_chat_reactions_unique unique (message_id,user_id,emoji)
);

create index if not exists ludo_chat_reactions_room_message_idx
  on public.ludo_chat_reactions(room_id,message_id);

alter table public.ludo_chat_reactions enable row level security;
drop policy if exists "Ludo members read room reactions" on public.ludo_chat_reactions;
create policy "Ludo members read room reactions" on public.ludo_chat_reactions
for select to authenticated
using (exists (
  select 1 from public.room_players rp
  where rp.room_id = ludo_chat_reactions.room_id
    and rp.user_id = (select auth.uid())
));
grant select on public.ludo_chat_reactions to authenticated;

create or replace function private.ludo_chat_history(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'Connecte-toi pour consulter le chat.'; end if;

  select r.id into v_room_id
  from public.rooms r
  join public.room_players rp on rp.room_id = r.id and rp.user_id = v_user
  where r.code = upper(trim(p_code)) and r.game_type = 'ludo';

  if v_room_id is null then raise exception 'Tu ne fais pas partie de cette salle.'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', recent.id,
      'body', recent.body,
      'userId', recent.user_id,
      'username', recent.username,
      'createdAt', recent.created_at,
      'reactions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'emoji', grouped.emoji,
          'count', grouped.reaction_count,
          'reactedByMe', grouped.reacted_by_me
        ) order by grouped.emoji)
        from (
          select cr.emoji,
                 count(*)::integer as reaction_count,
                 bool_or(cr.user_id = v_user) as reacted_by_me
          from public.ludo_chat_reactions cr
          where cr.message_id = recent.id
          group by cr.emoji
        ) grouped
      ), '[]'::jsonb)
    ) order by recent.created_at
  ), '[]'::jsonb)
  into v_result
  from (
    select m.id, m.body, m.user_id,
           coalesce(p.username,p.display_name,'Joueur') as username,
           m.created_at
    from public.ludo_chat_messages m
    left join public.profiles p on p.id = m.user_id
    where m.room_id = v_room_id
    order by m.created_at desc
    limit 40
  ) recent;

  return v_result;
end;
$$;

create or replace function private.ludo_toggle_chat_reaction(
  p_code text,
  p_message_id bigint,
  p_emoji text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room_id uuid;
  v_message_room uuid;
  v_deleted bigint;
begin
  if v_user is null then raise exception 'Connecte-toi pour réagir.'; end if;
  if p_emoji not in ('👍','❤️','😂','😮','😢','🔥','👏','🤝') then
    raise exception 'Réaction non autorisée.';
  end if;

  select r.id into v_room_id
  from public.rooms r
  join public.room_players rp on rp.room_id = r.id and rp.user_id = v_user
  where r.code = upper(trim(p_code)) and r.game_type = 'ludo';

  if v_room_id is null then raise exception 'Tu ne fais pas partie de cette salle.'; end if;

  select m.room_id into v_message_room
  from public.ludo_chat_messages m
  where m.id = p_message_id;

  if v_message_room is null or v_message_room <> v_room_id then
    raise exception 'Message introuvable dans cette salle.';
  end if;

  delete from public.ludo_chat_reactions
  where message_id = p_message_id and user_id = v_user and emoji = p_emoji
  returning id into v_deleted;

  if v_deleted is null then
    insert into public.ludo_chat_reactions(room_id,message_id,user_id,emoji)
    values(v_room_id,p_message_id,v_user,p_emoji)
    on conflict (message_id,user_id,emoji) do nothing;
  end if;

  return private.ludo_chat_history(p_code);
end;
$$;

create or replace function public.ludo_chat_history(p_code text)
returns jsonb
language sql
set search_path = ''
as $$ select private.ludo_chat_history(p_code); $$;

create or replace function public.ludo_toggle_chat_reaction(p_code text,p_message_id bigint,p_emoji text)
returns jsonb
language sql
set search_path = ''
as $$ select private.ludo_toggle_chat_reaction(p_code,p_message_id,p_emoji); $$;

revoke all on function private.ludo_chat_history(text) from public, anon, authenticated;
revoke all on function private.ludo_toggle_chat_reaction(text,bigint,text) from public, anon, authenticated;
grant execute on function private.ludo_chat_history(text) to authenticated;
grant execute on function private.ludo_toggle_chat_reaction(text,bigint,text) to authenticated;
grant execute on function public.ludo_chat_history(text) to authenticated;
grant execute on function public.ludo_toggle_chat_reaction(text,bigint,text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.ludo_chat_reactions;
exception when duplicate_object then null;
end;
$$;
