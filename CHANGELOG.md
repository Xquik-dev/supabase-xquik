# Changelog

## Unreleased

- Add the Supabase project with the Xquik operation registry, SQL functions and
  cron jobs.
- Add the `xquik-webhook` Edge Function that checks signatures and stores each
  event once.
- Add a typed Xquik client and `askDocs` for Edge Functions.
- Add a deny policy per operation and client role on every table.
- Index the operation of each action, and run `xquik.response_body` as its
  caller.
- Type the webhook client with `supabase gen types`, and give `xquik-webhook`
  its own `deno.json`.
- Fail the checks on any Supabase advisor finding.
