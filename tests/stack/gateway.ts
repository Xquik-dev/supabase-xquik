import { z } from "zod";

const config = z.object({
  port: z.number().int(),
  routes: z.array(z.object({ prefix: z.string(), upstream: z.url(), header: z.string() })),
  keys: z.object({ secret: z.string(), publishable: z.string(), serviceRole: z.string(), anon: z.string() }),
});
export type GatewayConfig = z.infer<typeof config>;

export function bearerToken(headers: Headers, keys: GatewayConfig["keys"]): string | null {
  const authorization = headers.get("authorization");
  if (authorization !== null && !authorization.startsWith("Bearer sb_")) return authorization;
  const apiKey = headers.get("apikey");
  if (apiKey === keys.secret) return `Bearer ${keys.serviceRole}`;
  if (apiKey === keys.publishable) return `Bearer ${keys.anon}`;
  return apiKey;
}

export function gateway({ routes, keys }: GatewayConfig): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const route = routes.find(({ prefix }) => url.pathname.startsWith(prefix));
    if (route === undefined) return new Response(null, { status: 404 });
    const headers = new Headers(request.headers);
    const token = bearerToken(request.headers, keys);
    if (token !== null) headers.set(route.header, token);
    return await fetch(new URL(`${url.pathname.slice(route.prefix.length)}${url.search}`, route.upstream), {
      method: request.method,
      headers,
      body: request.body === null ? null : await request.arrayBuffer(),
      redirect: "manual",
    });
  };
}

if (import.meta.main) {
  const [json] = z.tuple([z.string()]).parse(Deno.args);
  const parsed = config.parse(JSON.parse(json));
  const stop = new AbortController();
  Deno.addSignalListener("SIGTERM", () => stop.abort());
  Deno.serve({ hostname: "127.0.0.1", port: parsed.port, signal: stop.signal, onListen: () => {} }, gateway(parsed));
}
