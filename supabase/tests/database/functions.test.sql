select plan(83);

select functions_are(
  'xquik',
  array[
    'api_key', 'build_request', 'call', 'collect', 'enqueue',
    'queueable_request', 'response_body', 'rows', 'schedule', 'send_action'
  ],
  'xquik holds exactly its 10 functions'
);

select is_definer('xquik', 'api_key', array[]::name[]);
select function_owner_is('xquik', 'api_key', array[]::name[], 'postgres');
select function_lang_is('xquik', 'api_key', array[]::name[], 'plpgsql');
select volatility_is('xquik', 'api_key', array[]::name[], 'stable');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.api_key()'::regprocedure),
  array['search_path=""'],
  'xquik.api_key() pins an empty search_path'
);
select function_privs_are('xquik', 'api_key', array[]::name[], 'anon', array[]::text[]);
select function_privs_are('xquik', 'api_key', array[]::name[], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'api_key', array[]::name[], 'service_role', array['EXECUTE']);

select is_definer('xquik', 'build_request', array['text', 'jsonb']);
select function_owner_is('xquik', 'build_request', array['text', 'jsonb'], 'postgres');
select function_lang_is('xquik', 'build_request', array['text', 'jsonb'], 'plpgsql');
select volatility_is('xquik', 'build_request', array['text', 'jsonb'], 'stable');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.build_request(text,jsonb)'::regprocedure),
  array['search_path=""'],
  'xquik.build_request(text,jsonb) pins an empty search_path'
);
select function_privs_are('xquik', 'build_request', array['text', 'jsonb'], 'anon', array[]::text[]);
select function_privs_are('xquik', 'build_request', array['text', 'jsonb'], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'build_request', array['text', 'jsonb'], 'service_role', array['EXECUTE']);

select is_definer('xquik', 'call', array['text', 'jsonb']);
select function_owner_is('xquik', 'call', array['text', 'jsonb'], 'postgres');
select function_lang_is('xquik', 'call', array['text', 'jsonb'], 'plpgsql');
select volatility_is('xquik', 'call', array['text', 'jsonb'], 'volatile');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.call(text,jsonb)'::regprocedure),
  array['search_path=""'],
  'xquik.call(text,jsonb) pins an empty search_path'
);
select function_privs_are('xquik', 'call', array['text', 'jsonb'], 'anon', array[]::text[]);
select function_privs_are('xquik', 'call', array['text', 'jsonb'], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'call', array['text', 'jsonb'], 'service_role', array['EXECUTE']);

select is_definer('xquik', 'collect', array[]::name[]);
select function_owner_is('xquik', 'collect', array[]::name[], 'postgres');
select function_lang_is('xquik', 'collect', array[]::name[], 'sql');
select volatility_is('xquik', 'collect', array[]::name[], 'volatile');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.collect()'::regprocedure),
  array['search_path=""'],
  'xquik.collect() pins an empty search_path'
);
select function_privs_are('xquik', 'collect', array[]::name[], 'anon', array[]::text[]);
select function_privs_are('xquik', 'collect', array[]::name[], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'collect', array[]::name[], 'service_role', array['EXECUTE']);

select is_definer('xquik', 'enqueue', array['text', 'jsonb']);
select function_owner_is('xquik', 'enqueue', array['text', 'jsonb'], 'postgres');
select function_lang_is('xquik', 'enqueue', array['text', 'jsonb'], 'sql');
select volatility_is('xquik', 'enqueue', array['text', 'jsonb'], 'volatile');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.enqueue(text,jsonb)'::regprocedure),
  array['search_path=""'],
  'xquik.enqueue(text,jsonb) pins an empty search_path'
);
select function_privs_are('xquik', 'enqueue', array['text', 'jsonb'], 'anon', array[]::text[]);
select function_privs_are('xquik', 'enqueue', array['text', 'jsonb'], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'enqueue', array['text', 'jsonb'], 'service_role', array['EXECUTE']);

