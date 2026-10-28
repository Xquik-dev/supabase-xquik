set lock_timeout = '1s';
set statement_timeout = '5s';

create schema net;

create table net.http_request_queue (
  id bigint generated always as identity primary key,
  method text not null,
  url text not null,
  params jsonb not null,
  headers jsonb not null,
  body jsonb,
  timeout_milliseconds bigint not null
);

create table net._http_response (
  id bigint primary key,
  status_code bigint,
  content_type text,
  content text,
  error_msg text
);

create function net.http_get(
  url text,
  params jsonb default '{}',
  headers jsonb default '{}',
  timeout_milliseconds integer default 5000
) returns bigint
language sql as $$
  insert into net.http_request_queue (method, url, params, headers, timeout_milliseconds)
  values ('GET', url, params, headers, timeout_milliseconds)
  returning id;
$$;

create function net.http_post(
  url text,
  body jsonb default '{}',
  params jsonb default '{}',
  headers jsonb default '{"Content-Type": "application/json"}',
  timeout_milliseconds integer default 5000
) returns bigint
language sql as $$
  insert into net.http_request_queue (method, url, params, headers, body, timeout_milliseconds)
  values ('POST', url, params, headers, body, timeout_milliseconds)
  returning id;
$$;

create function net.http_delete(
  url text,
  params jsonb default '{}',
  headers jsonb default '{}',
  timeout_milliseconds integer default 5000
) returns bigint
language sql as $$
  insert into net.http_request_queue (method, url, params, headers, timeout_milliseconds)
  values ('DELETE', url, params, headers, timeout_milliseconds)
  returning id;
$$;
