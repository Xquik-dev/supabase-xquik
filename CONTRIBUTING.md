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
11. `git diff` fails when a branch edits, renames, retypes or deletes a migration on `origin/main`, since a database may have applied it. Put each schema change in a new migration.
12. `deno audit` and `bun audit` check `deno.lock` and `bun.lock` for known vulnerabilities.
13. Every test must run and pass, with no ignored test or step. The tests must run every line, branch and function of every tracked TypeScript source file, and the coverage report must measure no other file. The SQL tests apply the migrations with `supabase migration up`. They fail on any Supabase advisor finding at any level, and when `supabase gen types` would change `supabase/functions/_shared/database.types.ts`. They also run every pgTAP test in `supabase/tests` with pgTAP 1.3.4 from PGXN, and fail on a failed, skipped or todo test, or on a test count that differs from the file's plan. `lint/banned-patterns.txt` bans `skip`, `todo`, `todo_start` and `no_plan` calls.
14. CodeQL runs its security-extended queries over the tracked files.
15. `scripts/mutate.ts` changes 1 operator, condition, boolean, string or statement at a time in every tracked TypeScript source file and every SQL function body. For each change it runs the tests that load the changed file in a copy of the tree, or every test for SQL. Changes that do not compile do not count. The check fails when the percent of compiling changes that a test catches is below `mutation_minimum` in `bin/check-local`, and it lists each change that no test caught.

Fix what a check finds. Never suppress a finding or narrow a check.

The checks need shellcheck, uv, jq and CodeQL on your PATH. The SQL tests start a throwaway cluster, so they also need the Postgres 18 `initdb`, `pg_ctl` and `psql`, `prove` from Perl, `unzip` and access to api.pgxn.org.

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
run `deno task generate` and commit each migration it writes. It prints 1 line
for the operation registry and 1 for the foreign tables. Each line names the
latest migration and whether this run wrote it. It never changes the wrapper or
the server, which `*_xquik_foreign_server.sql` creates once.