select is_definer('xquik', 'queueable_request', array['text', 'jsonb']);
select function_owner_is('xquik', 'queueable_request', array['text', 'jsonb'], 'postgres');
select function_lang_is('xquik', 'queueable_request', array['text', 'jsonb'], 'plpgsql');
select volatility_is('xquik', 'queueable_request', array['text', 'jsonb'], 'stable');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.queueable_request(text,jsonb)'::regprocedure),
  array['search_path=""'],
  'xquik.queueable_request(text,jsonb) pins an empty search_path'
);
select function_privs_are('xquik', 'queueable_request', array['text', 'jsonb'], 'anon', array[]::text[]);
select function_privs_are('xquik', 'queueable_request', array['text', 'jsonb'], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'queueable_request', array['text', 'jsonb'], 'service_role', array['EXECUTE']);

select isnt_definer('xquik', 'response_body', array['text', 'text']);
select function_owner_is('xquik', 'response_body', array['text', 'text'], 'postgres');
select function_lang_is('xquik', 'response_body', array['text', 'text'], 'sql');
select volatility_is('xquik', 'response_body', array['text', 'text'], 'immutable');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.response_body(text,text)'::regprocedure),
  array['search_path=""'],
  'xquik.response_body(text,text) pins an empty search_path'
);
select function_privs_are('xquik', 'response_body', array['text', 'text'], 'anon', array[]::text[]);
select function_privs_are('xquik', 'response_body', array['text', 'text'], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'response_body', array['text', 'text'], 'service_role', array['EXECUTE']);

select is_definer('xquik', 'rows', array['text', 'jsonb']);
select function_owner_is('xquik', 'rows', array['text', 'jsonb'], 'postgres');
select function_lang_is('xquik', 'rows', array['text', 'jsonb'], 'plpgsql');
select volatility_is('xquik', 'rows', array['text', 'jsonb'], 'volatile');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.rows(text,jsonb)'::regprocedure),
  array['search_path=""'],
  'xquik.rows(text,jsonb) pins an empty search_path'
);
select function_privs_are('xquik', 'rows', array['text', 'jsonb'], 'anon', array[]::text[]);
select function_privs_are('xquik', 'rows', array['text', 'jsonb'], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'rows', array['text', 'jsonb'], 'service_role', array['EXECUTE']);

select is_definer('xquik', 'schedule', array['text', 'text', 'text', 'jsonb']);
select function_owner_is('xquik', 'schedule', array['text', 'text', 'text', 'jsonb'], 'postgres');
select function_lang_is('xquik', 'schedule', array['text', 'text', 'text', 'jsonb'], 'plpgsql');
select volatility_is('xquik', 'schedule', array['text', 'text', 'text', 'jsonb'], 'volatile');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.schedule(text,text,text,jsonb)'::regprocedure),
  array['search_path=""'],
  'xquik.schedule(text,text,text,jsonb) pins an empty search_path'
);
select function_privs_are('xquik', 'schedule', array['text', 'text', 'text', 'jsonb'], 'anon', array[]::text[]);
select function_privs_are(
  'xquik', 'schedule', array['text', 'text', 'text', 'jsonb'], 'authenticated',
  array[]::text[]
);
select function_privs_are(
  'xquik', 'schedule', array['text', 'text', 'text', 'jsonb'], 'service_role',
  array['EXECUTE']
);

select is_definer('xquik', 'send_action', array[]::name[]);
select function_owner_is('xquik', 'send_action', array[]::name[], 'postgres');
select function_lang_is('xquik', 'send_action', array[]::name[], 'plpgsql');
select volatility_is('xquik', 'send_action', array[]::name[], 'volatile');
select is(
  (select proconfig from pg_catalog.pg_proc where oid = 'xquik.send_action()'::regprocedure),
  array['search_path=""'],
  'xquik.send_action() pins an empty search_path'
);
select function_privs_are('xquik', 'send_action', array[]::name[], 'anon', array[]::text[]);
select function_privs_are('xquik', 'send_action', array[]::name[], 'authenticated', array[]::text[]);
select function_privs_are('xquik', 'send_action', array[]::name[], 'service_role', array['EXECUTE']);

select triggers_are('public', 'xquik_actions', array['send'], 'public.xquik_actions has exactly the send trigger');
select trigger_is(
  'public', 'xquik_actions', 'send', 'xquik', 'send_action',
  'the send trigger runs xquik.send_action()'
);

select * from finish();
