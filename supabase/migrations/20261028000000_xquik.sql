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
