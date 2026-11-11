-- Do not expose runtime settings as editable until the game services enforce them.
update private.admin_settings
set editable=false
where setting_key in ('site.maintenance_mode','games.ludo.enabled','games.ludo.max_players','games.ludo.turn_seconds');
