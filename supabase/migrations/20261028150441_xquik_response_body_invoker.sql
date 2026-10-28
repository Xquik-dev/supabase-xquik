set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter function xquik.response_body(text, text) security invoker;
