import type { Context, Next } from "hono";
export type AppEnv = { Bindings: Env; Variables: { requestId: string; startedAt: number } };

export async function requestContextMiddleware(
  c: Context<AppEnv>,
  next: Next,
): Promise<void> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  c.set("requestId", requestId);
  c.set("startedAt", startedAt);
  await next();
  const durationMs = Date.now() - startedAt;
  console.log(
    JSON.stringify({
      level: "info",
      event: "request_complete",
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    }),
  );
}

export function structuredError(
  requestId: string,
  code: string,
  message: string,
  status: number,
): Response {
  const headers = corsHeaders({
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
  });
  return Response.json(
    { error: { code, message, requestId } },
    {
      status,
      headers,
    },
  );
}

export function corsHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return h;
}
