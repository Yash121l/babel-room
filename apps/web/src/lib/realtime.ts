/** Browser-side helpers for signaling / RealtimeKit when wired to the Worker. */

export function toBrowserWsUrl(wsUrl: string): string {
  if (wsUrl.startsWith("ws://") || wsUrl.startsWith("wss://")) {
    return wsUrl;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${wsUrl}`;
}
