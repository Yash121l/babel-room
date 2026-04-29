import type {
  IceCandidateJson,
  RoomClientMessage,
  WSMessageType,
} from "@babel-room/shared";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../lib/logger";

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

type QueuedSignal = Extract<WSMessageType, { type: "webrtc_signal" }>;

/**
 * Two-party WebRTC audio: deterministic caller (lexicographically smaller id) sends the offer.
 * Queues signaling messages that arrive before the peer connection is constructed.
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
  iceServers: RTCIceServer[];
}): {
  handleSignalingMessage: (msg: WSMessageType) => void;
  peerConnectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  resumeRemoteAudio: () => Promise<void>;
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
    iceServers,
  } = options;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteDescSetRef = useRef(false);
  const pendingRemoteIceRef = useRef<IceCandidateJson[]>([]);
  const prePcSignalsRef = useRef<QueuedSignal[]>([]);

  const [peerConnectionState, setPeerConnectionState] =
    useState<RTCPeerConnectionState | null>(null);
  const [iceConnectionState, setIceConnectionState] =
    useState<RTCIceConnectionState | null>(null);

  const teardownPc = useCallback((): void => {
    pendingRemoteIceRef.current = [];
    remoteDescSetRef.current = false;
    const pc = pcRef.current;
    pcRef.current = null;
    setPeerConnectionState(null);
    setIceConnectionState(null);
    if (pc) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
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

  const applySignal = useCallback(
    async (pc: RTCPeerConnection, msg: QueuedSignal): Promise<void> => {
      if (msg.to !== selfId) return;
      const from = msg.from;
      if (!from || from === selfId || from !== peerId) return;

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
    },
    [flushPendingIce, peerId, selfId, sendRoomMessage],
  );

  const handleSignalingMessage = useCallback(
    (msg: WSMessageType): void => {
      if (msg.type !== "webrtc_signal") return;
      const pc = pcRef.current;
      if (!pc) {
        prePcSignalsRef.current.push(msg);
        return;
      }
      void applySignal(pc, msg);
    },
    [applySignal],
  );

  const resumeRemoteAudio = useCallback(async (): Promise<void> => {
    const el = remoteAudioRef.current;
    if (!el) return;
    try {
      await el.play();
    } catch (e) {
      logger.warn("webrtc_remote_play_failed", { message: String(e) });
    }
  }, [remoteAudioRef]);

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
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
    });
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      setPeerConnectionState(pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
    };

    pc.ontrack = (ev) => {
      const el = remoteAudioRef.current;
      if (el && ev.streams[0]) {
        el.srcObject = ev.streams[0];
        el.muted = false;
        void el.play().catch(() => {
          logger.info("webrtc_remote_play_blocked", {});
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

    for (const t of audioTracks) {
      pc.addTrack(t, mediaStream);
    }

    const backlog = prePcSignalsRef.current.splice(0);
    for (const m of backlog) {
      void applySignal(pc, m);
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
    iceServers,
    sendRoomMessage,
    teardownPc,
    applySignal,
  ]);

  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.muted = false;
    const ducked =
      duckWhileTts && ttsIsPlaying ? Math.min(remoteVolume, 0.25) : remoteVolume;
    el.volume = remoteMuted ? 0 : ducked;
  }, [remoteMuted, remoteVolume, duckWhileTts, ttsIsPlaying, remoteAudioRef]);

  return {
    handleSignalingMessage,
    peerConnectionState,
    iceConnectionState,
    resumeRemoteAudio,
  };
}
