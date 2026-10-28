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
- Fail the checks on a secret anywhere in the git history or a broken Markdown
  link. Fail them on prose that breaks the `.vale` styles, a complex function or
  duplicated code.
