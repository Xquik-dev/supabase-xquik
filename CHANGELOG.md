# Changelog

## Unreleased

- Add the Supabase project with the Xquik operation registry, SQL functions and
  cron jobs.
- Add the `xquik-webhook` Edge Function that checks signatures and stores each
  event once.
- Add a typed Xquik client and `askDocs` for Edge Functions.
- Deny `anon` and `authenticated` each operation on every regular table, and
  revoke their default grants.
- Index the operation of each action, and run `xquik.response_body` as its
  caller.
- Type the webhook client with `supabase gen types`, and give `xquik-webhook`
  its own `deno.json`.
- Fail the checks on any Supabase advisor finding.
- Add foreign tables in the `xquik` schema for public reads, through the
  Supabase Wrappers OpenAPI FDW.
- Fail the checks when the mutation score of the TypeScript sources and the SQL
  functions drops below a minimum.
- Add fast-check property tests for the webhook signature check, the secret
  list, the `askDocs` answers and the SQL quoting.
