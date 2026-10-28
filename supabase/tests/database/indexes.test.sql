select plan(24);

select indexes_are('xquik', 'operations', array['operations_pkey'], 'xquik.operations has exactly its key index');
select indexes_are(
  'public', 'xquik_actions', array['xquik_actions_pkey', 'xquik_actions_sent', 'xquik_actions_operation_id'],
  'public.xquik_actions has exactly its 3 indexes'
);
select indexes_are(
  'public', 'xquik_events', array['xquik_events_pkey', 'xquik_events_order'],
  'public.xquik_events has exactly its 2 indexes'
);
select indexes_are(
  'public', 'xquik_webhook_nonces', array['xquik_webhook_nonces_pkey'],
  'public.xquik_webhook_nonces has exactly its key index'
);

select has_index('xquik', 'operations', 'operations_pkey', array['operation_id']);
select has_index('public', 'xquik_actions', 'xquik_actions_pkey', array['id']);
select has_index('public', 'xquik_actions', 'xquik_actions_sent', array['request_id']);
select has_index('public', 'xquik_actions', 'xquik_actions_operation_id', array['operation_id']);
select has_index('public', 'xquik_events', 'xquik_events_pkey', array['stream_event_id']);
select has_index('public', 'xquik_events', 'xquik_events_order', array['occurred_at', 'stream_event_id']);
select has_index('public', 'xquik_webhook_nonces', 'xquik_webhook_nonces_pkey', array['nonce']);

select index_is_primary('xquik', 'operations', 'operations_pkey');
select index_is_primary('public', 'xquik_actions', 'xquik_actions_pkey');
select index_is_primary('public', 'xquik_events', 'xquik_events_pkey');
select index_is_primary('public', 'xquik_webhook_nonces', 'xquik_webhook_nonces_pkey');

select index_is_type('xquik', 'operations', 'operations_pkey', 'btree');
select index_is_type('public', 'xquik_actions', 'xquik_actions_pkey', 'btree');
select index_is_type('public', 'xquik_actions', 'xquik_actions_sent', 'btree');
select index_is_type('public', 'xquik_actions', 'xquik_actions_operation_id', 'btree');
select index_is_type('public', 'xquik_events', 'xquik_events_pkey', 'btree');
select index_is_type('public', 'xquik_events', 'xquik_events_order', 'btree');
select index_is_type('public', 'xquik_webhook_nonces', 'xquik_webhook_nonces_pkey', 'btree');

select is(
  (select pg_get_expr(i.indpred, i.indrelid) from pg_catalog.pg_index i
    where i.indexrelid = 'public.xquik_actions_sent'::regclass),
  '(status = ''sent''::text)',
  'public.xquik_actions_sent holds only the sent actions'
);
select is_empty(
  $$select i.indexrelid::regclass::text from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indrelid
    where c.relnamespace in ('public'::regnamespace, 'xquik'::regnamespace)
      and i.indpred is not null and i.indexrelid <> 'public.xquik_actions_sent'::regclass$$,
  'every other index in public and xquik covers its whole table'
);

select * from finish();
