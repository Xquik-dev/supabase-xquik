set lock_timeout = '1s';
set statement_timeout = '5s';

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema extensions;
create schema vault;

create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null
);

create view vault.decrypted_secrets as
select s.id, s.name, s.description, s.secret, s.secret as decrypted_secret
from vault.secrets s;

create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid
language sql as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description)
  returning id;
$$;

create function vault.update_secret(
  secret_id uuid,
  new_secret text default null,
  new_name text default null,
  new_description text default null
)
returns void
language sql as $$
  update vault.secrets
  set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
    description = coalesce(new_description, description)
  where id = secret_id;
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
