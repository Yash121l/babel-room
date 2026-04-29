/** Used until `/api/webrtc-ice` returns (and as fallback if the request fails). */
export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Optional build-time override (same JSON shape as worker `WEBRTC_ICE_SERVERS`). */
export function parseViteWebRtcIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS as string | undefined;
  if (!raw?.trim()) return DEFAULT_STUN_SERVERS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as RTCIceServer[];
  } catch {
    /* ignore */
  }
  return DEFAULT_STUN_SERVERS;
}
