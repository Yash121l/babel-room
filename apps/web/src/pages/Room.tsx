import type { Language, WSMessageType } from "@babel-room/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  AudioVisualizer,
  LatencyIndicator,
  ParticipantGrid,
  TranscriptPanel,
} from "../components";
import { useRoom, useTranscript, useWebRTC } from "../hooks";
import { joinRoom } from "../lib/api";
import { logger } from "../lib/logger";

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function Room(): JSX.Element {
  const { roomId: roomIdParam } = useParams();
  const location = useLocation() as {
    state?: {
      displayName?: string;
      sourceLang?: Language;
      targetLang?: Language;
    };
  };

  const roomId = roomIdParam ?? "";
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pipelineMs, setPipelineMs] = useState<number | null>(null);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() => new Set());
  const playbackRef = useRef<AudioContext | null>(null);
  const speakingTimers = useRef<Map<string, number>>(new Map());

  const { lines, addLine } = useTranscript();

  const markSpeaking = useCallback((id: string) => {
    setSpeakingIds((prev) => new Set(prev).add(id));
    const existing = speakingTimers.current.get(id);
    if (existing !== undefined) window.clearTimeout(existing);
    const t = window.setTimeout(() => {
      setSpeakingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      speakingTimers.current.delete(id);
    }, 1200);
    speakingTimers.current.set(id, t);
  }, []);

  const onWsMessage = useCallback(
    (msg: WSMessageType) => {
      if (msg.type === "transcript_segment") {
        addLine({
          participantId: msg.participantId,
          text: msg.text,
          lang: msg.lang,
          ts: msg.ts,
        });
        markSpeaking(msg.participantId);
      }
      if (msg.type === "translated_audio") {
        void (async () => {
          try {
            const bytes = base64ToUint8Array(msg.audioB64);
            const ab = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(ab).set(bytes);
            const ctx = playbackRef.current ?? new AudioContext();
            playbackRef.current = ctx;
            const audioBuffer = await ctx.decodeAudioData(ab);
            const src = ctx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(ctx.destination);
            src.start();
          } catch (e) {
            logger.error("playback_failed", { message: String(e) });
          }
        })();
      }
    },
    [addLine, markSpeaking],
  );

  const { participants, lastError } = useRoom(wsUrl, {
    onMessage: onWsMessage,
  });

  const onBatchUploaded = useCallback(() => {
    if (participantId) markSpeaking(participantId);
  }, [markSpeaking, participantId]);

  const { isCapturing, error: micError, mediaStream } = useWebRTC({
    roomId,
    participantId,
    enabled: Boolean(wsUrl && participantId),
    onPipelineLatency: setPipelineMs,
    onBatchUploaded,
  });

  useEffect(() => {
    const run = async (): Promise<void> => {
      if (!roomId || roomId.length !== 8) {
        setJoinError("Invalid room.");
        return;
      }
      const dn = location.state?.displayName;
      const sl = location.state?.sourceLang;
      const tl = location.state?.targetLang;
      if (!dn || !sl || !tl) {
        setJoinError("Start from the home page with your profile.");
        return;
      }
      try {
        const res = await joinRoom(roomId, {
          displayName: dn,
          sourceLang: sl,
          targetLang: tl,
        });
        setParticipantId(res.participantId);
        setWsUrl(res.wsUrl);
      } catch {
        setJoinError("Could not join this room.");
      }
    };
    void run();
  }, [location.state, roomId]);

  const participantNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of Object.values(participants)) {
      m[p.id] = p.displayName;
    }
    return m;
  }, [participants]);

  useEffect(() => {
    return () => {
      for (const t of speakingTimers.current.values()) {
        window.clearTimeout(t);
      }
      speakingTimers.current.clear();
    };
  }, []);

  if (joinError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-rose-400">
        {joinError}
      </div>
    );
  }

  if (!participantId || !wsUrl) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-room-muted">
        Joining room…
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Room {roomId}</h1>
          <p className="text-sm text-room-muted">
            {isCapturing ? "Microphone live" : "Starting microphone…"}
            {micError ? ` · ${micError}` : ""}
          </p>
        </div>
        <LatencyIndicator pipelineMs={pipelineMs} />
      </header>

      {lastError ? (
        <p className="text-sm text-amber-400" role="status">
          {lastError}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-room-muted">
          Participants
        </h2>
        <ParticipantGrid
          participants={participants}
          selfId={participantId}
          speakingIds={speakingIds}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-room-muted">
          Your audio
        </h2>
        <AudioVisualizer stream={mediaStream} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-room-muted">
          Transcript
        </h2>
        <TranscriptPanel lines={lines} participantNames={participantNames} />
      </section>
    </div>
  );
}
