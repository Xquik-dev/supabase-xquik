import parseJson from "@shared/json.ts";
import { z } from "zod";

const NOT_FOUND = 404;
const KEY_BEARER = "Bearer sb_";

const text = z.string();
const keySet = z.object({ anon: text, publishable: text, secret: text, serviceRole: text });
const route = z.object({ header: text, prefix: text, upstream: z.url() });
const config = z.object({ keys: keySet, port: z.number().int(), routes: z.array(route) });
type GatewayConfig = z.infer<typeof config>;
type Keys = z.infer<typeof keySet>;

function bearerToken(headers: Headers, { anon, publishable, secret, serviceRole }: Keys): string | null {
  const authorization = headers.get("authorization");
  if (authorization !== null && !authorization.startsWith(KEY_BEARER)) {
    return authorization;
  }
  const apiKey = headers.get("apikey");
  if (apiKey === secret) {
    return `Bearer ${serviceRole}`;
  }
  if (apiKey === publishable) {
    return `Bearer ${anon}`;
  }
  return apiKey;
}

async function forward(request: Request, { keys, routes }: GatewayConfig): Promise<Response> {
  const url = new URL(request.url);
  const matched = routes.find(({ prefix }) => url.pathname.startsWith(prefix)) ?? null;
  if (matched === null) {
    return new Response(null, { status: NOT_FOUND });
  }
  const headers = new Headers(request.headers);
  const token = bearerToken(request.headers, keys);
  if (token !== null) {
    headers.set(matched.header, token);
  }
  const init: RequestInit = { headers, method: request.method, redirect: "manual" };
  if (request.body !== null) {
    init.body = await request.arrayBuffer();
  }
  return await fetch(new URL(`${url.pathname.slice(matched.prefix.length)}${url.search}`, matched.upstream), init);
}

if (import.meta.main) {
  const [json] = z.tuple([text]).parse(Deno.args);
  const parsed = config.parse(parseJson(json));
  const stop = new AbortController();
  Deno.addSignalListener("SIGTERM", () => {
    stop.abort();
  });
  Deno.serve(
    { hostname: "127.0.0.1", port: parsed.port, signal: stop.signal },
    async (request) => await forward(request, parsed),
  );
}

export { bearerToken, forward };
export type { GatewayConfig };
