-- Never expose the ordered draw pile to clients.
CREATE OR REPLACE FUNCTION private.check_public_state(p_state jsonb, p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        p_state,
        '{players}',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', player->>'id',
              'name', player->>'name',
              'hand', case when player->>'id'=p_user::text then player->'hand' else '[]'::jsonb end,
              'cardCount', jsonb_array_length(player->'hand')
            ) order by ord
          )
          from jsonb_array_elements(p_state->'players') with ordinality as x(player,ord)
        ), '[]'::jsonb),
        true
      ),
      '{drawPile}', '[]'::jsonb, true
    ),
    '{drawCount}', to_jsonb(jsonb_array_length(p_state->'drawPile')), true
  );
$function$

