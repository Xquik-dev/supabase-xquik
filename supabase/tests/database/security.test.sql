select plan(82);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.xquik_actions'::regclass),
  'public.xquik_actions enables row level security'
);
select policies_are(
  'public', 'xquik_actions',
  array[
    'anon adds no actions',
    'anon changes no actions',
    'anon reads no actions',
    'anon removes no actions',
    'authenticated adds no actions',
    'authenticated changes no actions',
    'authenticated reads no actions',
    'authenticated removes no actions'
  ],
  'public.xquik_actions has exactly 1 deny policy per client role and command'
);
select policy_roles_are('public', 'xquik_actions', 'anon adds no actions', array['anon']);
select policy_cmd_is(
  'public', 'xquik_actions', 'anon adds no actions', 'INSERT',
  '"anon adds no actions" covers INSERT'
);
select policy_roles_are('public', 'xquik_actions', 'anon changes no actions', array['anon']);
select policy_cmd_is(
  'public', 'xquik_actions', 'anon changes no actions', 'UPDATE',
  '"anon changes no actions" covers UPDATE'
);
select policy_roles_are('public', 'xquik_actions', 'anon reads no actions', array['anon']);
select policy_cmd_is(
  'public', 'xquik_actions', 'anon reads no actions', 'SELECT',
  '"anon reads no actions" covers SELECT'
);
select policy_roles_are('public', 'xquik_actions', 'anon removes no actions', array['anon']);
select policy_cmd_is(
  'public', 'xquik_actions', 'anon removes no actions', 'DELETE',
  '"anon removes no actions" covers DELETE'
);
select policy_roles_are('public', 'xquik_actions', 'authenticated adds no actions', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_actions', 'authenticated adds no actions', 'INSERT',
  '"authenticated adds no actions" covers INSERT'
);
select policy_roles_are('public', 'xquik_actions', 'authenticated changes no actions', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_actions', 'authenticated changes no actions', 'UPDATE',
  '"authenticated changes no actions" covers UPDATE'
);
select policy_roles_are('public', 'xquik_actions', 'authenticated reads no actions', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_actions', 'authenticated reads no actions', 'SELECT',
  '"authenticated reads no actions" covers SELECT'
);
select policy_roles_are('public', 'xquik_actions', 'authenticated removes no actions', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_actions', 'authenticated removes no actions', 'DELETE',
  '"authenticated removes no actions" covers DELETE'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.xquik_events'::regclass),
  'public.xquik_events enables row level security'
);
select policies_are(
  'public', 'xquik_events',
  array[
    'anon adds no events',
    'anon changes no events',
    'anon reads no events',
    'anon removes no events',
    'authenticated adds no events',
    'authenticated changes no events',
    'authenticated reads no events',
    'authenticated removes no events'
  ],
  'public.xquik_events has exactly 1 deny policy per client role and command'
);
select policy_roles_are('public', 'xquik_events', 'anon adds no events', array['anon']);
select policy_cmd_is('public', 'xquik_events', 'anon adds no events', 'INSERT', '"anon adds no events" covers INSERT');
select policy_roles_are('public', 'xquik_events', 'anon changes no events', array['anon']);
select policy_cmd_is(
  'public', 'xquik_events', 'anon changes no events', 'UPDATE',
  '"anon changes no events" covers UPDATE'
);
select policy_roles_are('public', 'xquik_events', 'anon reads no events', array['anon']);
select policy_cmd_is(
  'public', 'xquik_events', 'anon reads no events', 'SELECT',
  '"anon reads no events" covers SELECT'
);
select policy_roles_are('public', 'xquik_events', 'anon removes no events', array['anon']);
select policy_cmd_is(
  'public', 'xquik_events', 'anon removes no events', 'DELETE',
  '"anon removes no events" covers DELETE'
);
select policy_roles_are('public', 'xquik_events', 'authenticated adds no events', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_events', 'authenticated adds no events', 'INSERT',
  '"authenticated adds no events" covers INSERT'
);
select policy_roles_are('public', 'xquik_events', 'authenticated changes no events', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_events', 'authenticated changes no events', 'UPDATE',
  '"authenticated changes no events" covers UPDATE'
);
select policy_roles_are('public', 'xquik_events', 'authenticated reads no events', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_events', 'authenticated reads no events', 'SELECT',
  '"authenticated reads no events" covers SELECT'
);
select policy_roles_are('public', 'xquik_events', 'authenticated removes no events', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_events', 'authenticated removes no events', 'DELETE',
  '"authenticated removes no events" covers DELETE'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.xquik_webhook_nonces'::regclass),
  'public.xquik_webhook_nonces enables row level security'
);
select policies_are(
  'public', 'xquik_webhook_nonces',
  array[
    'anon adds no nonces',
    'anon changes no nonces',
    'anon reads no nonces',
    'anon removes no nonces',
    'authenticated adds no nonces',
    'authenticated changes no nonces',
    'authenticated reads no nonces',
    'authenticated removes no nonces'
  ],
  'public.xquik_webhook_nonces has exactly 1 deny policy per client role and command'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'anon adds no nonces', array['anon']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'anon adds no nonces', 'INSERT',
  '"anon adds no nonces" covers INSERT'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'anon changes no nonces', array['anon']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'anon changes no nonces', 'UPDATE',
  '"anon changes no nonces" covers UPDATE'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'anon reads no nonces', array['anon']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'anon reads no nonces', 'SELECT',
  '"anon reads no nonces" covers SELECT'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'anon removes no nonces', array['anon']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'anon removes no nonces', 'DELETE',
  '"anon removes no nonces" covers DELETE'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'authenticated adds no nonces', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'authenticated adds no nonces', 'INSERT',
  '"authenticated adds no nonces" covers INSERT'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'authenticated changes no nonces', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'authenticated changes no nonces', 'UPDATE',
  '"authenticated changes no nonces" covers UPDATE'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'authenticated reads no nonces', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'authenticated reads no nonces', 'SELECT',
  '"authenticated reads no nonces" covers SELECT'
);
select policy_roles_are('public', 'xquik_webhook_nonces', 'authenticated removes no nonces', array['authenticated']);
select policy_cmd_is(
  'public', 'xquik_webhook_nonces', 'authenticated removes no nonces', 'DELETE',
  '"authenticated removes no nonces" covers DELETE'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'xquik.operations'::regclass),
  'xquik.operations enables row level security'
);
select policies_are(
  'xquik', 'operations',
  array[
    'anon adds no operations',
    'anon changes no operations',
    'anon reads no operations',
    'anon removes no operations',
    'authenticated adds no operations',
    'authenticated changes no operations',
    'authenticated reads no operations',
    'authenticated removes no operations'
  ],
  'xquik.operations has exactly 1 deny policy per client role and command'
);
select policy_roles_are('xquik', 'operations', 'anon adds no operations', array['anon']);
select policy_cmd_is(
  'xquik', 'operations', 'anon adds no operations', 'INSERT',
  '"anon adds no operations" covers INSERT'
);
select policy_roles_are('xquik', 'operations', 'anon changes no operations', array['anon']);
select policy_cmd_is(
  'xquik', 'operations', 'anon changes no operations', 'UPDATE',
  '"anon changes no operations" covers UPDATE'
);
select policy_roles_are('xquik', 'operations', 'anon reads no operations', array['anon']);
select policy_cmd_is(
  'xquik', 'operations', 'anon reads no operations', 'SELECT',
  '"anon reads no operations" covers SELECT'
);
select policy_roles_are('xquik', 'operations', 'anon removes no operations', array['anon']);
select policy_cmd_is(
  'xquik', 'operations', 'anon removes no operations', 'DELETE',
  '"anon removes no operations" covers DELETE'
);
select policy_roles_are('xquik', 'operations', 'authenticated adds no operations', array['authenticated']);
select policy_cmd_is(
  'xquik', 'operations', 'authenticated adds no operations', 'INSERT',
  '"authenticated adds no operations" covers INSERT'
);
select policy_roles_are('xquik', 'operations', 'authenticated changes no operations', array['authenticated']);
select policy_cmd_is(
  'xquik', 'operations', 'authenticated changes no operations', 'UPDATE',
  '"authenticated changes no operations" covers UPDATE'
);
select policy_roles_are('xquik', 'operations', 'authenticated reads no operations', array['authenticated']);
select policy_cmd_is(
  'xquik', 'operations', 'authenticated reads no operations', 'SELECT',
  '"authenticated reads no operations" covers SELECT'
);
select policy_roles_are('xquik', 'operations', 'authenticated removes no operations', array['authenticated']);
select policy_cmd_is(
  'xquik', 'operations', 'authenticated removes no operations', 'DELETE',
  '"authenticated removes no operations" covers DELETE'
);

