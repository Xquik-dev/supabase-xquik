select plan(3);

select set_eq(
  $$select p.oid::regprocedure::text as signature, p.prosecdef as definer, pg_get_userbyid(p.proowner)::text as owner,
      case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility,
      array_to_string(p.proconfig, ',') as config,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
      has_function_privilege('service_role', p.oid, 'execute') as service_role
    from pg_catalog.pg_proc p where p.pronamespace = 'xquik'::regnamespace$$,
  $$values
    ('xquik.api_key()', true, 'postgres', 'stable', 'search_path=""', false, false, true),
    ('xquik.build_request(text,jsonb)', true, 'postgres', 'stable', 'search_path=""', false, false, true),
    ('xquik.call(text,jsonb)', true, 'postgres', 'volatile', 'search_path=""', false, false, true),
    ('xquik.collect()', true, 'postgres', 'volatile', 'search_path=""', false, false, true),
    ('xquik.enqueue(text,jsonb)', true, 'postgres', 'volatile', 'search_path=""', false, false, true),
    ('xquik.queueable_request(text,jsonb)', true, 'postgres', 'stable', 'search_path=""', false, false, true),
    ('xquik.response_body(text,text)', false, 'postgres', 'immutable', 'search_path=""', false, false, true),
    ('xquik.rows(text,jsonb)', true, 'postgres', 'volatile', 'search_path=""', false, false, true),
    ('xquik.schedule(text,text,text,jsonb)', true, 'postgres', 'volatile', 'search_path=""', false, false, true),
    ('xquik.send_action()', true, 'postgres', 'volatile', 'search_path=""', false, false, true)$$,
  'each xquik function has this definer flag, owner, volatility and search_path, and only service_role runs it'
);

select triggers_are('public', 'xquik_actions', array['send'], 'public.xquik_actions has exactly the send trigger');
select trigger_is(
  'public', 'xquik_actions', 'send', 'xquik', 'send_action', 'the send trigger runs xquik.send_action()'
);

select * from finish();
