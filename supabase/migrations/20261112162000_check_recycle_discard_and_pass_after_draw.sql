-- Recycle the discard pile safely and preserve the optional pass after a playable draw.
CREATE OR REPLACE FUNCTION private.mboa_check_action(p_code text, p_action jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  v_room_id uuid;
  v_state jsonb;
  v_players jsonb;
  v_hand jsonb;
  v_new_hand jsonb;
  v_draw jsonb;
  v_discards jsonb;
  v_recycled jsonb;
  v_card jsonb;
  v_top jsonb;
  v_player jsonb;
  v_idx integer;
  v_next integer;
  v_rank text;
  v_suit text;
  v_action text:=coalesce(p_action->>'type','');
  v_card_id text:=p_action->>'cardId';
  v_chosen text:=p_action->>'chosenSuit';
  v_draw_count integer;
  v_i integer;
  v_advance integer:=1;
begin
  if v_user is null then raise exception 'Connecte-toi pour jouer.'; end if;
  select r.id into v_room_id from public.rooms r join public.room_players rp on rp.room_id=r.id and rp.user_id=v_user
  where r.code=upper(trim(p_code)) and r.game_type='cartes' and r.status='playing';
  if v_room_id is null then raise exception 'Tu ne fais pas partie de cette partie active.'; end if;
  select state into v_state from private.check_game_states where room_id=v_room_id for update;
  if v_state is null or v_state->>'status'<>'playing' then raise exception 'La partie est terminée ou indisponible.'; end if;
  if v_state->>'checkRequiredFor' is not null and v_action not in ('announce','finish') then
    raise exception 'Annonce CHECK! ou accepte la pénalité avant toute autre action.';
  end if;
  v_players:=v_state->'players';
  v_idx:=(v_state->>'currentPlayerIndex')::integer;
  v_player:=v_players->v_idx;
  if (v_player->>'id')::uuid<>v_user then raise exception 'Ce n’est pas ton tour.'; end if;
  v_hand:=v_player->'hand'; v_draw:=v_state->'drawPile'; v_discards:=v_state->'discardPile';
  v_top:=v_discards->(jsonb_array_length(v_discards)-1);

  if v_action='play' then
    select value into v_card from jsonb_array_elements(v_hand) where value->>'id'=v_card_id;
    if v_card is null then raise exception 'Cette carte ne se trouve pas dans ta main.'; end if;
    v_rank:=v_card->>'rank'; v_suit:=v_card->>'suit';
    if (v_state->>'pendingDraw')::integer>0 then
      if v_rank<>'2' then raise exception 'Seul un 2 peut répondre à cette pénalité.'; end if;
    elsif v_rank<>'A' and v_suit<>coalesce(v_state->>'chosenSuit',v_top->>'suit') and v_rank<>v_top->>'rank' then
      raise exception 'Carte invalide : elle doit suivre la couleur ou la valeur.';
    end if;
    if v_rank='A' and (v_chosen is null or v_chosen not in ('hearts','diamonds','clubs','spades')) then raise exception 'Choisis une couleur après avoir posé un As.'; end if;
    if v_rank<>'A' and v_chosen is not null then raise exception 'On ne choisit une couleur qu’avec un As.'; end if;
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_new_hand from jsonb_array_elements(v_hand) where value->>'id'<>v_card_id;
    v_players:=jsonb_set(v_players,array[v_idx::text,'hand'],v_new_hand,true);
    v_discards:=v_discards||jsonb_build_array(v_card);
    v_state:=jsonb_set(v_state,'{players}',v_players,true);
    v_state:=jsonb_set(v_state,'{discardPile}',v_discards,true);
    v_state:=jsonb_set(v_state,'{canPassAfterDraw}','false'::jsonb,true);
    v_state:=jsonb_set(v_state,'{chosenSuit}',case when v_rank='A' then to_jsonb(v_chosen) else 'null'::jsonb end,true);
    v_state:=jsonb_set(v_state,'{pendingDraw}',to_jsonb(case when v_rank='2' then (v_state->>'pendingDraw')::integer+2 else 0 end),true);
    v_state:=jsonb_set(v_state,'{skipNext}',to_jsonb(v_rank in ('8','J')),true);
    v_state:=jsonb_set(v_state,'{lastAction}',to_jsonb((v_player->>'name')||' a posé '||v_rank||' de '||v_suit||'.'),true);
    if jsonb_array_length(v_new_hand)=0 then
      v_state:=jsonb_set(v_state,'{status}','"finished"'::jsonb,true);
      v_state:=jsonb_set(v_state,'{winnerId}',to_jsonb(v_user::text),true);
      v_state:=jsonb_set(v_state,'{checkRequiredFor}','null'::jsonb,true);
    elsif jsonb_array_length(v_new_hand)=1 then
      v_state:=jsonb_set(v_state,'{checkRequiredFor}',to_jsonb(v_user::text),true);
    else
      v_state:=jsonb_set(v_state,'{checkRequiredFor}','null'::jsonb,true);
      v_advance:=case when v_rank in ('8','J') then 2 else 1 end;
    end if;
  elsif v_action='draw' then
    if (v_state->>'pendingDraw')::integer=0 and exists(
      select 1 from jsonb_array_elements(v_hand) c
      where c->>'rank'='A' or c->>'suit'=coalesce(v_state->>'chosenSuit',v_top->>'suit') or c->>'rank'=v_top->>'rank'
    ) then raise exception 'Tu as une carte jouable : tu dois la poser avant de piocher.'; end if;
    v_draw_count:=greatest(1,(v_state->>'pendingDraw')::integer);
    if jsonb_array_length(v_draw)<v_draw_count then
      select coalesce(jsonb_agg(value order by random()),'[]'::jsonb) into v_recycled
      from jsonb_array_elements(v_discards) with ordinality d(value,ord)
      where ord<jsonb_array_length(v_discards);
      v_draw:=v_draw||v_recycled;
      v_discards:=jsonb_build_array(v_top);
      v_state:=jsonb_set(v_state,'{discardPile}',v_discards,true);
    end if;
    if jsonb_array_length(v_draw)<v_draw_count then raise exception 'La pioche et la défausse sont épuisées.'; end if;
    v_card:=v_draw->0;
    for v_i in 0..v_draw_count-1 loop v_hand:=v_hand||jsonb_build_array(v_draw->v_i); end loop;
    v_draw:=case when v_draw_count=1 then v_draw-0 else (select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(v_draw) with ordinality d(value,ord) where ord>v_draw_count) end;
    v_players:=jsonb_set(v_players,array[v_idx::text,'hand'],v_hand,true);
    v_state:=jsonb_set(v_state,'{players}',v_players,true);
    v_state:=jsonb_set(v_state,'{drawPile}',v_draw,true);
    v_state:=jsonb_set(v_state,'{pendingDraw}','0'::jsonb,true);
    v_state:=jsonb_set(v_state,'{lastAction}',to_jsonb((v_player->>'name')||' pioche '||v_draw_count||' carte(s).'),true);
    if v_draw_count>1 or v_card is null or ((v_card->>'rank'<>'A') and (v_card->>'suit'<>coalesce(v_state->>'chosenSuit',v_top->>'suit')) and (v_card->>'rank'<>v_top->>'rank')) then v_advance:=1;
    else v_advance:=0; end if;
    v_state:=jsonb_set(v_state,'{canPassAfterDraw}',to_jsonb(v_advance=0),true);
  elsif v_action='pass' then
    if coalesce((v_state->>'canPassAfterDraw')::boolean,false)=false then raise exception 'Tu ne peux passer qu’après une pioche jouable.'; end if;
    v_state:=jsonb_set(v_state,'{canPassAfterDraw}','false'::jsonb,true);
    v_state:=jsonb_set(v_state,'{lastAction}',to_jsonb((v_player->>'name')||' passe après sa pioche.'),true);
    v_advance:=1;
  elsif v_action='announce' then
    if v_state->>'checkRequiredFor' is distinct from v_user::text then raise exception 'Aucune annonce CHECK! ne t’est demandée.'; end if;
    v_state:=jsonb_set(v_state,'{checkRequiredFor}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{canPassAfterDraw}','false'::jsonb,true);
    v_state:=jsonb_set(v_state,'{lastAction}',to_jsonb((v_player->>'name')||' a annoncé CHECK!'),true);
    v_advance:=case when coalesce((v_state->>'skipNext')::boolean,false) then 2 else 1 end;
  elsif v_action='finish' then
    if v_state->>'checkRequiredFor' is distinct from v_user::text then raise exception 'Aucun tour ne doit être terminé ainsi.'; end if;
    if jsonb_array_length(v_draw)<2 then
      select coalesce(jsonb_agg(value order by random()),'[]'::jsonb) into v_recycled
      from jsonb_array_elements(v_discards) with ordinality d(value,ord)
      where ord<jsonb_array_length(v_discards);
      v_draw:=v_draw||v_recycled;
      v_discards:=jsonb_build_array(v_top);
      v_state:=jsonb_set(v_state,'{discardPile}',v_discards,true);
    end if;
    if jsonb_array_length(v_draw)<2 then raise exception 'La pioche et la défausse sont épuisées.'; end if;
    v_hand:=v_hand||jsonb_build_array(v_draw->0)||jsonb_build_array(v_draw->1);
    v_draw:=case when jsonb_array_length(v_draw)=2 then '[]'::jsonb else (select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(v_draw) with ordinality d(value,ord) where ord>2) end;
    v_players:=jsonb_set(v_players,array[v_idx::text,'hand'],v_hand,true);
    v_state:=jsonb_set(v_state,'{players}',v_players,true);
    v_state:=jsonb_set(v_state,'{drawPile}',v_draw,true);
    v_state:=jsonb_set(v_state,'{checkRequiredFor}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{canPassAfterDraw}','false'::jsonb,true);
    v_state:=jsonb_set(v_state,'{lastAction}',to_jsonb((v_player->>'name')||' a oublié CHECK! et pioche 2 cartes.'),true);
    v_advance:=case when coalesce((v_state->>'skipNext')::boolean,false) then 2 else 1 end;
  else raise exception 'Action CHECK! inconnue.';
  end if;

  if v_advance>0 and v_state->>'status'='playing' then
    v_next:=mod(v_idx+v_advance,jsonb_array_length(v_players));
    v_state:=jsonb_set(v_state,'{currentPlayerIndex}',to_jsonb(v_next),true);
    v_state:=jsonb_set(v_state,'{turnNumber}',to_jsonb((v_state->>'turnNumber')::integer+1),true);
    v_state:=jsonb_set(v_state,'{skipNext}','false'::jsonb,true);
  end if;
  update private.check_game_states set state=v_state,updated_at=now() where room_id=v_room_id;
  update public.game_sessions set state=private.check_public_state(v_state,null),
    current_turn_user_id=case when v_state->>'status'='playing' then (v_players->(v_state->>'currentPlayerIndex')::integer->>'id')::uuid else null end,
    updated_at=now() where room_id=v_room_id;
  if v_state->>'status'='finished' then update public.rooms set status='finished',updated_at=now() where id=v_room_id; end if;
  return private.check_public_state(v_state,v_user);
end;
$function$

