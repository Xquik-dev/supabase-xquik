import { assert, assertEquals } from "@std/assert";
import { bearerToken, gateway, type GatewayConfig } from "./stack/gateway.ts";

const KEYS = { secret: "sb_secret_s", publishable: "sb_publishable_p", serviceRole: "service-jwt", anon: "anon-jwt" };

type Forwarded = { method: string; path: string; authorization: string | null; apiKey: string | null; body: string };

function upstream(): { url: string; forwarded: Forwarded[]; server: Deno.HttpServer } {
  const forwarded: Forwarded[] = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, async (request) => {
    const url = new URL(request.url);
    forwarded.push({
      method: request.method,
      path: `${url.pathname}${url.search}`,
      authorization: request.headers.get("authorization"),
      apiKey: request.headers.get("sb-api-key"),
      body: await request.text(),
    });
    return new Response("answered", { status: 201 });
  });
  return { url: `http://127.0.0.1:${String(server.addr.port)}/`, forwarded, server };
}

function config(url: string, port = 0): GatewayConfig {
  return {
    port,
    routes: [
      { prefix: "/rest/v1/", upstream: url, header: "authorization" },
      { prefix: "/functions/v1/", upstream: url, header: "sb-api-key" },
    ],
    keys: KEYS,
  };
}

Deno.test("bearerToken maps API keys to JWTs the way the Supabase CLI's Kong does", () => {
  const token = (headers: Record<string, string>): string | null => bearerToken(new Headers(headers), KEYS);
  assertEquals(token({ authorization: "Bearer user-jwt", apikey: KEYS.secret }), "Bearer user-jwt");
  assertEquals(token({ authorization: `Bearer ${KEYS.secret}`, apikey: KEYS.secret }), "Bearer service-jwt");
  assertEquals(token({ apikey: KEYS.publishable }), "Bearer anon-jwt");
  assertEquals(token({ apikey: "legacy-jwt" }), "legacy-jwt");
  assertEquals(token({}), null);
});

Deno.test("gateway strips the route prefix, sets the route header and forwards the method and body", async () => {
  const { url, forwarded, server } = upstream();
  try {
    const handle = gateway(config(url));
    const posted = await handle(
      new Request("http://gateway/rest/v1/xquik_events?select=id", {
        method: "POST",
        headers: { apikey: KEYS.secret },
        body: '{"id": 1}',
      }),
    );
    assertEquals([posted.status, await posted.text()], [201, "answered"]);
    const fetched = await handle(
      new Request("http://gateway/functions/v1/xquik-webhook", { headers: { apikey: KEYS.publishable } }),
    );
    await fetched.body?.cancel();
    const missing = await handle(new Request("http://gateway/auth/v1/user"));
    assertEquals(missing.status, 404);
    assertEquals(forwarded, [
      {
        method: "POST",
        path: "/xquik_events?select=id",
        authorization: "Bearer service-jwt",
        apiKey: null,
        body: '{"id": 1}',
      },
      { method: "GET", path: "/xquik-webhook", authorization: null, apiKey: "Bearer anon-jwt", body: "" },
    ]);
  } finally {
    await server.shutdown();
  }
});

Deno.test("the gateway script serves its JSON config and stops on SIGTERM", async () => {
  const { url, forwarded, server } = upstream();
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = listener.addr.port;
  listener.close();
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-net",
      new URL("./stack/gateway.ts", import.meta.url).pathname,
      JSON.stringify(config(url, port)),
    ],
    stdout: "null",
  }).spawn();
  try {
    let answer: Response | undefined;
    for (let attempt = 0; attempt < 100 && answer === undefined; attempt++) {
      answer = await fetch(`http://127.0.0.1:${String(port)}/rest/v1/xquik_actions`, { headers: { apikey: KEYS.publishable } })
        .catch(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return undefined;
        });
    }
    assertEquals(await answer?.text(), "answered");
    assertEquals(forwarded.map(({ path, authorization }) => `${path} ${String(authorization)}`), [
      "/xquik_actions Bearer anon-jwt",
    ]);
  } finally {
    child.kill("SIGTERM");
    assert((await child.status).success, "the gateway exits cleanly on SIGTERM");
    await server.shutdown();
  }
});
