import { assert, assertEquals } from "@std/assert";
import { bearerToken, forward } from "@/tests/stack/gateway.ts";
import type { GatewayConfig } from "@/tests/stack/gateway.ts";

const KEYS = { anon: "anon-jwt", publishable: "sb_publishable_p", secret: "sb_secret_s", serviceRole: "service-jwt" };
const CREATED = 201;
const NOT_FOUND = 404;
const ATTEMPTS = 100;
const ONE_ATTEMPT = 1;
const POLL_MS = 100;
const KILL_AFTER_MS = 5000;

interface Forwarded {
  apiKey: string | null;
  authorization: string | null;
  body: string;
  method: string;
  path: string;
}

interface Upstream {
  forwarded: Forwarded[];
  server: Deno.HttpServer;
  url: string;
}

async function upstream(): Promise<Upstream> {
  const forwarded: Forwarded[] = [];
  const listening = Promise.withResolvers<string>();
  const server = Deno.serve({
    hostname: "127.0.0.1",
    onListen: ({ hostname, port }) => {
      listening.resolve(`http://${hostname}:${String(port)}/`);
    },
    port: 0,
  }, async (request) => {
    const url = new URL(request.url);
    forwarded.push({
      apiKey: request.headers.get("sb-api-key"),
      authorization: request.headers.get("authorization"),
      body: await request.text(),
      method: request.method,
      path: `${url.pathname}${url.search}`,
    });
    return new Response("answered", { status: CREATED });
  });
  return { forwarded, server, url: await listening.promise };
}

function config(url: string, port = 0): GatewayConfig {
  return {
    keys: KEYS,
    port,
    routes: [
      { header: "authorization", prefix: "/rest/v1/", upstream: url },
      { header: "sb-api-key", prefix: "/functions/v1/", upstream: url },
    ],
  };
}

function freePort(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr;
  listener.close();
  return port;
}

function spawnGateway(settings: GatewayConfig): Deno.ChildProcess {
  const script = new URL("stack/gateway.ts", import.meta.url).pathname;
  const args = ["run", "--allow-net", script, JSON.stringify(settings)];
  return new Deno.Command(Deno.execPath(), { args, stdout: "null" }).spawn();
}

async function answer(url: string, attempts: number): Promise<Response | null> {
  const reply = await fetch(url, { headers: { apikey: KEYS.publishable } }).catch(() => null);
  if (reply !== null || attempts === ONE_ATTEMPT) {
    return reply;
  }
  const { promise, resolve } = Promise.withResolvers<number>();
  setTimeout(resolve, POLL_MS, attempts);
  await promise;
  return await answer(url, attempts - ONE_ATTEMPT);
}

async function stopped(child: Deno.ChildProcess): Promise<boolean> {
  child.kill("SIGTERM");
  const deadline = setTimeout(() => {
    child.kill("SIGKILL");
  }, KILL_AFTER_MS);
  const { success } = await child.status;
  clearTimeout(deadline);
  return success;
}

Deno.test("bearerToken maps API keys to JWTs the way the Supabase CLI's Kong does", () => {
  const token = (headers: Record<string, string>): string | null => bearerToken(new Headers(headers), KEYS);
  assertEquals(token({ apikey: KEYS.secret, authorization: "Bearer user-jwt" }), "Bearer user-jwt");
  assertEquals(token({ apikey: KEYS.secret, authorization: `Bearer ${KEYS.secret}` }), "Bearer service-jwt");
  assertEquals(token({ apikey: KEYS.publishable }), "Bearer anon-jwt");
  assertEquals(token({ apikey: "legacy-jwt" }), "legacy-jwt");
  assertEquals(token({}), null);
});

Deno.test("forward strips the route prefix, sets the route header and forwards the method and body", async () => {
  const { forwarded, server, url } = await upstream();
  try {
    const settings = config(url);
    const posted = await forward(
      new Request("http://gateway/rest/v1/xquik_events?select=id", {
        body: '{"id": 1}',
        headers: { apikey: KEYS.secret },
        method: "POST",
      }),
      settings,
    );
    assertEquals([posted.status, await posted.text()], [CREATED, "answered"]);
    const published = { headers: { apikey: KEYS.publishable } };
    await (await forward(new Request("http://gateway/functions/v1/xquik-webhook", published), settings)).body?.cancel();
    const missing = await forward(new Request("http://gateway/auth/v1/user"), settings);
    assertEquals([missing.status, forwarded], [NOT_FOUND, [
      {
        apiKey: null,
        authorization: "Bearer service-jwt",
        body: '{"id": 1}',
        method: "POST",
        path: "/xquik_events?select=id",
      },
      { apiKey: "Bearer anon-jwt", authorization: null, body: "", method: "GET", path: "/xquik-webhook" },
    ]]);
  } finally {
    await server.shutdown();
  }
});

Deno.test("the gateway script serves its JSON config and stops on SIGTERM", async () => {
  const { forwarded, server, url } = await upstream();
  const port = freePort();
  const child = spawnGateway(config(url, port));
  try {
    const reply = await answer(`http://127.0.0.1:${String(port)}/rest/v1/xquik_actions`, ATTEMPTS);
    assertEquals(await reply?.text(), "answered");
    assertEquals(forwarded.map(({ authorization, path }) => `${path} ${String(authorization)}`), [
      "/xquik_actions Bearer anon-jwt",
    ]);
  } finally {
    const exited = await stopped(child);
    await server.shutdown();
    assert(exited, "the gateway exits cleanly within 5 seconds of SIGTERM");
  }
});
