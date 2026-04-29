import type {
  IceCandidateJson,
  RoomClientMessage,
  WSMessageType,
} from "@babel-room/shared";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { logger } from "../lib/logger";

function parseIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS as string | undefined;
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as RTCIceServer[];
    } catch {
      logger.warn("webrtc_ice_parse_failed", {});
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

function toRtcCandidate(
  j: IceCandidateJson | undefined,
): RTCIceCandidateInit | null {
  if (!j?.candidate) return null;
  return {
    candidate: j.candidate,
    sdpMid: j.sdpMid ?? undefined,
    sdpMLineIndex: j.sdpMLineIndex ?? undefined,
  };
}

/**
 * Two-party WebRTC audio: deterministic caller (lexicographically smaller id) sends the offer.
 * Signaling is relayed by the room Durable Object over the existing WebSocket.
 */
export function useRoomPeerAudio(options: {
  selfId: string;
  peerId: string | null;
  mediaStream: MediaStream | null;
  sendRoomMessage: (msg: RoomClientMessage) => boolean;
  enabled: boolean;
  remoteMuted: boolean;
  remoteVolume: number;
  duckWhileTts: boolean;
  ttsIsPlaying: boolean;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
}): {
  handleSignalingMessage: (msg: WSMessageType) => void;
} {
  const {
    selfId,
    peerId,
    mediaStream,
    sendRoomMessage,
    enabled,
    remoteMuted,
    remoteVolume,
    duckWhileTts,
    ttsIsPlaying,
    remoteAudioRef,
  } = options;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteDescSetRef = useRef(false);
  const pendingRemoteIceRef = useRef<IceCandidateJson[]>([]);

  const teardownPc = useCallback((): void => {
    pendingRemoteIceRef.current = [];
    remoteDescSetRef.current = false;
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch {
        /* ignore */
      }
    }
    const el = remoteAudioRef.current;
    if (el) {
      el.srcObject = null;
    }
  }, [remoteAudioRef]);

  const flushPendingIce = useCallback(async (): Promise<void> => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSetRef.current) return;
    const pending = pendingRemoteIceRef.current;
    pendingRemoteIceRef.current = [];
    for (const c of pending) {
      const init = toRtcCandidate(c);
      if (!init) continue;
      try {
        await pc.addIceCandidate(init);
      } catch (e) {
        logger.warn("webrtc_add_ice_failed", { message: String(e) });
      }
    }
  }, []);

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: parseIceServers() });
    pc.ontrack = (ev) => {
      const el = remoteAudioRef.current;
      if (el && ev.streams[0]) {
        el.srcObject = ev.streams[0];
        void el.play().catch(() => {
          /* autoplay policy */
        });
      }
    };
    pc.onicecandidate = (ev) => {
      if (!peerId || !ev.candidate) return;
      const candidate: IceCandidateJson = {
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      };
      sendRoomMessage({
        type: "webrtc_signal",
        to: peerId,
        kind: "ice",
        candidate,
      });
    };
    return pc;
  }, [peerId, remoteAudioRef, sendRoomMessage]);

  const handleSignalingMessage = useCallback(
    (msg: WSMessageType): void => {
      if (msg.type !== "webrtc_signal") return;
      if (msg.to !== selfId) return;
      const from = msg.from;
      if (!from || from === selfId) return;
      if (from !== peerId) return;

      const pc = pcRef.current;
      if (!pc) return;

      void (async () => {
        try {
          if (msg.kind === "offer" && msg.sdp) {
            await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
            remoteDescSetRef.current = true;
            await flushPendingIce();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendRoomMessage({
              type: "webrtc_signal",
              to: from,
              kind: "answer",
              sdp: pc.localDescription?.sdp,
            });
          } else if (msg.kind === "answer" && msg.sdp) {
            await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
            remoteDescSetRef.current = true;
            await flushPendingIce();
          } else if (msg.kind === "ice" && msg.candidate) {
            if (!remoteDescSetRef.current) {
              pendingRemoteIceRef.current.push(msg.candidate);
              return;
            }
            const init = toRtcCandidate(msg.candidate);
            if (init) await pc.addIceCandidate(init);
          }
        } catch (e) {
          logger.error("webrtc_signal_failed", { message: String(e) });
        }
      })();
    },
    [flushPendingIce, peerId, selfId, sendRoomMessage],
  );

  useEffect(() => {
    if (!enabled || !peerId || !mediaStream) {
      teardownPc();
      return;
    }

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      teardownPc();
      return;
    }

    const isCaller = selfId < peerId;

    teardownPc();
    const pc = createPeerConnection();
    pcRef.current = pc;

    for (const t of audioTracks) {
      pc.addTrack(t, mediaStream);
    }

    if (isCaller) {
      void (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendRoomMessage({
            type: "webrtc_signal",
            to: peerId,
            kind: "offer",
            sdp: pc.localDescription?.sdp,
          });
        } catch (e) {
          logger.error("webrtc_offer_failed", { message: String(e) });
        }
      })();
    }

    return () => {
      teardownPc();
    };
  }, [
    enabled,
    selfId,
    peerId,
    mediaStream,
    createPeerConnection,
    sendRoomMessage,
    teardownPc,
  ]);

  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    const ducked =
      duckWhileTts && ttsIsPlaying ? Math.min(remoteVolume, 0.25) : remoteVolume;
    el.volume = remoteMuted ? 0 : ducked;
    el.muted = remoteMuted;
  }, [remoteMuted, remoteVolume, duckWhileTts, ttsIsPlaying, remoteAudioRef]);

  return { handleSignalingMessage };
}
