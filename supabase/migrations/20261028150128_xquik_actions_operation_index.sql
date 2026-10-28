set lock_timeout = '1min';
set statement_timeout = '10min';

drop index concurrently if exists public.xquik_actions_operation_id;
create index concurrently if not exists xquik_actions_operation_id on public.xquik_actions (operation_id);
