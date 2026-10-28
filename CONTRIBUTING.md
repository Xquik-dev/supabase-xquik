# Contribute

Run all commands from the repository root.

```bash
deno task check
deno task test
```

`bin/check-local` installs the Deno version that `bun.lock` pins, then runs
both tasks. Run it before you open a pull request.

## Stack tests

The stack tests need a running local project.

```bash
supabase start
XQUIK_WEBHOOK_SECRET=your_webhook_secret deno task test:stack
```

Use the same `XQUIK_WEBHOOK_SECRET` that `supabase start` read. The tests start
a fake Xquik server on this machine. If your Docker runs rootless, set
`XQUIK_STACK_HOST` to an address of this machine that containers can reach.

## Update the operations

Replace `openapi.json` with the latest `https://xquik.com/openapi.json`. Then
run `deno task generate` and commit the regenerated migration.

Check endpoint names, parameters and examples against the Xquik OpenAPI schema
or public documentation. Never add runtime secrets to examples, tests,
documentation or issues.
