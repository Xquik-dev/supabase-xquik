select plan(75);

select has_schema('xquik', 'the xquik schema exists');
select schema_owner_is('xquik', 'postgres', 'postgres owns the xquik schema');
select tables_are(
  'public',
  array['xquik_actions', 'xquik_events', 'xquik_webhook_nonces'],
  'public holds exactly the 3 xquik tables'
);
select tables_are('xquik', array['operations'], 'xquik holds exactly the operations table besides its foreign tables');

select columns_are(
  'xquik', 'operations', array['operation_id', 'method', 'path', 'kind', 'list_field'],
  'xquik.operations has exactly its 5 columns'
);
select col_type_is('xquik', 'operations', 'operation_id', 'text', 'xquik.operations.operation_id is text');
select col_type_is('xquik', 'operations', 'method', 'text', 'xquik.operations.method is text');
select col_type_is('xquik', 'operations', 'path', 'text', 'xquik.operations.path is text');
select col_type_is('xquik', 'operations', 'kind', 'text', 'xquik.operations.kind is text');
select col_type_is('xquik', 'operations', 'list_field', 'text', 'xquik.operations.list_field is text');
select col_not_null('xquik', 'operations', 'operation_id', 'xquik.operations.operation_id is required');
select col_not_null('xquik', 'operations', 'method', 'xquik.operations.method is required');
select col_not_null('xquik', 'operations', 'path', 'xquik.operations.path is required');
select col_not_null('xquik', 'operations', 'kind', 'xquik.operations.kind is required');
select col_is_null('xquik', 'operations', 'list_field', 'xquik.operations.list_field is optional');
select col_is_pk('xquik', 'operations', 'operation_id', 'xquik.operations is keyed by operation_id');
select col_has_check('xquik', 'operations', 'method', 'xquik.operations.method accepts only HTTP methods');
select col_has_check('xquik', 'operations', 'kind', 'xquik.operations.kind accepts only read or write');

select columns_are(
  'public', 'xquik_actions',
  array['id', 'operation_id', 'params', 'status', 'request_id', 'http_status', 'response', 'created_at', 'finished_at'],
  'public.xquik_actions has exactly its 9 columns'
);
select col_type_is('public', 'xquik_actions', 'id', 'bigint', 'public.xquik_actions.id is bigint');
select col_type_is('public', 'xquik_actions', 'operation_id', 'text', 'public.xquik_actions.operation_id is text');
select col_type_is('public', 'xquik_actions', 'params', 'jsonb', 'public.xquik_actions.params is jsonb');
select col_type_is('public', 'xquik_actions', 'status', 'text', 'public.xquik_actions.status is text');
select col_type_is('public', 'xquik_actions', 'request_id', 'bigint', 'public.xquik_actions.request_id is bigint');
select col_type_is('public', 'xquik_actions', 'http_status', 'bigint', 'public.xquik_actions.http_status is bigint');
select col_type_is('public', 'xquik_actions', 'response', 'jsonb', 'public.xquik_actions.response is jsonb');
select col_type_is(
  'public', 'xquik_actions', 'created_at', 'timestamp with time zone', 'public.xquik_actions.created_at is timestamptz'
);
select col_type_is(
  'public', 'xquik_actions', 'finished_at', 'timestamp with time zone',
  'public.xquik_actions.finished_at is timestamptz'
);
select col_not_null('public', 'xquik_actions', 'id', 'public.xquik_actions.id is required');
select col_not_null('public', 'xquik_actions', 'operation_id', 'public.xquik_actions.operation_id is required');
select col_not_null('public', 'xquik_actions', 'params', 'public.xquik_actions.params is required');
select col_not_null('public', 'xquik_actions', 'status', 'public.xquik_actions.status is required');
select col_is_null('public', 'xquik_actions', 'request_id', 'public.xquik_actions.request_id is optional');
select col_is_null('public', 'xquik_actions', 'http_status', 'public.xquik_actions.http_status is optional');
select col_is_null('public', 'xquik_actions', 'response', 'public.xquik_actions.response is optional');
select col_not_null('public', 'xquik_actions', 'created_at', 'public.xquik_actions.created_at is required');
select col_is_null('public', 'xquik_actions', 'finished_at', 'public.xquik_actions.finished_at is optional');
select is(
  (select attidentity from pg_catalog.pg_attribute
    where attrelid = 'public.xquik_actions'::regclass and attname = 'id'),
  'a'::"char",
  'public.xquik_actions.id is generated always as identity'
);
select col_default_is('public', 'xquik_actions', 'params', '{}'::jsonb, 'public.xquik_actions.params defaults to {}');
select col_default_is(
  'public', 'xquik_actions', 'status', 'queued'::text,
  'public.xquik_actions.status defaults to queued'
);
select col_default_is(
  'public', 'xquik_actions', 'created_at', 'now()',
  'public.xquik_actions.created_at defaults to now()'
);
select col_is_pk('public', 'xquik_actions', 'id', 'public.xquik_actions is keyed by id');
select fk_ok(
  'public', 'xquik_actions', 'operation_id', 'xquik', 'operations', 'operation_id',
  'each action names an operation in xquik.operations'
);
select col_has_check('public', 'xquik_actions', 'status', 'public.xquik_actions.status accepts only its 4 states');
select col_has_check(
  'public', 'xquik_actions', array['status', 'request_id'], 'only a queued action lacks a pg_net request id'
);
select col_has_check(
  'public', 'xquik_actions', array['status', 'finished_at'], 'only a succeeded or failed action has finished_at'
);

