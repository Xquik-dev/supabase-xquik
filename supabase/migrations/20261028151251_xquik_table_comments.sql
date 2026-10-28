set local lock_timeout = '5s';
set local statement_timeout = '60s';

comment on table xquik.operations is
'Each Xquik API operation with its method, path, kind and list field. The registry migration keeps it in step with openapi.json.';
comment on table public.xquik_actions is
'Xquik calls that pg_net sends after the inserting transaction commits. xquik.collect copies each answer back.';
comment on table public.xquik_events is
'Webhook events that the xquik-webhook function verified and stored once per stream_event_id.';
comment on table public.xquik_webhook_nonces is
'Webhook nonces from the last 10 minutes, so a replayed delivery gets a 401.';
