# Contribute

Run all commands from the repository root. Run `bin/check-local` before you open a pull request.

```bash
bin/check-local
```

`bin/check-local` runs every check in this order. It stops at the first failure and says what to fix.

1. Bun installs the Deno and squawk versions that `bun.lock` pins.
2. `git grep` bans each pattern in `lint/banned-patterns.txt` in every file. The list covers every suppression comment, ignore entry and skipped test.
3. `deno.json` has no `exclude` or `ignore` key, and its 1 `include` key adds lint rules.
4. shellcheck lints every shell file with every optional check turned on.
5. REUSE 6.2.0 checks that every file has a license and a copyright. `REUSE.toml` gives them to each file without an SPDX header.
6. `deno fmt --check` checks the format.
7. `deno lint` runs every rule that applies, plus the `lint/strict.ts` plugin. The plugin bans each type assertion except `as const`, and each comment that has no https link.
8. `deno check` checks the types with the strict compiler options in `deno.json`.
9. `scripts/type_coverage.ts` fails when the type of any value contains `any`, or when a statement leaves a promise, a voided promise or an array of promises that no code awaits.
10. squawk assumes a transaction, except in a file with `create index concurrently`. `supabase migration up` runs that statement alone.
11. `deno audit` and `bun audit` check `deno.lock` and `bun.lock` for known vulnerabilities.
12. Every test must run and pass, with no ignored test or step. The tests must run every line, branch and function of every tracked TypeScript source file, and the coverage report must measure no other file. The SQL tests apply the migrations with `supabase migration up`. They fail on any Supabase advisor finding at any level, and when `supabase gen types` would change `supabase/functions/_shared/database.types.ts`.
13. CodeQL runs its security-extended queries over the tracked files.

Fix what a check finds. Never suppress a finding or narrow a check.

The checks need shellcheck, uv, jq and CodeQL on your PATH. The SQL tests start a throwaway cluster, so they also need the Postgres 18 `initdb` and `pg_ctl`.

`deno task check` and `deno task test` give faster feedback while you work.

## Stack tests

The stack tests need a running local project.

```bash
supabase start
XQUIK_WEBHOOK_SECRET=your_webhook_secret deno task test:stack
```

Use the same `XQUIK_WEBHOOK_SECRET` that `supabase start` read. The tests start
a fake Xquik server on this machine. If your Docker runs rootless, set
`XQUIK_STACK_HOST` to an address of this machine that containers can reach.

`bin/check-local` does not run the stack tests, because they need Docker and a running project. Run them yourself when you change the migrations or the webhook function. The lint, format, type and type coverage checks still read `tests/stack/`.

## Update the operations

Replace `openapi.json` with the latest `https://xquik.com/openapi.json`. Then
run `deno task generate` and commit the regenerated migration.
