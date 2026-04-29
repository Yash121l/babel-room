import type { Context, Next } from "hono";
import { resolveCorsAllowOrigin } from "./cors";

export type AppEnv = {
  Bindings: Env;
  Variables: { requestId: string; startedAt: number; corsAllowOrigin: string };
};

export async function requestContextMiddleware(
  c: Context<AppEnv>,
  next: Next,
): Promise<void> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  c.set("requestId", requestId);
  c.set("startedAt", startedAt);
  c.set(
    "corsAllowOrigin",
    resolveCorsAllowOrigin(
      c.env.ALLOWED_ORIGINS,
      c.req.header("Origin") ?? null,
    ),
  );
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
  c: Context<AppEnv>,
  code: string,
  message: string,
  status: number,
): Response {
  const requestId = c.get("requestId");
  const origin = c.get("corsAllowOrigin");
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  return Response.json(
    { error: { code, message, requestId } },
    {
      status,
      headers,
    },
  );
}
