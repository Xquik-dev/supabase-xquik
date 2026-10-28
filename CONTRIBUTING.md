# Contribute

Run all commands from the repository root. Run `bin/check-local` before you open a pull request.

```bash
bin/check-local
```

`bin/check-local` runs every check in this order. It stops at the first failure and says what to fix.

1. Bun installs the packages that `bun.lock` pins.
2. `git grep` bans each pattern in `lint/banned-patterns.txt` in every file. The list covers every suppression comment, ignore entry and skipped test.
3. `deno.json` has no `exclude` or `ignore` key, and its 1 `include` key adds lint rules.
4. `bin/check-local` downloads the gitleaks, lychee and vale releases it pins, and stops if a download does not match its pinned sha256.
5. gitleaks scans every commit in the git history with its default rules. No file in the repository can change those rules.
6. lychee checks every local link and fragment in every tracked Markdown file. It skips web links, so an outage of another site cannot fail the checks.
7. vale checks every tracked Markdown file with the styles in `.vale`, and fails on any alert at any level.
8. shellcheck lints every shell file with every optional check turned on.
9. REUSE 6.2.0 checks that every file has a license and a copyright. `REUSE.toml` gives them to each file without an SPDX header.
10. `deno fmt --check` checks the format.
11. `deno lint` runs every rule that applies, plus the `lint/strict.ts` plugin. The plugin bans each type assertion except `as const`, and each comment that has no `https` link.
12. oxlint runs every rule of the 7 categories and 12 plugins in `.oxlintrc.json` on every file, type-aware rules included. The few rules it turns off contradict another rule or the API that the code must call. It reads the types through the import map, `deno.lock` and the types that `deno types` prints.
13. fallow fails on any function over the limits in `.fallowrc.json`. It also fails on duplicated code, including clones between TypeScript and JavaScript.
14. `deno check` checks the types with the strict compiler options in `deno.json`.
15. `scripts/type_coverage.ts` fails when the type of any value contains `any`. It also fails when a statement leaves a promise, a voided promise or an array of promises that no code awaits.
16. squawk assumes a transaction, except in a file with `create index concurrently`. `supabase migration up` runs that statement alone.
17. `deno audit` and `bun audit` check `deno.lock` and `bun.lock` for known vulnerabilities.
18. Every test must run and pass, with no ignored test or step. The tests must run every line, branch and function of every tracked TypeScript source file, and the coverage report must measure no other file. The SQL tests apply the migrations with `supabase migration up`. They fail on any Supabase advisor finding at any level, and when `deno task types` would change `supabase/functions/_shared/database.types.ts`. They also run every pgTAP test in `supabase/tests` with pgTAP 1.3.4 from PGXN. They fail on a failed, skipped or `todo` test. They also fail when a file runs more or fewer tests than its plan. `lint/banned-patterns.txt` bans `skip`, `todo`, `todo_start` and `no_plan` calls.
19. CodeQL runs its security-extended queries over the tracked files.
20. `scripts/mutate.ts` changes 1 operator, condition, `true` or `false`, string or statement at a time in every tracked TypeScript source file and every SQL function body. For each change it runs the tests that load the changed file in a copy of the tree, or every test for SQL. Changes that do not compile do not count. The check fails when tests catch less than `mutation_minimum` percent of the changes that compile. It lists each change that no test caught, and `bin/check-local` sets the minimum.

Fix what a check finds. Never suppress a finding or narrow a check.

The checks run on Linux x86_64 and need curl, shellcheck, uv, jq and CodeQL on your PATH. The SQL tests start a throwaway cluster. They need the Postgres 18 `initdb`, `pg_ctl` and `psql`, Perl's `prove`, `unzip` and access to api.pgxn.org.

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
