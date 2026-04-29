/**
 * Helpers for Cloudflare Realtime SFU / RealtimeKit (WebRTC room management).
 * Media in this template is routed via Workers + Durable Objects + Workers AI;
 * wire these helpers when you connect RealtimeKit for SFU-backed tracks.
 */

export interface RealtimeRoomHints {
  roomId: string;
}

/** Placeholder: build a client token or room URL from your RealtimeKit app. */
export function buildRealtimeJoinHints(hints: RealtimeRoomHints): {
  note: string;
  roomId: string;
} {
  return {
    note: "Configure RealtimeKit credentials and replace this stub with token issuance.",
    roomId: hints.roomId,
  };
}