select columns_are(
  'public', 'xquik_events',
  array['stream_event_id', 'delivery_id', 'event_type', 'monitor_id', 'occurred_at', 'payload', 'received_at'],
  'public.xquik_events has exactly its 7 columns'
);
select col_type_is('public', 'xquik_events', 'stream_event_id', 'text', 'public.xquik_events.stream_event_id is text');
select col_type_is('public', 'xquik_events', 'delivery_id', 'text', 'public.xquik_events.delivery_id is text');
select col_type_is('public', 'xquik_events', 'event_type', 'text', 'public.xquik_events.event_type is text');
select col_type_is('public', 'xquik_events', 'monitor_id', 'text', 'public.xquik_events.monitor_id is text');
select col_type_is(
  'public', 'xquik_events', 'occurred_at', 'timestamp with time zone', 'public.xquik_events.occurred_at is timestamptz'
);
select col_type_is('public', 'xquik_events', 'payload', 'jsonb', 'public.xquik_events.payload is jsonb');
select col_type_is(
  'public', 'xquik_events', 'received_at', 'timestamp with time zone', 'public.xquik_events.received_at is timestamptz'
);
select col_not_null('public', 'xquik_events', 'stream_event_id', 'public.xquik_events.stream_event_id is required');
select col_is_null('public', 'xquik_events', 'delivery_id', 'public.xquik_events.delivery_id is optional');
select col_not_null('public', 'xquik_events', 'event_type', 'public.xquik_events.event_type is required');
select col_is_null('public', 'xquik_events', 'monitor_id', 'public.xquik_events.monitor_id is optional');
select col_not_null('public', 'xquik_events', 'occurred_at', 'public.xquik_events.occurred_at is required');
select col_not_null('public', 'xquik_events', 'payload', 'public.xquik_events.payload is required');
select col_not_null('public', 'xquik_events', 'received_at', 'public.xquik_events.received_at is required');
select col_default_is(
  'public', 'xquik_events', 'received_at', 'now()',
  'public.xquik_events.received_at defaults to now()'
);
select col_is_pk('public', 'xquik_events', 'stream_event_id', 'public.xquik_events is keyed by stream_event_id');

select columns_are(
  'public', 'xquik_webhook_nonces', array['nonce', 'seen_at'], 'public.xquik_webhook_nonces has exactly its 2 columns'
);
select col_type_is('public', 'xquik_webhook_nonces', 'nonce', 'text', 'public.xquik_webhook_nonces.nonce is text');
select col_type_is(
  'public', 'xquik_webhook_nonces', 'seen_at', 'timestamp with time zone',
  'public.xquik_webhook_nonces.seen_at is timestamptz'
);
select col_not_null('public', 'xquik_webhook_nonces', 'nonce', 'public.xquik_webhook_nonces.nonce is required');
select col_not_null('public', 'xquik_webhook_nonces', 'seen_at', 'public.xquik_webhook_nonces.seen_at is required');
select col_default_is(
  'public', 'xquik_webhook_nonces', 'seen_at', 'now()', 'public.xquik_webhook_nonces.seen_at defaults to now()'
);
select col_is_pk('public', 'xquik_webhook_nonces', 'nonce', 'public.xquik_webhook_nonces is keyed by nonce');

select table_owner_is('xquik', 'operations', 'postgres', 'postgres owns xquik.operations');
select table_owner_is('public', 'xquik_actions', 'postgres', 'postgres owns public.xquik_actions');
select table_owner_is('public', 'xquik_events', 'postgres', 'postgres owns public.xquik_events');
select table_owner_is('public', 'xquik_webhook_nonces', 'postgres', 'postgres owns public.xquik_webhook_nonces');
select is_empty(
  $$select c.oid::regclass::text from pg_catalog.pg_class c
    where c.relnamespace in ('public'::regnamespace, 'xquik'::regnamespace) and c.relkind in ('r', 'p')
      and coalesce(obj_description(c.oid, 'pg_class'), '') = ''$$,
  'every regular table in public and xquik carries a comment that says what it holds'
);

select * from finish();
