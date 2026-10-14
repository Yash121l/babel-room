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
  useOrderedTranslationTts,
  useRoom,
  useRoomPeerAudio,
  useSequentialAudioPlayback,
  useTranscript,
  useWebRTC,
} from "../hooks";
import { track } from "../lib/analytics";
import { endRoom, fetchWebRtcIceConfig, joinRoom } from "../lib/api";
import { logger } from "../lib/logger";
import {
  loadRoomProfile,
  saveRoomProfile,
  type RoomJoinProfile,
} from "../lib/roomProfile";
import { parseTranscriptSegmentTranslations } from "../lib/transcriptWire";
import { parseViteWebRtcIceServers } from "../lib/webrtcIce";

function joinUrlForRoom(roomId: string): string {
  const path = `/room/${roomId}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

type LocationState = { displayName?: string; sourceLang?: Language; targetLang?: Language };

function profileFromLocationState(state: unknown): RoomJoinProfile | null {
  if (!state || typeof state !== "object") return null;
  const s = state as LocationState;
  const dn = typeof s.displayName === "string" ? s.displayName.trim() : "";
  if (!dn || !s.sourceLang || !s.targetLang) return null;
  return { displayName: dn, sourceLang: s.sourceLang, targetLang: s.targetLang };
}

/* ── Shared UI primitives ─────────────────────────────────────── */
function HardBtn(props: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "outline" | "accent" | "danger";
  style?: React.CSSProperties;
  className?: string;
}) {
  const { children, onClick, disabled, variant = "outline", style, className } = props;
  const [down, setDown] = useState(false);

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "var(--sans)",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "6px 14px",
    border: "1px solid var(--ink)",
    cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: 2,
    userSelect: "none",
    opacity: disabled ? 0.45 : 1,
    transform: down ? "translate(2px,2px)" : "none",
    transition: "transform 0.08s, box-shadow 0.08s",
  };

  const variants: Record<string, React.CSSProperties> = {
    outline: {
      background: "transparent",
      color: "var(--ink)",
      boxShadow: down ? "none" : "2px 2px 0 var(--ink)",
    },
    accent: {
      background: "var(--accent)",
      color: "var(--paper)",
      border: "1px solid var(--accent)",
      boxShadow: down ? "none" : "2px 2px 0 rgba(0,0,0,0.2)",
    },
    danger: {
      background: "transparent",
      color: "#C0392B",
      border: "1px solid #C0392B",
      boxShadow: down ? "none" : "2px 2px 0 #C0392B",
    },
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      onMouseLeave={() => setDown(false)}
      className={className}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

/* ── Volume slider ────────────────────────────────────────────── */
function VolumeSlider(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
  disabled?: boolean;
}) {
  const { label, value, onChange, color, disabled } = props;
  const pct = Math.round(value * 100);
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
          {label}
        </span>
        <span className="font-mono text-[11px] text-ink-light">{pct}%</span>
      </div>
      <div
        className="relative cursor-pointer"
        style={{
          height: 3,
          background: "var(--warm-white)",
          border: "1px solid var(--rule)",
          borderRadius: 1,
        }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onChange(Math.round(((e.clientX - r.left) / r.width) * 100) / 100);
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 1 }} />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${pct}%`,
            transform: "translate(-50%,-50%)",
            width: 11,
            height: 11,
            background: color,
            border: "2px solid var(--paper)",
            borderRadius: 1,
            boxShadow: "1px 1px 0 var(--ink)",
          }}
        />
      </div>
    </div>
  );
}

/* ── Toggle switch ────────────────────────────────────────────── */
function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const { checked, onChange, label } = props;
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 28,
          height: 16,
          border: "1px solid var(--ink)",
          borderRadius: 1,
          position: "relative",
          background: checked ? "var(--ink)" : "transparent",
          cursor: "pointer",
          flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 13 : 2,
            width: 10,
            height: 10,
            background: checked ? "var(--paper)" : "var(--ink)",
            borderRadius: 1,
            transition: "left 0.15s",
          }}
        />
      </div>
      <span className="text-[11px] leading-snug text-ink-light">{label}</span>
    </label>
  );
}

