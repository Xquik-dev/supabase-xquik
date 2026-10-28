set local lock_timeout = '5s';
set local statement_timeout = '1min';

create extension if not exists wrappers with schema extensions;

create foreign data wrapper xquik_wrapper
  handler extensions.wasm_fdw_handler
  validator extensions.wasm_fdw_validator;

create server xquik_server
  foreign data wrapper xquik_wrapper
  options (
    fdw_package_url 'https://github.com/supabase/wrappers/releases/download/wasm_openapi_fdw_v0.2.1/openapi_fdw.wasm',
    fdw_package_name 'supabase:openapi-fdw',
    fdw_package_version '0.2.1',
    fdw_package_checksum '12c902f3089e18142a1d8d35c66b9ceb85c193224229687bd929aff6b44cddde',
    base_url 'https://xquik.com',
    api_key_id 'xquik_api_key',
    api_key_header 'x-api-key',
    max_pages '10'
  );
