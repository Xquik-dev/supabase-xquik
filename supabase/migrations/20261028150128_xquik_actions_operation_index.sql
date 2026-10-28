set lock_timeout = '5s';
set statement_timeout = '10min';

create index concurrently if not exists xquik_actions_operation_id on public.xquik_actions (operation_id);
