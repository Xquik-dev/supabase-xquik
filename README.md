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
[![Twitter API median response time](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Frest-p50.json)](https://xquik.com/trust#speed)
[![Xquik GitHub stars](https://img.shields.io/endpoint?url=https%3A%2F%2Fxquik.com%2Fbadges%2Fgithub-stars.json)](https://github.com/Xquik-dev)

- 51,000+ downloads of Xquik's Twitter API packages on npm, PyPI, RubyGems, NuGet, Packagist & Terraform ([source](https://xquik.com/trust#downloads)) <!-- trust:downloads 51020 -->
- 7,800+ users of Xquik's Twitter scraper Actors on Apify ([source](https://apify.com/xquik)) <!-- trust:apify-users 7800 -->
- 5,700,000+ runs of Xquik's Twitter scraper Actors on Apify ([source](https://apify.com/xquik)) <!-- trust:apify-runs 5704701 -->
- 4.66 of 5 for the X Tweet Scraper from 16 Apify reviews ([source](https://apify.com/xquik/x-tweet-scraper/reviews)) <!-- trust:apify-rating 4.66 16 -->
- 3,900+ accounts on xquik.com ([source](https://xquik.com/trust#accounts)) <!-- trust:accounts 3924 -->
- 1,600+ installs of Xquik's Twitter Skills on skills.sh ([source](https://xquik.com/trust#skill-installs)) <!-- trust:skill-installs 1612 -->
- $38,000+ in revenue verified by TrustMRR ([source](https://trustmrr.com/startup/xquik)) <!-- trust:revenue 38115 -->
- 501 ms median REST API read time over the last 7 days ([source](https://xquik.com/trust#speed)) <!-- trust:rest-p50 501 -->
- 370+ GitHub stars across Xquik's repos ([source](https://github.com/Xquik-dev)) <!-- trust:github-stars 374 -->

Checked on 2026-10-15. See each number with its date & source on [xquik.com/trust](https://xquik.com/trust) or as [JSON](https://xquik.com/trust.json).

<!-- trust:end -->

## What you get

- A typed Xquik client for Edge Functions in `supabase/functions/_shared/xquik.ts`.
- `xquik.call`, `xquik.rows`, `xquik.enqueue` & `xquik.schedule` for SQL, cron jobs & triggers.
- The `xquik-webhook` Edge Function. It checks each delivery's signature & stores each event once.
- Row level security on every table, with no policies. Only the service role reads them.

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

## Read X data with SQL

`xquik.call` returns the JSON answer. `xquik.rows` returns 1 row per list item.

```sql
select xquik.call('getUser', '{"id": "NASA"}');

select tweet ->> 'text'
from xquik.rows('searchTweets', '{"q": "from:NASA"}') as tweet;
```

Path parameters such as `id` go into the URL. Other parameters go into the query string for GET & DELETE. They go into the JSON body for other methods. Run `select * from xquik.operations` to list every operation id.

Only the service role runs these functions. Call them from SQL, cron jobs, triggers or a server with the service role key.

## Schedule calls

`xquik.schedule` creates a pg_cron job that adds an action on each run. Run it again with the same name to change the job.

```sql
select xquik.schedule('nasa-tweets', '*/15 * * * *', 'getUserTweets', '{"id": "NASA"}');
```

## Run actions from rows

Insert a row into `public.xquik_actions` from your app, a trigger or a Database Webhook. pg_net sends it after your transaction commits. The `xquik-collect` cron job saves the answer within 10 seconds.

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
deno task generate
```

`deno task test` proves that every operation in `openapi.json` has a tested path. It also proves that every event type gets a receiver result. `deno task test:stack` runs against `supabase start`. `deno task generate` rebuilds the operation list from `openapi.json`. `bin/check-local` installs the pinned Deno with Bun. Then it runs the checks & tests.

## Documentation

- [Xquik Supabase guide](https://docs.xquik.com/guides/supabase)
- [Xquik API reference](https://docs.xquik.com/api-reference/overview)
- [Webhook signature verification](https://docs.xquik.com/webhooks/verification)
- [Organization support policy](https://github.com/Xquik-dev/.github/blob/main/SUPPORT.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.
