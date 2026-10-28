set lock_timeout = '1s';
set statement_timeout = '5s';

create type extensions.http_header as (field text, value text);
create type extensions.http_request as (
  method text,
  uri text,
  headers extensions.http_header[],
  content_type text,
  content text
);
create type extensions.http_response as (
  status integer,
  content_type text,
  headers extensions.http_header[],
  content text
);

create table extensions.http_curlopts (
  name text primary key,
  value text not null
);

create table extensions.http_replies (
  id bigint generated always as identity primary key,
  status bigint not null,
  content_type text,
  content text
);

create table extensions.http_calls (
  id bigint generated always as identity primary key,
  request extensions.http_request not null,
  curlopts jsonb not null
);

create function extensions.http_header(field text, value text) returns extensions.http_header
language sql immutable as $$
  select (field, value)::extensions.http_header;
$$;

create function extensions.http_set_curlopt(curlopt text, value text) returns boolean
language sql as $$
  insert into extensions.http_curlopts (name, value) values (curlopt, value)
  on conflict (name) do update set value = excluded.value
  returning true;
$$;

create function extensions.http(request extensions.http_request) returns extensions.http_response
language sql as $$
  insert into extensions.http_calls (request, curlopts)
  select request, coalesce(jsonb_object_agg(o.name, o.value), '{}') from extensions.http_curlopts o;
  select (r.status::integer, r.content_type, null, r.content)::extensions.http_response
  from extensions.http_replies r
  order by r.id desc
  limit 1;
$$;

create function extensions.urlencode(string text) returns text
language sql immutable strict as $$
  select coalesce(string_agg(
    case
      when byte = 32 then '+'
      when byte < 128 and chr(byte) ~ '[A-Za-z0-9._~-]' then chr(byte)
      else '%' || upper(lpad(to_hex(byte), 2, '0'))
    end, '' order by i), '')
  from convert_to(string, 'UTF8') as bytes,
    generate_series(0, length(bytes) - 1) as i,
    get_byte(bytes, i) as byte;
$$;

create function extensions.urlencode(data jsonb) returns text
language sql immutable strict as $$
  select string_agg(extensions.urlencode(e.key) || '=' || extensions.urlencode(e.value #>> '{}'), '&' order by e.n)
  from jsonb_each(data) with ordinality as e(key, value, n);
$$;
