set local lock_timeout = '5s';
set local statement_timeout = '60s';

create extension if not exists http with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema xquik;
grant usage on schema xquik to service_role;

create table xquik.operations (
  operation_id text primary key,
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path text not null,
  kind text not null check (kind in ('read', 'write')),
  list_field text
);
alter table xquik.operations enable row level security;

create table public.xquik_actions (
  id bigint generated always as identity primary key,
  operation_id text not null references xquik.operations,
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sent', 'succeeded', 'failed')),
  request_id bigint,
  http_status bigint,
  response jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'queued') = (request_id is null)),
  check ((status in ('succeeded', 'failed')) = (finished_at is not null))
);
create index xquik_actions_sent on public.xquik_actions (request_id) where status = 'sent';
alter table public.xquik_actions enable row level security;

create table public.xquik_events (
  stream_event_id text primary key,
  delivery_id text,
  event_type text not null,
  monitor_id text,
  occurred_at timestamptz not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index xquik_events_order on public.xquik_events (occurred_at, stream_event_id);
alter table public.xquik_events enable row level security;

create table public.xquik_webhook_nonces (
  nonce text primary key,
  seen_at timestamptz not null default now()
);
alter table public.xquik_webhook_nonces enable row level security;

create type xquik.request as (method text, url text, body jsonb);

create function xquik.api_key() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  key text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'xquik_api_key');
begin
  if coalesce(key, '') = '' then
    raise exception 'The xquik_api_key Vault secret is missing'
      using hint = 'Run select vault.create_secret(''<your key>'', ''xquik_api_key'').';
  end if;
  return key;
end;
$$;

create function xquik.build_request(operation_id text, params jsonb) returns xquik.request
language plpgsql stable security definer set search_path = '' as $$
declare
  op xquik.operations;
  rest jsonb := coalesce(params, '{}');
  path text;
  name text;
  base text := coalesce(
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'xquik_base_url'),
    'https://xquik.com'
  );
begin
  select * into op from xquik.operations o where o.operation_id = build_request.operation_id;
  if not found then
    raise exception 'Unknown Xquik operation %', operation_id
      using hint = 'List operation ids with select operation_id from xquik.operations.';
  end if;
  if jsonb_typeof(rest) <> 'object' then
    raise exception 'Pass the parameters of % as a JSON object', operation_id;
  end if;
  path := op.path;
  for name in select m[1] from regexp_matches(op.path, '\{([^}]+)\}', 'g') as m loop
    if rest ->> name is null then
      raise exception 'Xquik operation % needs the % parameter', operation_id, name;
    end if;
    path := replace(path, '{' || name || '}', replace(extensions.urlencode(rest ->> name), '+', '%20'));
    rest := rest - name;
  end loop;
  if op.method in ('GET', 'DELETE') then
    return (
      op.method,
      rtrim(base, '/') || path || case when rest = '{}' then '' else '?' || extensions.urlencode(rest) end,
      null::jsonb
    );
  end if;
  return (op.method, rtrim(base, '/') || path, rest);
end;
$$;

create function xquik.response_body(content_type text, content text) returns jsonb
language sql immutable security definer set search_path = '' as $$
  select case
    when coalesce(content, '') = '' then null
    when content_type ~* '^application/([a-z0-9.+-]*\+)?json' then content::jsonb
    else to_jsonb(content)
  end;
$$;

create function xquik.call(operation_id text, params jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  req xquik.request := xquik.build_request(operation_id, params);
  res extensions.http_response;
  body jsonb;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');
  res := extensions.http((
    req.method,
    req.url,
    array[extensions.http_header('x-api-key', xquik.api_key())],
    case when req.body is null then null else 'application/json' end,
    req.body::text
  )::extensions.http_request);
  body := xquik.response_body(res.content_type, res.content);
  if res.status not between 200 and 299 then
    raise exception 'Xquik % returned HTTP %. %', operation_id, res.status,
      coalesce(nullif(concat_ws('. ', body ->> 'error', body ->> 'message'), ''), res.content);
  end if;
  return body;
end;
$$;

create function xquik.rows(operation_id text, params jsonb default '{}') returns setof jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  field text := (select o.list_field from xquik.operations o where o.operation_id = rows.operation_id);
  body jsonb := xquik.call(operation_id, params);
begin
  if jsonb_typeof(body -> field) = 'array' then
    return query select jsonb_array_elements(body -> field);
  else
    return next body;
  end if;
end;
$$;

create function xquik.queueable_request(operation_id text, params jsonb) returns xquik.request
language plpgsql stable security definer set search_path = '' as $$
declare
  req xquik.request := xquik.build_request(operation_id, params);
begin
  if req.method not in ('GET', 'POST', 'DELETE') then
    raise exception 'Xquik operation % uses %, and pg_net sends only GET, POST and DELETE', operation_id, req.method
      using hint = 'Run it with select xquik.call(...) instead.';
  end if;
  return req;
end;
$$;

create function xquik.send_action() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
declare
  req xquik.request := xquik.queueable_request(new.operation_id, new.params);
  headers jsonb := jsonb_build_object('x-api-key', xquik.api_key(), 'Content-Type', 'application/json');
begin
  new.request_id := case req.method
    when 'GET' then net.http_get(req.url, headers => headers, timeout_milliseconds => 30000)
    when 'POST' then net.http_post(req.url, req.body, headers => headers, timeout_milliseconds => 30000)
    else net.http_delete(req.url, headers => headers, timeout_milliseconds => 30000)
  end;
  new.status := 'sent';
  return new;
end;
$$;

create trigger send before insert on public.xquik_actions
for each row when (new.status = 'queued') execute function xquik.send_action();

create function xquik.enqueue(operation_id text, params jsonb default '{}') returns bigint
language sql volatile security definer set search_path = '' as $$
  insert into public.xquik_actions (operation_id, params) values (enqueue.operation_id, enqueue.params) returning id;
$$;

create function xquik.collect() returns integer
language sql volatile security definer set search_path = '' as $$
  with finished as (
    update public.xquik_actions a
    set status = case when r.status_code between 200 and 299 then 'succeeded' else 'failed' end,
        http_status = r.status_code,
        response = coalesce(
          xquik.response_body(r.content_type, r.content),
          case when r.error_msg is not null then jsonb_build_object('error', r.error_msg) end
        ),
        finished_at = now()
    from net._http_response r
    where a.status = 'sent' and r.id = a.request_id
    returning a.id
  )
  select count(*)::integer from finished;
$$;

create function xquik.schedule(job_name text, schedule text, operation_id text, params jsonb default '{}')
returns bigint
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform xquik.queueable_request(operation_id, params);
  return cron.schedule(job_name, schedule, format('select xquik.enqueue(%L, %L::jsonb)', operation_id, params));
end;
$$;

revoke execute on all functions in schema xquik from public, anon, authenticated;
grant execute on all functions in schema xquik to service_role;

select cron.schedule('xquik-collect', '10 seconds', 'select xquik.collect()');
select cron.schedule(
  'xquik-nonce-cleanup',
  '*/5 * * * *',
  $$delete from public.xquik_webhook_nonces where seen_at < now() - interval '10 minutes'$$
);
