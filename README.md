# Twitter API & X data in Supabase with Xquik

Call every public Xquik X API operation from Supabase Edge Functions & SQL. Receive every Xquik webhook event with its signature checked.

Xquik is the world's fastest and cheapest X Twitter scraper service with the most complete X data.
Xquik charges only for delivered, unique, filter-matching results and never pads rows.

<!-- trust:start -->

## Trust & usage

[![Twitter API package downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Fdownloads.json)](https://xquik.com/trust#downloads)
[![Twitter scraper users on Apify](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Fapify-users.json)](https://apify.com/xquik)
[![Twitter scraper runs on Apify](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Fapify-runs.json)](https://apify.com/xquik)
[![Tweet scraper rating on Apify](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Fapify-rating.json)](https://apify.com/xquik/x-tweet-scraper/reviews)
[![Xquik Twitter API accounts](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Faccounts.json)](https://xquik.com/trust#accounts)
[![Twitter Skill installs](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Fskill-installs.json)](https://xquik.com/trust#skill-installs)
[![Xquik verified revenue on TrustMRR](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Frevenue.json)](https://trustmrr.com/startup/xquik)
[![Twitter API p99 server read time](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Frest-p99.json)](https://xquik.com/trust#speed)
[![Xquik GitHub stars](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Fgithub-stars.json)](https://github.com/Xquik-dev)

- 54,000+ downloads of Xquik's Twitter API packages on npm, PyPI, RubyGems, NuGet, Packagist & Terraform ([source](https://xquik.com/trust#downloads)) <!-- trust:downloads 54576 -->
- 10,000+ users of Xquik's Twitter scraper Actors on Apify ([source](https://apify.com/xquik)) <!-- trust:apify-users 10119 -->
- 7,000,000+ runs of Xquik's Twitter scraper Actors on Apify ([source](https://apify.com/xquik)) <!-- trust:apify-runs 7076266 -->
- 4.66 of 5 for the X Tweet Scraper from 16 Apify reviews ([source](https://apify.com/xquik/x-tweet-scraper/reviews)) <!-- trust:apify-rating 4.66 16 -->
- 4,100+ accounts on xquik.com ([source](https://xquik.com/trust#accounts)) <!-- trust:accounts 4126 -->
- 1,600+ installs of Xquik's Twitter Skills on skills.sh ([source](https://xquik.com/trust#skill-installs)) <!-- trust:skill-installs 1619 -->
- $40,000+ in revenue verified by TrustMRR ([source](https://trustmrr.com/startup/xquik)) <!-- trust:revenue 40329 -->
- 13.8 s p99 REST API server read time over 7 days, failed reads included ([source](https://xquik.com/trust#speed)) <!-- trust:rest-p99 13778 -->
- 380+ GitHub stars across Xquik's repos ([source](https://github.com/Xquik-dev)) <!-- trust:github-stars 386 -->

Checked on 2026-10-28. See each number with its date & source on [xquik.com/trust](https://xquik.com/trust) or as [JSON](https://xquik.com/trust.json).

<!-- trust:end -->

## What you get

- A typed Xquik client for Edge Functions in `supabase/functions/_shared/xquik.ts`.
- `xquik.call`, `xquik.rows`, `xquik.enqueue` & `xquik.schedule` for SQL, cron jobs & triggers.
- Foreign tables in the `xquik` schema for public reads.
- The `xquik-webhook` Edge Function. It checks each delivery's signature & stores each event once.
- Row level security on every regular table. Policies deny `anon` and `authenticated` each operation, and neither holds a grant, so only the service role reads them.

## Start everything with 1 command

You need the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) & Docker. Get an API key & a webhook secret from your [Xquik account](https://xquik.com).

```bash
git clone https://github.com/Xquik-dev/supabase-xquik.git
cd supabase-xquik
XQUIK_API_KEY=xq_your_key XQUIK_WEBHOOK_SECRET=your_webhook_secret supabase start
```

The CLI also reads both values from a `.env` file in the project root. Git ignores that file.

## Call Xquik from an Edge Function

`createXquik()` reads `XQUIK_API_KEY` & returns the typed client.

```ts
import { createXquik } from "../_shared/xquik.ts";

const xquik = createXquik();

Deno.serve(async () => {
  const nasa = await xquik.x.users.retrieve("NASA");
  return Response.json(nasa);
});
```

The client types every method & parameter. `askDocs` searches the Xquik docs. `getSportsGameView` reads game rosters, player props & posts.

A function that imports `_shared/xquik.ts` lists `x-twitter-scraper` and `zod` in its own `deno.json`.

## Read X data with SQL

`xquik.call` returns the JSON answer. `xquik.rows` returns 1 row per list item.

```sql
select xquik.call('getUser', '{"id": "NASA"}');

select tweet ->> 'text'
from xquik.rows('searchTweets', '{"q": "from:NASA"}') as tweet;
```

Path parameters such as `id` go into the URL. Other parameters go into the query string for GET & DELETE. They go into the JSON body for other methods. Run `select * from xquik.operations` to list every operation id.

Only the service role runs these functions. Call them from SQL, cron jobs, triggers or a server with the service role key.

## Query X data as foreign tables

Each public read that answers with JSON is a foreign table in the `xquik` schema. Its name is the operation id in snake case.

```sql
select attrs ->> 'name', attrs ->> 'followers' from xquik.get_user where id = 'NASA';

select attrs ->> 'text' from xquik.search_tweets where q = 'from:NASA' limit 20;
```

- Path & query parameters are columns, & an `=` filter sends them.
- Quote mixed-case names, as in `where "pageSize" = 50`.
- `attrs` holds each row as JSON.
- A SQL `limit` clause stops paging early.
- A query reads at most 10 pages unless you raise the server's `max_pages`, as in `alter server xquik_server options (set max_pages '50')`. The server keeps its options when the tables change.
- The tables read your API key from the `xquik_api_key` Vault secret.
- Query them as `postgres`, the role the SQL editor, cron jobs & direct database connections use.
- `xquik.export_draw` & `xquik.export_extraction` return JSON rows.
- Event streams & support attachment downloads have no table. Use the `xquik-webhook` receiver or an Edge Function for them.
- When `openapi.json` changes, the next foreign tables migration rebuilds only the tables whose columns or options changed & drops the tables of removed operations. It also drops any other foreign table on `xquik_server` in the `xquik` schema.
- A view on a table that the migration rebuilds or drops stops the migration with Postgres's dependency error. Drop the view, run the migration & create the view again. Views on the other tables stay.

## Schedule calls

`xquik.schedule` creates a pg_cron job that adds an action on each run. Run it again with the same name to change the job.

```sql
select xquik.schedule('nasa-tweets', '*/15 * * * *', 'getUserTweets', '{"id": "NASA"}');
```

## Run actions from rows

Insert a row into `public.xquik_actions` from your app, a trigger or a Database Webhook. pg_net sends it after your transaction commits. The `xquik-collect` cron job copies finished answers every 10 seconds.

```sql
select xquik.enqueue('getUser', '{"id": "NASA"}');

select status, http_status, response
from public.xquik_actions
order by id desc
limit 1;
```

`status` moves from `sent` to `succeeded` or `failed`. pg_net sends only GET, POST & DELETE, so run PATCH & PUT operations with `xquik.call`.

## Receive webhook events

The `xquik-webhook` function stores each event in `public.xquik_events`. It checks the signature, the timestamp & the nonce first.

- Every event type & the test alert get a 200.
- A retry of a stored event gets a 200 & is not stored again.
- A bad signature, an old timestamp or a reused nonce gets a 401.
- A storage error gets a 503, so Xquik retries the delivery.

Read events in order with `order by occurred_at, stream_event_id`. Put slow work in `onEvent` in `supabase/functions/xquik-webhook/index.ts`. It runs after Xquik gets its answer, once per new event.

Each webhook URL has its own secret. Set several secrets in `XQUIK_WEBHOOK_SECRET` with commas between them. This also lets you rotate a secret without missing events. A pg_cron job removes nonces older than 10 minutes.

## Deploy to a hosted project

```bash
supabase link --project-ref your-project-ref
supabase db push
supabase secrets set XQUIK_API_KEY=xq_your_key XQUIK_WEBHOOK_SECRET=your_webhook_secret
supabase functions deploy xquik-webhook
```

Then save the API key in Vault for SQL calls. Run this once in the SQL editor.

```sql
select vault.create_secret('xq_your_key', 'xquik_api_key');
```

Your webhook URL is `https://your-project-ref.supabase.co/functions/v1/xquik-webhook`. `supabase/config.toml` turns off the JWT check for this function, because the signature check replaces it.

## Develop

```bash
deno task check
deno task test
XQUIK_WEBHOOK_SECRET=your_webhook_secret deno task test:stack
supabase test db
deno task generate
deno task types
```

`deno task test` proves that every operation in `openapi.json` has a tested path. It also proves that every event type gets a receiver result. The SQL tests check each foreign table against `openapi.json`. They also run the pgTAP tests in `supabase/tests/database`, which check the tables, row level security, policies, functions, grants and indexes. `supabase test db` runs the same pgTAP tests on `supabase start`. `deno task test:stack` runs against `supabase start`. `deno task generate` rebuilds the operation list and the foreign tables from `openapi.json`. `deno task types` regenerates `supabase/functions/_shared/database.types.ts` from `supabase start`. `bin/check-local` installs the pinned Deno with Bun. Then it runs the checks and tests.

## Documentation

- [Xquik Supabase guide](https://docs.xquik.com/guides/supabase)
- [Xquik API reference](https://docs.xquik.com/api-reference/overview)
- [Webhook signature verification](https://docs.xquik.com/webhooks/verification)
- [Organization support policy](https://github.com/Xquik-dev/.github/blob/main/SUPPORT.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.
