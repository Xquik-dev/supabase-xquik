# Contribute

Run all commands from the repository root. Run `bin/check-local` before you open a pull request.

```bash
bin/check-local
```

`bin/check-local` runs every check in this order. It stops at the first failure and says what to fix.

1. Bun installs the Deno & squawk versions that `bun.lock` pins.
2. `git grep` bans each pattern in `lint/banned-patterns.txt` in every file. The list covers every suppression comment, ignore entry & skipped test.
3. `deno.json` has no `exclude`, `include` or `ignore` key, so every check reads every file.
4. shellcheck lints every shell file with every optional check turned on.
5. REUSE 6.2.0 checks that every file has a license & a copyright. `REUSE.toml` gives them to each file without an SPDX header.
6. `deno fmt --check` checks the format.
7. `deno lint` runs every rule that applies, plus the `lint/strict.ts` plugin. The plugin bans type assertions other than `as const`, suppression comments & comments without an https link.
8. `deno check` checks the types with the strict compiler options in `deno.json`.
9. `scripts/type_coverage.ts` fails when the type of any value contains `any`, or when a statement leaves a promise that no code awaits.
10. squawk lints every SQL file.
11. `deno audit` & `bun audit` check `deno.lock` & `bun.lock` for known vulnerabilities.
12. The tests must pass & run every line, branch & function of every tracked source file.
13. CodeQL runs its security-extended queries over the tracked files.

Fix what a check finds. Never suppress a finding or narrow a check.

The checks need shellcheck, uv, jq & CodeQL on your PATH. The SQL tests start a throwaway cluster, so they also need the Postgres 18 `initdb` and `pg_ctl`.

`deno task check` & `deno task test` give faster feedback while you work.

## Stack tests

The stack tests need a running local project.

```bash
supabase start
XQUIK_WEBHOOK_SECRET=your_webhook_secret deno task test:stack
```

Use the same `XQUIK_WEBHOOK_SECRET` that `supabase start` read. The tests start
a fake Xquik server on this machine. If your Docker runs rootless, set
`XQUIK_STACK_HOST` to an address of this machine that containers can reach.

`bin/check-local` does not run the stack tests, because they need Docker & a running project. Run them yourself when you change the migrations or the webhook function. The lint, format, type & type coverage checks still read `tests/stack/`.

## Update the operations

Replace `openapi.json` with the latest `https://xquik.com/openapi.json`. Then
run `deno task generate` and commit each migration it writes. It prints 1 line
for the operation registry and 1 for the foreign tables. Each line names the
latest migration and whether this run wrote it.
