import type { Language, WSMessageType } from "@babel-room/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AudioVisualizer,
  EndCallDialog,
  LatencyIndicator,
  ParticipantGrid,
  TranscriptPanel,
} from "../components";
import { useRoom, useTranscript, useWebRTC } from "../hooks";
import { endRoom, joinRoom } from "../lib/api";
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

function joinUrlForRoom(roomId: string): string {
  const path = `/room/${roomId}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function Room(): JSX.Element {
  const { roomId: roomIdParam } = useParams();
  const navigate = useNavigate();
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
  const [micSessionActive, setMicSessionActive] = useState(true);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endCallBusy, setEndCallBusy] = useState(false);
  const [endCallError, setEndCallError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
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

  const { participants, roomActive, lastError, sendPing } = useRoom(wsUrl, {
    onMessage: onWsMessage,
  });

  useEffect(() => {
    if (!roomActive) setMicSessionActive(false);
  }, [roomActive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      sendPing();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [sendPing]);

  const onBatchUploaded = useCallback(() => {
    if (participantId) markSpeaking(participantId);
  }, [markSpeaking, participantId]);

  const captureEnabled = Boolean(
    wsUrl && participantId && micSessionActive && roomActive,
  );

  const { isCapturing, error: micError, mediaStream } = useWebRTC({
    roomId,
    participantId,
    enabled: captureEnabled,
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

  const stopPlayback = useCallback(async (): Promise<void> => {
    const ctx = playbackRef.current;
    playbackRef.current = null;
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const onConfirmEndCall = useCallback(async (): Promise<void> => {
    setEndCallError(null);
    setEndCallBusy(true);
    try {
      await endRoom(roomId);
      setMicSessionActive(false);
      await stopPlayback();
      setEndDialogOpen(false);
      navigate(`/room/${roomId}/summary`);
    } catch {
      setEndCallError("Could not end the call. Try again.");
    } finally {
      setEndCallBusy(false);
    }
  }, [navigate, roomId, stopPlayback]);

  const onCopyLink = useCallback(async (): Promise<void> => {
    const url = joinUrlForRoom(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      logger.error("clipboard_failed", {});
    }
  }, [roomId]);

  if (joinError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-rose-400">
        {joinError}
      </div>
    );
  }

  if (!participantId || !wsUrl) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-room-accent border-t-transparent"
          aria-hidden
        />
        <p className="text-sm text-room-muted">Joining room…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10">
      <EndCallDialog
        open={endDialogOpen}
        onClose={() => {
          if (!endCallBusy) {
            setEndDialogOpen(false);
            setEndCallError(null);
          }
        }}
        onConfirm={() => void onConfirmEndCall()}
        busy={endCallBusy}
        error={endCallError}
      />

      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-room-bg/90 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-room-bg/75">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">
              Room{" "}
              <span className="font-mono tracking-wide text-room-accent">
                {roomId}
              </span>
            </h1>
            <p className="mt-1 text-sm text-room-muted">
              {isCapturing ? "Microphone live" : "Starting microphone…"}
              {micError ? ` · ${micError}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 sm:text-sm"
              onClick={() => void onCopyLink()}
            >
              {copyDone ? "Copied" : "Copy room link"}
            </button>
            <LatencyIndicator pipelineMs={pipelineMs} />
            <button
              type="button"
              className="rounded-lg bg-room-danger px-3 py-2 text-xs font-medium text-slate-950 hover:brightness-110 disabled:opacity-50 sm:text-sm"
              disabled={!roomActive || endCallBusy}
              onClick={() => {
                setEndCallError(null);
                setEndDialogOpen(true);
              }}
            >
              End call
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-6">
        {!roomActive ? (
          <div
            className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200"
            role="status"
          >
            <p>This room has ended.</p>
            <Link
              to="/"
              className="mt-2 inline-block text-room-accent underline-offset-2 hover:underline"
            >
              Back to home
            </Link>
          </div>
        ) : null}

        {lastError && roomActive ? (
          <p className="mb-4 text-sm text-amber-400" role="status">
            {lastError}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
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
          </div>

          <section className="flex min-h-0 flex-col gap-3 lg:sticky lg:top-28">
            <h2 className="text-sm font-medium uppercase tracking-wide text-room-muted">
              Transcript
            </h2>
            <TranscriptPanel
              lines={lines}
              participantNames={participantNames}
              className="min-h-[280px] max-h-[min(560px,calc(100vh-14rem))] lg:max-h-[calc(100vh-10rem)]"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
