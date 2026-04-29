/** Value for `Access-Control-Allow-Origin` on JSON / error responses. */
export function resolveCorsAllowOrigin(
  allowedOriginsVar: string | undefined,
  requestOriginHeader: string | null,
): string {
  const raw = allowedOriginsVar?.trim();
  if (!raw || raw === "*") {
    return requestOriginHeader ?? "*";
  }
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (requestOriginHeader && list.includes(requestOriginHeader)) {
    return requestOriginHeader;
  }
  return list[0] ?? "*";
}

/** `hono/cors` `origin` callback: `true` = reflect request Origin when allowed. */
export function corsOriginCallback(
  allowedOriginsVar: string | undefined,
  requestOrigin: string,
): boolean | string {
  const raw = allowedOriginsVar?.trim();
  if (!raw || raw === "*") return true;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin;
  return false;
}
