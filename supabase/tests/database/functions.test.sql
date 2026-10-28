select plan(6);

select set_eq(
  $$select p.oid::regprocedure::text as signature, p.prosecdef as definer,
      case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility
    from pg_catalog.pg_proc p where p.pronamespace = 'xquik'::regnamespace$$,
  $$values
    ('xquik.api_key()', true, 'stable'),
    ('xquik.build_request(text,jsonb)', true, 'stable'),
    ('xquik.call(text,jsonb)', true, 'volatile'),
    ('xquik.collect()', true, 'volatile'),
    ('xquik.enqueue(text,jsonb)', true, 'volatile'),
    ('xquik.queueable_request(text,jsonb)', true, 'stable'),
    ('xquik.response_body(text,text)', false, 'immutable'),
    ('xquik.rows(text,jsonb)', true, 'volatile'),
    ('xquik.schedule(text,text,text,jsonb)', true, 'volatile'),
    ('xquik.send_action()', true, 'volatile')$$,
  'xquik holds exactly these 10 functions at these volatilities, and only response_body runs as its caller'
);
select is_empty(
  $$select p.oid::regprocedure::text from pg_catalog.pg_proc p
    where p.pronamespace = 'xquik'::regnamespace
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
        or not has_function_privilege('service_role', p.oid, 'execute'))$$,
  'only service_role runs the xquik functions'
);
select is_empty(
  $$select p.oid::regprocedure::text from pg_catalog.pg_proc p
    where p.pronamespace = 'xquik'::regnamespace and p.proconfig is distinct from array['search_path=""']$$,
  'each xquik function pins an empty search_path'
);
select is_empty(
  $$select p.oid::regprocedure::text from pg_catalog.pg_proc p
    where p.pronamespace = 'xquik'::regnamespace and pg_get_userbyid(p.proowner) <> 'postgres'$$,
  'postgres owns each xquik function'
);

select triggers_are('public', 'xquik_actions', array['send'], 'public.xquik_actions has exactly the send trigger');
select trigger_is(
  'public', 'xquik_actions', 'send', 'xquik', 'send_action', 'the send trigger runs xquik.send_action()'
);

select * from finish();
