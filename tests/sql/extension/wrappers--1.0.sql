set lock_timeout = '1s';
set statement_timeout = '5s';

create function extensions.wasm_fdw_handler() returns fdw_handler
language c strict as '$libdir/postgres_fdw', 'postgres_fdw_handler';

create function extensions.wasm_fdw_validator(options text[], catalog oid) returns void
language plpgsql as $$
begin
end;
$$;