select is_empty(
  $$select p.schemaname || '.' || p.tablename || ' ' || p.policyname from pg_catalog.pg_policies p
    where p.schemaname in ('public', 'xquik')
      and (p.permissive <> 'PERMISSIVE'
        or p.qual is distinct from case when p.cmd <> 'INSERT' then 'false' end
        or p.with_check is distinct from case when p.cmd in ('INSERT', 'UPDATE') then 'false' end)$$,
  'every policy in public and xquik matches no row with false'
);

select is_empty(
  $$select c.oid::regclass::text, a.grantee::regrole::text, a.privilege_type
    from pg_catalog.pg_class c, aclexplode(c.relacl) a
    where c.relnamespace in ('public'::regnamespace, 'xquik'::regnamespace)
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)$$,
  'anon and authenticated hold no privilege on any table or sequence in public or xquik'
);
select table_privs_are(
  'public', 'xquik_actions', 'service_role',
  array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
  'service_role holds every table privilege on public.xquik_actions'
);
select table_privs_are(
  'public', 'xquik_events', 'service_role',
  array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
  'service_role holds every table privilege on public.xquik_events'
);
select table_privs_are(
  'public', 'xquik_webhook_nonces', 'service_role',
  array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
  'service_role holds every table privilege on public.xquik_webhook_nonces'
);
select table_privs_are(
  'xquik', 'operations', 'service_role', array[]::text[],
  'service_role reaches xquik.operations only through the xquik functions'
);
select sequence_privs_are(
  'public', 'xquik_actions_id_seq', 'service_role', array['SELECT', 'UPDATE', 'USAGE'],
  'service_role reads and advances public.xquik_actions_id_seq'
);
select schema_privs_are('xquik', 'service_role', array['USAGE'], 'service_role uses the xquik schema');
select schema_privs_are('xquik', 'anon', array[]::text[], 'anon cannot use the xquik schema');
select schema_privs_are('xquik', 'authenticated', array[]::text[], 'authenticated cannot use the xquik schema');

select * from finish();
