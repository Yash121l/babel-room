/**
 * Reverse proxy for PostHog so analytics requests from the SPA go to our own
 * origin (`/ingest/*`) instead of a third-party host that ad blockers drop.
 *
 * `/ingest/static/*` and `/ingest/array/*` -> us-assets.i.posthog.com, everything else -> us.i.posthog.com.
 */
const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";
export const POSTHOG_PROXY_PREFIX = "/ingest";

export function isPostHogProxyPath(pathname: string): boolean {
  return (
    pathname === POSTHOG_PROXY_PREFIX ||
    pathname.startsWith(`${POSTHOG_PROXY_PREFIX}/`)
  );
}

export async function proxyPostHog(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice(POSTHOG_PROXY_PREFIX.length) || "/";
  const host =
    path.startsWith("/static/") || path.startsWith("/array/")
      ? ASSET_HOST
      : API_HOST;
  const target = new URL(`https://${host}${path}${url.search}`);

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.set("host", host);
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
  });

  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("set-cookie");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}
