alter table private.admin_settings
 add constraint admin_settings_wager_commission_range
 check (
   setting_key <> 'wallet.wager.commission_percent'
   or (
     jsonb_typeof(value) = 'number'
     and (value #>> '{}')::numeric between 0 and 25
   )
 );
