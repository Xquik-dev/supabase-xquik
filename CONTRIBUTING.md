# Contribute

Run all commands from the repository root. Run `bin/check-local` before you open a pull request.

```bash
bin/check-local
```

`bin/check-local` runs every check in this order. It stops at the first failure and says what to fix.

1. **Install the packages that bun.lock pins.** `bun install --frozen-lockfile` fails when `bun.lock` does not match `package.json`.
2. **Suppression and exclusion ban.** `git grep` bans each pattern in `lint/banned-patterns.txt` in every file. The list covers every suppression comment, ignore entry and skipped test.
3. **Exclusion keys in the Deno configuration.** `deno.json` has no `exclude` or `ignore` key, and its 1 `include` key adds lint rules.
4. **Fetch the pinned gitleaks, lychee and vale releases.** It stops when a download does not match its pinned sha256.
5. **Secret scan of the full git history with gitleaks.** gitleaks reads every commit with its default rules, and no file in the repository can change them.
6. **Link check of every tracked Markdown file with lychee.** lychee checks each local link and fragment. It skips web links, so an outage of another site cannot fail the checks.
7. **Prose lint of every tracked Markdown file with vale.** vale uses the styles in `.vale` and fails on any alert at any level.
8. **Shell lint with every optional shellcheck check.** shellcheck lints each `.sh` and `.bash` file and each file without an extension whose shebang names a shell.
9. **Licensing with REUSE lint.** REUSE 6.2.0 checks that every file has a license and a copyright. `REUSE.toml` gives them to each file without an SPDX header.
10. **Format check.** `deno fmt --check` fails on any file that `deno fmt` would change.
11. **Lint.** `deno lint` runs every rule that applies, plus the `lint/strict.ts` plugin. The plugin bans each type assertion except `as const`, and each comment that has no `https` link.
12. **Type-aware lint with oxlint and tsgolint.** oxlint runs every rule of the 7 categories and 12 plugins in `.oxlintrc.json` on every file, type-aware rules included. The 9 rules it turns off contradict another rule or the API that the code must call. It reads the types through the import map, `deno.lock` and the types that `deno types` prints.
13. **Complexity and duplication with fallow.** fallow fails on any function over the limits in `.fallowrc.json`. It also fails on duplicated code, including clones between TypeScript and JavaScript.
14. **Type check.** `deno check` uses the strict compiler options in `deno.json`.
15. **Type coverage and floating promises.** `scripts/type_coverage.ts` fails when the type of any value contains `any`. It also fails when a statement leaves a promise, a voided promise or an array of promises that no code awaits.
16. **SQL lint.** squawk assumes a transaction, except in a file with `create index concurrently`. `supabase migration up` runs that statement alone.
17. **Migrations on main stay unchanged.** `git diff` fails when a branch edits, renames or deletes a migration on `origin/main`, or replaces it with a symbolic link. A database may have applied that migration. Put each schema change in a new migration.
18. **Dependency audit of the Deno and Bun lock files.** `deno audit` and `bun audit` fail on any known vulnerability in `deno.lock` or `bun.lock`.
19. **Tests with 100% line, branch and function coverage.** Every test must run and pass, with no ignored test or step. The tests must run every line, branch and function of every tracked TypeScript source file, and the coverage report must measure no other file. The SQL tests apply the migrations with `supabase migration up`. They fail on any Supabase advisor finding at any level, and when `deno task types` would change `supabase/functions/_shared/database.types.ts`. They also run every pgTAP test in `supabase/tests` with pgTAP 1.3.4 from PGXN. They fail on a failed, skipped or `todo` test. They also fail when a file runs more or fewer tests than its plan. `lint/banned-patterns.txt` bans `skip`, `todo`, `todo_start` and `no_plan` calls.
20. **Stack test on the pinned Supabase images without Docker.** `bin/check-stack` runs the tests in `tests/stack/`, as [Stack tests](#stack-tests) describes.
21. **Static analysis with the CodeQL security-extended queries.** CodeQL must read every tracked TypeScript file, and it fails on any result.
22. **Mutation tests of every TypeScript source and SQL function.** `scripts/mutate.ts` changes 1 operator, condition, `true` or `false`, string or statement at a time in every tracked TypeScript source file and every SQL function body. For each change it runs the tests that load the changed file in a copy of the tree, or every test for SQL. It stops at the first test that fails, and it runs first the test that caught the last change in the same file. Changes that do not compile do not count. The check fails when tests catch less than `mutation_minimum` percent of the changes that compile. It lists each change that no test caught, and `bin/check-local` sets the minimum. Each entry in `scripts/equivalent_mutants.json` names 1 change that no test can observe, with the reason. These changes do not count. The check fails before it runs any test when an entry names no change or more than 1.

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

`bin/check-local` runs the stack tests without Docker through `bin/check-stack`. That script needs Linux x86_64, Go, curl, jq and `openssl`. It pulls the Postgres, Edge Runtime and PostgREST images that Supabase CLI 2.122.0 pins, by digest. It caches them in `~/.cache/xquik-supabase-stack`. It runs their binaries on the host, applies the migrations as `supabase start` does and serves the function through the main service of the CLI. `tests/stack/gateway.ts` stands in for Kong. It strips the `/rest/v1/` and `/functions/v1/` prefixes. It turns the local secret and publishable keys into JSON Web Tokens, as Kong does in the CLI. The function gets `SUPABASE_SECRET_KEYS` and `SUPABASE_PUBLISHABLE_KEYS` but no service role key, so a function that reads that key fails.

## Update the operations

Replace `openapi.json` with the latest `https://xquik.com/openapi.json`. Then
run `deno task generate` and commit each migration it writes. It prints 1 line
for the operation registry and 1 for the foreign tables. Each line names the
latest migration and whether this run wrote it. It never changes the wrapper or
the server, which `*_xquik_foreign_server.sql` creates once.