/* ── JOIN FORM ────────────────────────────────────────────────── */
function JoinForm(props: {
  roomId: string;
  name: string;
  sourceLang: Language;
  targetLang: Language;
  isJoining: boolean;
  error: string | null;
  onChangeName: (v: string) => void;
  onChangeSource: (v: Language) => void;
  onChangeTarget: (v: Language) => void;
  onSubmit: () => void;
}) {
  const { roomId, name, sourceLang, targetLang, isJoining, error,
    onChangeName, onChangeSource, onChangeTarget, onSubmit } = props;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-paper px-4">
      <div
        className="w-full max-w-md bg-paper p-10"
        style={{
          border: "1px solid var(--ink)",
          boxShadow: "4px 4px 0 var(--ink)",
          borderRadius: 2,
          animation: "fadeUp 0.4s ease",
        }}
      >
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
          Room {roomId}
        </p>
        <div style={{ height: 1, background: "var(--ink)", marginBottom: 24 }} />
        <h1 className="mb-1 font-serif text-2xl text-ink">Join room</h1>
        <p className="mb-6 text-sm leading-relaxed text-ink-light">
          Choose the language you speak and the language you want to hear from others.
        </p>

        <div className="mb-4">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
            disabled={isJoining}
            autoComplete="nickname"
            className="w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none"
            style={{ border: "1px solid var(--rule)", borderRadius: 2 }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--ink)"; e.currentTarget.style.boxShadow = "2px 2px 0 var(--ink)"; }}
            onBlur={(e) => { e.currentTarget.style.border = "1px solid var(--rule)"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>

        <div className="mb-6" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <LanguageSelector id="js-src" label="You speak" value={sourceLang} onChange={onChangeSource} disabled={isJoining} />
          <LanguageSelector id="js-tgt" label="You hear" value={targetLang} onChange={onChangeTarget} disabled={isJoining} />
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 text-[13px]" style={{ border: "1px solid #C0392B", borderLeft: "3px solid #C0392B", color: "#C0392B", borderRadius: 2 }}>
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={isJoining}
          onClick={onSubmit}
          className="flex w-full cursor-pointer items-center justify-center gap-2 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-paper disabled:opacity-50"
          style={{ background: "var(--terracotta)", border: "1px solid var(--terracotta)", borderRadius: 2, boxShadow: "2px 2px 0 rgba(0,0,0,0.2)" }}
        >
          {isJoining ? "Joining…" : "Join room →"}
        </button>

        <Link
          to="/"
          className="mt-4 block text-center text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

/* ── ROOM ─────────────────────────────────────────────────────── */
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
  const [listeningMode, setListeningMode] = useState<"both" | "peer" | "ai">("both");
  const [translationTtsVolume, setTranslationTtsVolume] = useState(1);
  const [peerVoiceVolume, setPeerVoiceVolume] = useState(1);
  const [duckRemoteWhileTts, setDuckRemoteWhileTts] = useState(true);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(() => parseViteWebRtcIceServers());
  const speakingTimers = useRef<Map<string, number>>(new Map());
  const joinKeyRef = useRef(0);
  const joinedAtRef = useRef<number | null>(null);

  const peerVoiceEnabled = listeningMode !== "ai";
  const translationTtsEnabled = listeningMode !== "peer";

  useEffect(() => {
    let alive = true;
    void fetchWebRtcIceConfig()
      .then((r) => { if (!alive || !r.iceServers?.length) return; setIceServers(r.iceServers); })
      .catch(() => { if (!alive) return; setIceServers(parseViteWebRtcIceServers()); });
    return () => { alive = false; };
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

  const enqueueOrderedTranslationRef = useRef<
    (speakerId: string, sequenceNum: number, audioB64: string) => void
  >(() => {});

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
      setSpeakingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
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
          ...(msg.sequenceNum !== undefined
            ? { sequenceNum: msg.sequenceNum }
            : {}),
        });
        markSpeaking(msg.participantId);
      }
      if (msg.type === "translated_audio") {
        if (participantId && msg.targetParticipantId !== participantId) return;
        if (!translationTtsEnabled) return;
        if (
          msg.speakerParticipantId !== undefined &&
          msg.sequenceNum !== undefined
        ) {
          enqueueOrderedTranslationRef.current(
            msg.speakerParticipantId,
            msg.sequenceNum,
            msg.audioB64,
          );
        } else {
          enqueueTranslationAudio(msg.audioB64);
        }
      }
    },
    [addLine, enqueueTranslationAudio, markSpeaking, participantId, translationTtsEnabled],
  );

  const { participants, roomActive, lastError, sendPing, sendRoomMessage } =
    useRoom(wsUrl, { onMessage: onWsMessage });

  const hostParticipantId = useMemo((): string | null => {
    const list = Object.values(participants);
    if (list.length === 0) return null;
    const sorted = [...list].sort((a, b) => a.joinedAt - b.joinedAt);
    return sorted[0]?.id ?? null;
  }, [participants]);

  const peerId = useMemo(() => {
    const ids = Object.keys(participants);
    if (ids.length !== 2 || !participantId) return null;
    return ids.find((id) => id !== participantId) ?? null;
  }, [participants, participantId]);

  const { enqueueSequenced: enqueueOrderedTranslation } =
    useOrderedTranslationTts(enqueueTranslationAudio, clearTranslationAudioQueue, {
      resetKey: `${roomId}:${peerId ?? "none"}`,
    });

  useLayoutEffect(() => {
    enqueueOrderedTranslationRef.current = enqueueOrderedTranslation;
  }, [enqueueOrderedTranslation]);

  const myTargetLang = useMemo((): Language => {
    if (participantId && participants[participantId]) return participants[participantId].targetLang;
    return resolvedProfile?.targetLang ?? "en";
  }, [participantId, participants, resolvedProfile]);

  const onBatchUploaded = useCallback(() => {
    if (participantId) markSpeaking(participantId);
  }, [markSpeaking, participantId]);

  const captureEnabled = Boolean(wsUrl && participantId && micSessionActive && roomActive);

  const { isCapturing, error: micError, mediaStream } = useWebRTC({
    roomId,
    participantId,
    enabled: captureEnabled,
    onPipelineLatency: setPipelineMs,
    onBatchUploaded,
  });

  const { handleSignalingMessage: handlePeerWebrtcMessage, peerConnectionState,
    iceConnectionState, resumeRemoteAudio } = useRoomPeerAudio({
    selfId: participantId ?? "",
    peerId,
    mediaStream,
    sendRoomMessage,
    enabled: Boolean(roomActive && participantId && peerId && mediaStream && listeningMode !== "ai"),
    remoteMuted: !peerVoiceEnabled,
    remoteVolume: peerVoiceVolume,
    duckWhileTts: duckRemoteWhileTts,
    ttsIsPlaying: translationTtsIsPlaying,
    remoteAudioRef,
    iceServers,
    resetSignal: webrtcReset,
  });

  useLayoutEffect(() => { handlePeerSignalingRef.current = handlePeerWebrtcMessage; }, [handlePeerWebrtcMessage]);

  useEffect(() => { setTranslationTtsMuted(!translationTtsEnabled); }, [translationTtsEnabled, setTranslationTtsMuted]);
  useEffect(() => { setTranslationTtsVol(translationTtsVolume); }, [translationTtsVolume, setTranslationTtsVol]);
  useEffect(() => { if (!roomActive) setMicSessionActive(false); }, [roomActive]);
  useEffect(() => {
    const id = window.setInterval(() => { sendPing(); }, 30_000);
    return () => window.clearInterval(id);
  }, [sendPing]);

  useLayoutEffect(() => {
    if (participantId && wsUrl) return;
    setJoinError(null);
    if (!roomId || roomId.length !== 8) { setJoinError("Invalid room code."); setShowJoinForm(true); setIsJoining(false); return; }
    const profile = resolvedProfile;
    if (!profile) { setFormName(""); setFormSourceLang("en"); setFormTargetLang("es"); setShowJoinForm(true); setIsJoining(false); return; }
    const joinKey = ++joinKeyRef.current;
    setShowJoinForm(false); setIsJoining(true);
    const run = async (): Promise<void> => {
      try {
        saveRoomProfile(profile);
        const res = await joinRoom(roomId, profile);
        if (joinKey !== joinKeyRef.current) return;
        setParticipantId(res.participantId); setWsUrl(res.wsUrl); setIsRoomHost(res.isRoomHost === true);
        try { sessionStorage.setItem(`babel-room:${roomId}:participantId`, res.participantId); } catch { /* ignore */ }
        setJoinError(null);
        joinedAtRef.current = Date.now();
        track("room_joined", { room_id: roomId, source_lang: profile.sourceLang, target_lang: profile.targetLang, is_host: res.isRoomHost === true, via: "auto" });
      } catch {
        if (joinKey !== joinKeyRef.current) return;
        track("room_join_failed", { room_id: roomId, via: "auto" });
        setJoinError("Could not join this room. It may be full, ended, or the code may be wrong.");
        setShowJoinForm(true);
        setFormName(profile.displayName); setFormSourceLang(profile.sourceLang); setFormTargetLang(profile.targetLang);
      } finally { if (joinKey === joinKeyRef.current) setIsJoining(false); }
    };
    void run();
  }, [roomId, resolvedProfile, participantId, wsUrl]);

  const onSubmitJoinForm = useCallback(async (): Promise<void> => {
    const dn = formName.trim();
    if (!dn) { setJoinError("Display name is required."); return; }
    setJoinError(null); setIsJoining(true);
    const profile: RoomJoinProfile = { displayName: dn, sourceLang: formSourceLang, targetLang: formTargetLang };
    const joinKey = ++joinKeyRef.current;
    try {
      saveRoomProfile(profile);
      const res = await joinRoom(roomId, profile);
      if (joinKey !== joinKeyRef.current) return;
      setParticipantId(res.participantId); setWsUrl(res.wsUrl); setIsRoomHost(res.isRoomHost === true);
      try { sessionStorage.setItem(`babel-room:${roomId}:participantId`, res.participantId); } catch { /* ignore */ }
      setShowJoinForm(false);
      joinedAtRef.current = Date.now();
      track("room_joined", { room_id: roomId, source_lang: profile.sourceLang, target_lang: profile.targetLang, is_host: res.isRoomHost === true, via: "form" });
    } catch {
      if (joinKey !== joinKeyRef.current) return;
      track("room_join_failed", { room_id: roomId, via: "form" });
      setJoinError("Could not join this room.");
    } finally { if (joinKey === joinKeyRef.current) setIsJoining(false); }
  }, [formName, formSourceLang, formTargetLang, roomId]);

  const participantNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of Object.values(participants)) m[p.id] = p.displayName;
    return m;
  }, [participants]);

  useEffect(() => {
    return () => {
      for (const t of speakingTimers.current.values()) window.clearTimeout(t);
      speakingTimers.current.clear();
    };
  }, []);

  const stopPlayback = useCallback(async (): Promise<void> => {
    clearTranslationAudioQueue();
    await disposeTranslationAudio();
  }, [clearTranslationAudioQueue, disposeTranslationAudio]);

  const onConfirmEndCall = useCallback(async (): Promise<void> => {
    if (!participantId) return;
    setEndCallError(null); setEndCallBusy(true);
    try {
      await endRoom(roomId, participantId);
      track("call_ended", {
        room_id: roomId,
        participant_count: Object.keys(participants).length,
        duration_s: joinedAtRef.current ? Math.round((Date.now() - joinedAtRef.current) / 1000) : null,
      });
      setMicSessionActive(false);
      await stopPlayback();
      setEndDialogOpen(false);
      navigate(`/room/${roomId}/summary`, { state: { participantId } });
    } catch { setEndCallError("Could not end the call. Try again."); }
    finally { setEndCallBusy(false); }
  }, [navigate, participantId, participants, roomId, stopPlayback]);

  const onCopyLink = useCallback(async (): Promise<void> => {
    const url = joinUrlForRoom(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopyDone(true); window.setTimeout(() => setCopyDone(false), 2500);
      track("invite_link_copied", { room_id: roomId, is_host: isRoomHost });
    } catch {
      logger.error("clipboard_failed", {});
      window.prompt("Copy this link:", url);
    }
  }, [isRoomHost, roomId]);

  /* ── Show join form ─────────────────────────── */
  if (showJoinForm && (!participantId || !wsUrl)) {
    return (
      <JoinForm
        roomId={roomId}
        name={formName}
        sourceLang={formSourceLang}
        targetLang={formTargetLang}
        isJoining={isJoining}
        error={joinError}
        onChangeName={setFormName}
        onChangeSource={setFormSourceLang}
        onChangeTarget={setFormTargetLang}
        onSubmit={() => void onSubmitJoinForm()}
      />
    );
  }

  /* ── Loading ───────────────────────────────── */
  if (!participantId || !wsUrl) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-paper">
        <div
          className="h-5 w-5 rounded-full border-2"
          style={{ borderColor: "var(--rule)", borderTopColor: "var(--ink)", animation: "spin 0.8s linear infinite" }}
        />
        <p className="text-sm text-ink-light">Joining room…</p>
      </div>
    );
  }

  /* ── Room UI ───────────────────────────────── */
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-paper"
      style={{ fontFamily: "var(--sans)" }}
    >
      <EndCallDialog
        open={endDialogOpen}
        onClose={() => { if (!endCallBusy) { setEndDialogOpen(false); setEndCallError(null); } }}
        onConfirm={() => void onConfirmEndCall()}
        busy={endCallBusy}
        error={endCallError}
      />
      <audio ref={remoteAudioRef} className="hidden" autoPlay playsInline />

      {/* ── Top bar ── */}
      <div className="shrink-0 px-8" style={{ background: "var(--paper)", zIndex: 10 }}>
        <div style={{ height: 1, background: "var(--ink)" }} />
        <div className="flex items-center gap-0 py-3">
          <div className="flex flex-1 items-baseline gap-3">
            <span className="font-serif text-base text-ink">Babel Room</span>
            <span style={{ width: 1, height: 12, background: "var(--rule)", display: "block" }} />
            <span className="font-mono text-base font-bold tracking-[0.1em] text-ink">{roomId}</span>
            <span style={{ width: 1, height: 12, background: "var(--rule)", display: "block" }} />
            <div className="flex items-center gap-1.5">
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent-alt)", animation: "pulse 2s ease infinite" }}
              />
              <span className="text-[11px] uppercase tracking-[0.06em] text-ink-light">
                {isCapturing ? "Microphone live" : "Mic off"}
              </span>
            </div>
            {micError && (
              <span className="text-[11px] text-amber-600">· {micError}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <LatencyIndicator pipelineMs={pipelineMs} />
            <HardBtn onClick={() => void onCopyLink()}>
              {copyDone ? "✓ Copied" : "Copy invite"}
            </HardBtn>
            {isRoomHost ? (
              <HardBtn
                variant="danger"
                disabled={!roomActive || endCallBusy}
                onClick={() => { setEndCallError(null); setEndDialogOpen(true); }}
              >
                End call
              </HardBtn>
            ) : (
              <span className="text-[10px] text-ink-faint">
                Host only can end call
              </span>
            )}
          </div>
        </div>
        <div style={{ height: 1, background: "var(--ink)" }} />
      </div>

      {/* ── Main 3-column ── */}
      <div
        className="min-h-0 flex-1 overflow-hidden"
        style={{ display: "grid", gridTemplateColumns: "1fr 1px 340px", gap: 0 }}
      >
        {/* Left: Transcript */}
        <div className="flex flex-col overflow-hidden">

          {/* Transcript mode toolbar */}
          <div
            className="flex shrink-0 items-center justify-between px-8 py-3.5"
            style={{ borderBottom: "1px solid var(--rule)" }}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
                Live Transcript
              </p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                One live caption panel · updates in place
              </p>
            </div>
            <div
              className="flex overflow-hidden"
              style={{ border: "1px solid var(--ink)", borderRadius: 2 }}
            >
              {(["translated", "original"] as const).map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTranscriptMode(m === "translated" ? "mine" : "original")}
                  className="cursor-pointer px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-[background,color] duration-150"
                  style={{
                    border: "none",
                    borderRight: i === 0 ? "1px solid var(--ink)" : "none",
                    background: (m === "translated" ? transcriptMode === "mine" : transcriptMode === "original")
                      ? "var(--ink)" : "transparent",
                    color: (m === "translated" ? transcriptMode === "mine" : transcriptMode === "original")
                      ? "var(--paper)" : "var(--ink-light)",
                    fontFamily: "var(--sans)",
                  }}
                >
                  {m === "translated" ? "My language" : "Original"}
                </button>
              ))}
            </div>
          </div>

          {/* Room ended / errors */}
          {!roomActive && (
            <div className="mx-8 mt-4 shrink-0 border border-amber-200 px-3 py-2 text-sm text-amber-700" style={{ borderRadius: 2 }}>
              This room has ended.{" "}
              <Link to="/" className="underline underline-offset-2">Back to home</Link>
            </div>
          )}
          {lastError && roomActive && (
            <p className="mx-8 mt-3 shrink-0 text-xs text-amber-600">{lastError}</p>
          )}

          {/* Transcript lines */}
          <TranscriptPanel
            lines={lines}
            participantNames={participantNames}
            viewerTargetLang={myTargetLang}
            transcriptMode={transcriptMode}
            embedded
            className="min-h-0 flex-1"
          />

          {/* Mic strip */}
          <div
            className="shrink-0 px-8 py-3.5"
            style={{ borderTop: "1px solid var(--ink)", background: "var(--warm-white)" }}
          >
            <div className="flex items-center" style={{ gap: 14 }}>
              <button
                type="button"
                onClick={() => setMicSessionActive((v) => !v)}
                className="flex shrink-0 cursor-pointer items-center justify-center transition-all duration-150"
                style={{
                  width: 38,
                  height: 38,
                  border: `1px solid ${micSessionActive ? "var(--accent)" : "var(--ink)"}`,
                  background: micSessionActive ? "var(--accent)" : "transparent",
                  color: micSessionActive ? "#fff" : "var(--ink)",
                  borderRadius: 2,
                  boxShadow: micSessionActive ? "2px 2px 0 rgba(0,0,0,0.2)" : "2px 2px 0 var(--ink)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0V3a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.4" fill={micSessionActive ? "currentColor" : "none"} />
                  <path d="M4 7a4 4 0 0 0 8 0M8 11v2M6 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
              <div className="flex-1">
                <AudioVisualizer
                  active={micSessionActive && isCapturing}
                  color="var(--accent)"
                />
              </div>
              {import.meta.env.DEV && participantId ? (
                <HardBtn
                  variant="outline"
                  onClick={() => {
                    const texts = [
                      "Testing the pipeline, can you hear me?",
                      "The translation latency is remarkably low.",
                      "This is running entirely on Cloudflare Workers.",
                    ];
                    const sourceLang = participants[participantId]?.sourceLang
                      ?? resolvedProfile?.sourceLang
                      ?? "en";
                    addLine({
                      participantId,
                      sourceText: texts[Math.floor(Math.random() * texts.length)] ?? "",
                      sourceLang,
                      translations: {},
                      ts: Date.now(),
                    });
                  }}
                  style={{ padding: "5px 12px", fontSize: 11, letterSpacing: "0.05em" }}
                >
                  Demo speak
                </HardBtn>
              ) : null}
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-[0.04em] text-ink-faint">
              {micSessionActive && isCapturing
                ? "● Recording — audio processed by Cloudflare Workers AI"
                : "Click microphone to begin recording"}
            </p>
          </div>
        </div>

        {/* Center divider */}
        <div style={{ background: "var(--ink)" }} />

        {/* Right panel */}
        <div className="flex flex-col overflow-y-auto">

          {/* Participants */}
          <div className="shrink-0 px-5 py-3.5" style={{ borderBottom: "1px solid var(--rule)" }}>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
              Participants · {Object.keys(participants).length}
            </p>
            <ParticipantGrid
              participants={participants}
              selfId={participantId}
              speakingIds={speakingIds}
              hostParticipantId={hostParticipantId}
            />
          </div>

          {/* Listening mode */}
          <div className="shrink-0 px-5 py-4" style={{ borderBottom: "1px solid var(--rule)" }}>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
              Listening mode
            </p>

            <div
              className="mb-4 flex overflow-hidden"
              style={{ border: "1px solid var(--ink)", borderRadius: 2 }}
            >
              {([
                { id: "both" as const, label: "Both" },
                { id: "peer" as const, label: "People" },
                { id: "ai" as const, label: "AI voice" },
              ]).map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setListeningMode(m.id)}
                  className="flex-1 cursor-pointer px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] transition-[background,color] duration-150"
                  style={{
                    border: "none",
                    borderRight: i < 2 ? "1px solid var(--ink)" : "none",
                    background: listeningMode === m.id ? "var(--ink)" : "transparent",
                    color: listeningMode === m.id ? "var(--paper)" : "var(--ink-light)",
                    fontFamily: "var(--sans)",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3.5">
              <VolumeSlider
                label="Live voices"
                value={peerVoiceVolume}
                onChange={setPeerVoiceVolume}
                color="var(--ink)"
                disabled={listeningMode === "ai"}
              />
              <VolumeSlider
                label="AI translation"
                value={translationTtsVolume}
                onChange={setTranslationTtsVolume}
                color="var(--accent)"
                disabled={listeningMode === "peer"}
              />
              <Toggle
                checked={duckRemoteWhileTts}
                onChange={setDuckRemoteWhileTts}
                label="Lower live voices while AI TTS plays"
              />
            </div>

            {/* WebRTC status */}
            {peerId && listeningMode !== "ai" && (
              <div
                className="mt-4 px-3 py-2 text-[11px] text-ink-light"
                style={{ border: "1px solid var(--rule)", borderRadius: 2, background: "var(--warm-white)" }}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    WebRTC:{" "}
                    <span className="font-medium text-ink">
                      {peerConnectionState ?? "…"}
                    </span>
                    {iceConnectionState && (
                      <> · ICE: <span className="font-medium text-ink">{iceConnectionState}</span></>
                    )}
                  </span>
                  <div className="flex gap-1.5">
                    {(iceConnectionState === "failed" || iceConnectionState === "disconnected" || peerConnectionState === "failed") && (
                      <button
                        type="button"
                        onClick={() => setWebrtcReset((n) => n + 1)}
                        className="cursor-pointer px-2 py-0.5 text-[10px] font-semibold text-paper"
                        style={{ background: "var(--ink)", borderRadius: 1 }}
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void resumeRemoteAudio()}
                      className="cursor-pointer px-2 py-0.5 text-[10px] font-semibold text-ink"
                      style={{ border: "1px solid var(--rule)", borderRadius: 1 }}
                    >
                      Play audio
                    </button>
                  </div>
                </div>
                {(iceConnectionState === "failed" || peerConnectionState === "failed") && (
                  <p className="text-[10px] text-amber-600">
                    Connection failed — try Reconnect or ensure TURN servers are set.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* TTS queue */}
          <div className="shrink-0 px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
                TTS queue
              </p>
              <span className="font-mono text-[11px] text-ink-faint">
                {translationTtsQueueDepth} segment{translationTtsQueueDepth !== 1 ? "s" : ""}
                {translationTtsIsPlaying ? " · playing" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
