/** Same shape as browser `RTCIceServer` — JSON-serializable for the API response. */
export type IceServerJson = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** Default STUN set when `WEBRTC_ICE_SERVERS` is unset or invalid. */
export const DEFAULT_WEBRTC_ICE_SERVERS: IceServerJson[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function parseWebRtcIceServersFromEnv(env: {
  WEBRTC_ICE_SERVERS?: string;
}): IceServerJson[] {
  const raw = env.WEBRTC_ICE_SERVERS?.trim();
  if (!raw) return DEFAULT_WEBRTC_ICE_SERVERS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as IceServerJson[];
  } catch {
    /* ignore */
  }
  return DEFAULT_WEBRTC_ICE_SERVERS;
}
