import type { Language, WSMessageType } from "@babel-room/shared";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AudioVisualizer,
  EndCallDialog,
  LanguageSelector,
  LatencyIndicator,
  ParticipantGrid,
  TranscriptPanel,
} from "../components";
import {
  useRoom,
  useRoomPeerAudio,
  useSequentialAudioPlayback,
  useTranscript,
  useWebRTC,
} from "../hooks";
import { endRoom, fetchWebRtcIceConfig, joinRoom } from "../lib/api";
import { logger } from "../lib/logger";
import { loadRoomProfile, saveRoomProfile, type RoomJoinProfile } from "../lib/roomProfile";
import { parseTranscriptSegmentTranslations } from "../lib/transcriptWire";
import { parseViteWebRtcIceServers } from "../lib/webrtcIce";

/** Invite URL: opening it uses saved profile on this device or shows a short join form. */
function joinUrlForRoom(roomId: string): string {
  const path = `/room/${roomId}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

type LocationState = {
  displayName?: string;
  sourceLang?: Language;
  targetLang?: Language;
};

function profileFromLocationState(state: unknown): RoomJoinProfile | null {
  if (!state || typeof state !== "object") return null;
  const s = state as LocationState;
  const dn = typeof s.displayName === "string" ? s.displayName.trim() : "";
  if (!dn || !s.sourceLang || !s.targetLang) return null;
  return {
    displayName: dn,
    sourceLang: s.sourceLang,
    targetLang: s.targetLang,
  };
}

export function Room(): JSX.Element {
  const { roomId: roomIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const roomId = roomIdParam ?? "";
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSourceLang, setFormSourceLang] = useState<Language>("en");
  const [formTargetLang, setFormTargetLang] = useState<Language>("es");
  const [pipelineMs, setPipelineMs] = useState<number | null>(null);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() => new Set());
  const [micSessionActive, setMicSessionActive] = useState(true);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endCallBusy, setEndCallBusy] = useState(false);
  const [endCallError, setEndCallError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [isRoomHost, setIsRoomHost] = useState(false);
  const [webrtcReset, setWebrtcReset] = useState(0);
  const [transcriptMode, setTranscriptMode] = useState<"mine" | "original">("mine");
  /** What you want to hear: both live + AI, live people only, or AI translation only. */
  const [listeningMode, setListeningMode] = useState<"both" | "peer" | "ai">("both");
  const [translationTtsVolume, setTranslationTtsVolume] = useState(1);
  const [peerVoiceVolume, setPeerVoiceVolume] = useState(1);
  const [duckRemoteWhileTts, setDuckRemoteWhileTts] = useState(true);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(() =>
    parseViteWebRtcIceServers(),
  );
  const speakingTimers = useRef<Map<string, number>>(new Map());
  const joinKeyRef = useRef(0);

  const peerVoiceEnabled = listeningMode !== "ai";
  const translationTtsEnabled = listeningMode !== "peer";

  useEffect(() => {
    let alive = true;
    void fetchWebRtcIceConfig()
      .then((r) => {
        if (!alive || !r.iceServers?.length) return;
        setIceServers(r.iceServers);
      })
      .catch(() => {
        if (!alive) return;
        setIceServers(parseViteWebRtcIceServers());
      });
    return () => {
      alive = false;
    };
  }, []);

  const {
    enqueue: enqueueTranslationAudio,
    clearQueue: clearTranslationAudioQueue,
    dispose: disposeTranslationAudio,
    setMuted: setTranslationTtsMuted,
    setVolume: setTranslationTtsVol,
    isPlaying: translationTtsIsPlaying,
    queueDepth: translationTtsQueueDepth,
  } = useSequentialAudioPlayback();

  const resolvedProfile = useMemo((): RoomJoinProfile | null => {
    const fromNav = profileFromLocationState(location.state);
    if (fromNav) return fromNav;
    if (typeof window === "undefined") return null;
    return loadRoomProfile();
  }, [location.state]);

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

  const handlePeerSignalingRef = useRef<(msg: WSMessageType) => void>(() => {});

  const onWsMessage = useCallback(
    (msg: WSMessageType) => {
      handlePeerSignalingRef.current(msg);
      if (msg.type === "transcript_segment") {
        addLine({
          participantId: msg.participantId,
          sourceText: msg.sourceText,
          sourceLang: msg.sourceLang,
          translations: parseTranscriptSegmentTranslations(msg.translations),
          ts: msg.ts,
        });
        markSpeaking(msg.participantId);
      }
      if (msg.type === "translated_audio") {
        if (participantId && msg.targetParticipantId !== participantId) {
          return;
        }
        if (!translationTtsEnabled) return;
        enqueueTranslationAudio(msg.audioB64);
      }
    },
    [
      addLine,
      enqueueTranslationAudio,
      markSpeaking,
      participantId,
      translationTtsEnabled,
    ],
  );

  const { participants, roomActive, lastError, sendPing, sendRoomMessage } =
    useRoom(wsUrl, {
      onMessage: onWsMessage,
    });

  const peerId = useMemo(() => {
    const ids = Object.keys(participants);
    if (ids.length !== 2 || !participantId) return null;
    return ids.find((id) => id !== participantId) ?? null;
  }, [participants, participantId]);

  const myTargetLang = useMemo((): Language => {
    if (participantId && participants[participantId]) {
      return participants[participantId].targetLang;
    }
    return resolvedProfile?.targetLang ?? "en";
  }, [participantId, participants, resolvedProfile]);

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

  const {
    handleSignalingMessage: handlePeerWebrtcMessage,
    peerConnectionState,
    iceConnectionState,
    resumeRemoteAudio,
  } = useRoomPeerAudio({
    selfId: participantId ?? "",
    peerId,
    mediaStream,
    sendRoomMessage,
    enabled: Boolean(
      roomActive && participantId && peerId && mediaStream && listeningMode !== "ai",
    ),
    remoteMuted: !peerVoiceEnabled,
    remoteVolume: peerVoiceVolume,
    duckWhileTts: duckRemoteWhileTts,
    ttsIsPlaying: translationTtsIsPlaying,
    remoteAudioRef,
    iceServers,
    resetSignal: webrtcReset,
  });

  useLayoutEffect(() => {
    handlePeerSignalingRef.current = handlePeerWebrtcMessage;
  }, [handlePeerWebrtcMessage]);

  useEffect(() => {
    setTranslationTtsMuted(!translationTtsEnabled);
  }, [translationTtsEnabled, setTranslationTtsMuted]);

  useEffect(() => {
    setTranslationTtsVol(translationTtsVolume);
  }, [translationTtsVolume, setTranslationTtsVol]);

  useEffect(() => {
    if (!roomActive) setMicSessionActive(false);
  }, [roomActive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      sendPing();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [sendPing]);

  useLayoutEffect(() => {
    if (participantId && wsUrl) return;

    setJoinError(null);
    if (!roomId || roomId.length !== 8) {
      setJoinError("Invalid room code.");
      setShowJoinForm(true);
      setIsJoining(false);
      return;
    }

    const profile = resolvedProfile;
    if (!profile) {
      setFormName("");
      setFormSourceLang("en");
      setFormTargetLang("es");
      setShowJoinForm(true);
      setIsJoining(false);
      return;
    }

    const joinKey = ++joinKeyRef.current;
    setShowJoinForm(false);
    setIsJoining(true);

    const run = async (): Promise<void> => {
      try {
        saveRoomProfile(profile);
        const res = await joinRoom(roomId, profile);
        if (joinKey !== joinKeyRef.current) return;
        setParticipantId(res.participantId);
        setWsUrl(res.wsUrl);
        setIsRoomHost(res.isRoomHost === true);
        try {
          sessionStorage.setItem(
            `babel-room:${roomId}:participantId`,
            res.participantId,
          );
        } catch {
          /* ignore quota */
        }
        setJoinError(null);
      } catch {
        if (joinKey !== joinKeyRef.current) return;
        setJoinError("Could not join this room. It may be full, ended, or the code may be wrong.");
        setShowJoinForm(true);
        setFormName(profile.displayName);
        setFormSourceLang(profile.sourceLang);
        setFormTargetLang(profile.targetLang);
      } finally {
        if (joinKey === joinKeyRef.current) setIsJoining(false);
      }
    };
    void run();
  }, [roomId, resolvedProfile, participantId, wsUrl]);

  const onSubmitJoinForm = useCallback(async (): Promise<void> => {
    const dn = formName.trim();
    if (!dn) {
      setJoinError("Display name is required.");
      return;
    }
    setJoinError(null);
    setIsJoining(true);
    const profile: RoomJoinProfile = {
      displayName: dn,
      sourceLang: formSourceLang,
      targetLang: formTargetLang,
    };
    const joinKey = ++joinKeyRef.current;
    try {
      saveRoomProfile(profile);
      const res = await joinRoom(roomId, profile);
      if (joinKey !== joinKeyRef.current) return;
      setParticipantId(res.participantId);
      setWsUrl(res.wsUrl);
      setIsRoomHost(res.isRoomHost === true);
      try {
        sessionStorage.setItem(
          `babel-room:${roomId}:participantId`,
          res.participantId,
        );
      } catch {
        /* ignore quota */
      }
      setShowJoinForm(false);
    } catch {
      if (joinKey !== joinKeyRef.current) return;
      setJoinError("Could not join this room.");
    } finally {
      if (joinKey === joinKeyRef.current) setIsJoining(false);
    }
  }, [formName, formSourceLang, formTargetLang, roomId]);

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
    clearTranslationAudioQueue();
    await disposeTranslationAudio();
  }, [clearTranslationAudioQueue, disposeTranslationAudio]);

  const onConfirmEndCall = useCallback(async (): Promise<void> => {
    if (!participantId) return;
    setEndCallError(null);
    setEndCallBusy(true);
    try {
      await endRoom(roomId, participantId);
      setMicSessionActive(false);
      await stopPlayback();
      setEndDialogOpen(false);
      navigate(`/room/${roomId}/summary`, { state: { participantId } });
    } catch {
      setEndCallError("Could not end the call. Try again.");
    } finally {
      setEndCallBusy(false);
    }
  }, [navigate, participantId, roomId, stopPlayback]);

  const onCopyLink = useCallback(async (): Promise<void> => {
    const url = joinUrlForRoom(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2500);
    } catch {
      logger.error("clipboard_failed", {});
      window.prompt("Copy this link:", url);
    }
  }, [roomId]);

  if (showJoinForm && (!participantId || !wsUrl)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
        <header>
          <h1 className="text-2xl font-semibold text-white">Join room</h1>
          <p className="mt-1 font-mono text-sm text-room-accent">{roomId}</p>
          <p className="mt-3 text-sm text-room-muted">
            Pasted a link? Choose the language you speak and the language you want
            to hear from others. We remember this device&apos;s last choice next
            time.
          </p>
        </header>

        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-room-panel p-6">
          <label className="flex flex-col gap-1 text-sm" htmlFor="roomJoinName">
            <span className="text-room-muted">Display name</span>
            <input
              id="roomJoinName"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-room-accent"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoComplete="nickname"
              disabled={isJoining}
            />
          </label>
          <LanguageSelector
            id="roomJoinSource"
            label="Language you speak"
            value={formSourceLang}
            onChange={setFormSourceLang}
          />
          <LanguageSelector
            id="roomJoinTarget"
            label="Language you want to hear"
            value={formTargetLang}
            onChange={setFormTargetLang}
          />
          <p className="text-xs text-room-muted">
            <strong className="text-slate-300">How it works:</strong> open a second
            browser or incognito, join the same room, and set complementary languages
            (for example English→Spanish and Spanish→English). You get live
            WebRTC voices between participants plus translated speech (TTS) in your
            chosen &quot;hear&quot; language. Use headphones for the best experience.
          </p>
          {joinError ? (
            <p className="text-sm text-rose-400" role="alert">
              {joinError}
            </p>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-room-accent px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-300 disabled:opacity-50"
            disabled={isJoining}
            onClick={() => void onSubmitJoinForm()}
          >
            {isJoining ? "Joining…" : "Join room"}
          </button>
          <Link
            to="/"
            className="text-center text-sm text-room-muted underline-offset-2 hover:text-room-accent hover:underline"
          >
            Back to home
          </Link>
        </div>
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

      <audio ref={remoteAudioRef} className="hidden" autoPlay playsInline />

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
              {peerId
                ? " · Live peer audio (WebRTC) when enabled below"
                : " · Peer audio connects automatically when two people are in the room"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              title="Copies the room link. Guests can open it here or in another browser; if this device has no saved profile, they pick name and languages once."
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 sm:text-sm"
              onClick={() => void onCopyLink()}
            >
              {copyDone ? "Copied" : "Copy invite link"}
            </button>
            <LatencyIndicator pipelineMs={pipelineMs} />
            {isRoomHost ? (
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
            ) : (
              <span
                className="max-w-[11rem] text-right text-[10px] leading-snug text-slate-500 sm:max-w-none sm:text-xs"
                title="The first person to join this room can end it and open call notes."
              >
                Only the host can end the call or open notes.
              </span>
            )}
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

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,1fr)] lg:items-start">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 max-h-[min(88dvh,920px)] lg:sticky lg:top-24 lg:max-h-[calc(100dvh-6.5rem)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Transcript
                </h2>
                <p className="mt-1 max-w-md text-xs text-slate-500">
                  Full caption stream (lyrics-style scroll); follows the newest line
                  until you scroll up. Toggle caption mode on the right—Copy exports
                  the buffer.
                </p>
              </div>
              <div
                className="flex shrink-0 gap-0.5 rounded-xl border border-slate-600/80 bg-slate-900/80 p-1 shadow-inner"
                role="tablist"
                aria-label="Transcript display mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={transcriptMode === "mine"}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    transcriptMode === "mine"
                      ? "bg-sky-600 text-white shadow"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                  onClick={() => setTranscriptMode("mine")}
                >
                  My language
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={transcriptMode === "original"}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    transcriptMode === "original"
                      ? "bg-sky-600 text-white shadow"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                  onClick={() => setTranscriptMode("original")}
                >
                  Original
                </button>
              </div>
            </div>
            <TranscriptPanel
              lines={lines}
              participantNames={participantNames}
              viewerTargetLang={myTargetLang}
              transcriptMode={transcriptMode}
              className="min-h-0 flex-1"
            />
          </section>

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

            <section className="space-y-4 rounded-2xl border border-slate-700/80 bg-room-panel p-5 shadow-lg shadow-black/10">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Listening
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Choose how you hear the other person: their real voice (WebRTC), AI
                  translated speech (TTS), or both. On many networks you need TURN for
                  WebRTC—set{" "}
                  <code className="rounded bg-slate-800 px-1 text-room-accent">
                    WEBRTC_ICE_SERVERS
                  </code>{" "}
                  on the Worker (see README).
                </p>
              </div>

              <div
                className="flex flex-col gap-2 rounded-xl border border-slate-700/60 bg-slate-950/50 p-1 sm:flex-row"
                role="tablist"
                aria-label="Listening source"
              >
                {(
                  [
                    { id: "both" as const, label: "Both", hint: "Live + AI" },
                    { id: "peer" as const, label: "People", hint: "WebRTC only" },
                    { id: "ai" as const, label: "AI voice", hint: "TTS only" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={listeningMode === opt.id}
                    className={`flex flex-1 flex-col items-center rounded-lg px-3 py-2.5 text-center transition-colors ${
                      listeningMode === opt.id
                        ? "bg-sky-600 text-white shadow-md"
                        : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                    }`}
                    onClick={() => setListeningMode(opt.id)}
                  >
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span
                      className={`mt-0.5 text-[10px] ${
                        listeningMode === opt.id ? "text-sky-100" : "text-slate-500"
                      }`}
                    >
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>

              {peerId && listeningMode !== "ai" ? (
                <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      WebRTC:{" "}
                      <span className="font-medium text-slate-200">
                        {peerConnectionState ?? "…"}
                      </span>
                      {iceConnectionState ? (
                        <>
                          {" "}
                          · ICE:{" "}
                          <span className="font-medium text-slate-200">
                            {iceConnectionState}
                          </span>
                        </>
                      ) : null}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(iceConnectionState === "failed" ||
                        iceConnectionState === "disconnected" ||
                        peerConnectionState === "failed") && (
                        <button
                          type="button"
                          className="rounded-md bg-sky-800 px-2 py-1 text-[11px] font-medium text-sky-100 hover:bg-sky-700"
                          onClick={() => setWebrtcReset((n) => n + 1)}
                        >
                          Reconnect peer
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-md bg-slate-700 px-2 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-600"
                        onClick={() => void resumeRemoteAudio()}
                      >
                        Play remote audio
                      </button>
                    </div>
                  </div>
                  {(iceConnectionState === "failed" ||
                    peerConnectionState === "failed") && (
                    <p className="mt-2 text-amber-200/90">
                      Connection failed—tap{" "}
                      <span className="font-medium">Play remote audio</span> after
                      you click the page, try{" "}
                      <span className="font-medium">Reconnect peer</span>, and ensure
                      TURN is set in{" "}
                      <code className="text-room-accent">WEBRTC_ICE_SERVERS</code>{" "}
                      on the Worker (symmetric NAT / strict firewalls often need relay).
                    </p>
                  )}
                  {iceConnectionState === "disconnected" &&
                    peerConnectionState !== "failed" && (
                      <p className="mt-2 text-slate-400">
                        ICE disconnected—you can try{" "}
                        <span className="font-medium text-slate-200">
                          Reconnect peer
                        </span>{" "}
                        or check your network.
                      </p>
                    )}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 text-sm">
                <div
                  className={`flex flex-col gap-2 ${listeningMode === "ai" ? "opacity-40" : ""}`}
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Live voices volume
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-room-muted">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(peerVoiceVolume * 100)}
                      onChange={(e) =>
                        setPeerVoiceVolume(Number(e.target.value) / 100)
                      }
                      disabled={listeningMode === "ai"}
                      className="h-2 flex-1 min-w-[8rem] accent-sky-500"
                      aria-label="Peer voice volume"
                    />
                  </div>
                </div>
                <div
                  className={`flex flex-col gap-2 ${listeningMode === "peer" ? "opacity-40" : ""}`}
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    AI translation (TTS) volume
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-room-muted">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(translationTtsVolume * 100)}
                      onChange={(e) =>
                        setTranslationTtsVolume(Number(e.target.value) / 100)
                      }
                      disabled={listeningMode === "peer"}
                      className="h-2 flex-1 min-w-[8rem] accent-amber-500"
                      aria-label="Translated TTS volume"
                    />
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                  <input
                    type="checkbox"
                    checked={duckRemoteWhileTts}
                    onChange={(e) => setDuckRemoteWhileTts(e.target.checked)}
                    disabled={listeningMode !== "both"}
                    className="rounded border-slate-600"
                  />
                  When using both, lower live voices while AI TTS plays
                </label>
                <p className="text-xs text-slate-500">
                  TTS queue: {translationTtsQueueDepth}
                  {translationTtsIsPlaying ? " · playing" : ""}
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-room-muted">
                Your microphone
              </h2>
              <AudioVisualizer stream={mediaStream} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
