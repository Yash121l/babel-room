import type { Language } from "@babel-room/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LanguageSelector } from "../components";
import { createRoom } from "../lib/api";
import { logger } from "../lib/logger";
import { loadRoomProfile, saveRoomProfile } from "../lib/roomProfile";

export function Home(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [sourceLang, setSourceLang] = useState<Language>("en");
  const [targetLang, setTargetLang] = useState<Language>("hi");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadRoomProfile();
    if (saved) {
      setDisplayName(saved.displayName);
      setSourceLang(saved.sourceLang);
      setTargetLang(saved.targetLang);
    }
  }, []);

  useEffect(() => {
    const raw = searchParams.get("join")?.trim().toLowerCase() ?? "";
    if (raw.length === 8 && /^[a-z0-9]+$/.test(raw)) {
      setJoinCode(raw.toUpperCase());
      setMode("join");
    }
  }, [searchParams]);

  const onCreate = async (): Promise<void> => {
    if (!displayName.trim()) { setError("Name is required."); return; }
    setError(null);
    setBusy(true);
    try {
      const { roomId } = await createRoom();
      const profile = { displayName: displayName.trim(), sourceLang, targetLang };
      saveRoomProfile(profile);
      navigate(`/room/${roomId}`, { state: profile });
    } catch (e) {
      logger.error("create_room_ui", { message: String(e) });
      setError("Could not create room.");
    } finally {
      setBusy(false);
    }
  };

  const onJoin = (): void => {
    if (!displayName.trim()) { setError("Name is required."); return; }
    const code = joinCode.trim().toLowerCase();
    if (code.length !== 8 || !/^[a-z0-9]+$/.test(code)) {
      setError("Enter an 8-character room code.");
      return;
    }
    setError(null);
    const profile = { displayName: displayName.trim(), sourceLang, targetLang };
    saveRoomProfile(profile);
    navigate(`/room/${code}`, { state: profile });
  };

  const go = (): void => {
    if (mode === "create") void onCreate();
    else onJoin();
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-paper"
      style={{ fontFamily: "var(--sans)" }}
    >
      {/* Masthead */}
      <div className="shrink-0 px-16">
        <div style={{ height: 1, background: "var(--ink)" }} />
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <span className="font-serif text-xl">Babel Room</span>
            <span style={{ width: 1, height: 14, background: "var(--rule)", display: "block" }} />
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-light">
              Real-time multilingual voice
            </span>
          </div>
          <span className="text-[11px] tracking-[0.06em] text-ink-faint">
            Cloudflare Workers AI
          </span>
        </div>
        <div style={{ height: 1, background: "var(--ink)" }} />
      </div>

      {/* Body */}
      <div
        className="min-h-0 flex-1 overflow-hidden"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}
      >
        {/* Left: editorial hero */}
        <div
          className="flex flex-col justify-between overflow-y-auto p-16"
          style={{
            borderRight: "1px solid var(--ink)",
            animation: "fadeUp 0.5s ease",
          }}
        >
          <div>
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
              Edition No. 1 — Multilingual Rooms
            </p>
            <h1
              className="mb-8 font-serif leading-[1.05] tracking-[-0.03em] text-ink"
              style={{ fontSize: 62, maxWidth: 480 }}
            >
              Speak your<br />
              language.<br />
              <span style={{ fontStyle: "italic", color: "var(--accent)" }}>
                Hear everyone&apos;s.
              </span>
            </h1>
            <p
              className="leading-relaxed text-ink-light"
              style={{ fontSize: 15, maxWidth: 400 }}
            >
              Real-time AI translation across any language pair. STT via Whisper,
              translation via Llama, TTS via MeloTTS — all running at the edge.
            </p>
          </div>

          {/* Feature table */}
          <div>
            <div style={{ height: 1, background: "var(--rule)", marginBottom: 16 }} />
            {[
              { num: "01", label: "Speech Recognition", detail: "OpenAI Whisper · edge-deployed" },
              { num: "02", label: "Live Translation", detail: "Llama 3.1 8B · per language pair" },
              { num: "03", label: "TTS Playback", detail: "MeloTTS · MP3 base64 streaming" },
              { num: "04", label: "WebRTC Peer Audio", detail: "Mesh topology · DO signaling" },
            ].map((f) => (
              <div key={f.num}>
                <div className="flex items-baseline gap-5 py-2.5">
                  <span className="w-6 shrink-0 font-mono text-[11px] text-ink-faint">{f.num}</span>
                  <span className="flex-1 text-[13px] font-semibold text-ink">{f.label}</span>
                  <span className="text-xs text-ink-light">{f.detail}</span>
                </div>
                <div style={{ height: 1, background: "var(--rule)" }} />
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div
          className="flex flex-col justify-center overflow-y-auto p-16"
          style={{ animation: "fadeUp 0.5s ease 0.1s both" }}
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
            Your profile
          </p>
          <div style={{ height: 1, background: "var(--ink)", marginBottom: 28 }} />

          {/* Name */}
          <div className="mb-5">
            <label
              htmlFor="displayName"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light"
            >
              Name
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setError(null); }}
              placeholder="Display name"
              autoComplete="nickname"
              className="w-full bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150"
              style={{ border: "1px solid var(--rule)", borderRadius: 2 }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid var(--ink)";
                e.currentTarget.style.boxShadow = "2px 2px 0 var(--ink)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid var(--rule)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Language selectors */}
          <div className="mb-7" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <LanguageSelector id="sourceLang" label="You speak" value={sourceLang} onChange={(v) => { setSourceLang(v); setError(null); }} />
            <LanguageSelector id="targetLang" label="You hear" value={targetLang} onChange={(v) => { setTargetLang(v); setError(null); }} />
          </div>

          <div style={{ height: 1, background: "var(--rule)", marginBottom: 24 }} />

          {/* Mode toggle */}
          <div
            className="mb-6 flex overflow-hidden"
            style={{ border: "1px solid var(--ink)", borderRadius: 2 }}
          >
            {(["create", "join"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className="flex-1 cursor-pointer py-2.5 text-xs font-semibold uppercase tracking-[0.06em] transition-[background,color] duration-150"
                style={{
                  border: "none",
                  borderRight: m === "create" ? "1px solid var(--ink)" : "none",
                  background: mode === m ? "var(--ink)" : "transparent",
                  color: mode === m ? "var(--paper)" : "var(--ink-light)",
                  fontFamily: "var(--sans)",
                }}
              >
                {m === "create" ? "Create room" : "Join room"}
              </button>
            ))}
          </div>

          {/* Room code (join mode) */}
          {mode === "join" && (
            <div className="mb-5">
              <label
                htmlFor="joinCode"
                className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light"
              >
                8-character room code
              </label>
              <input
                id="joinCode"
                value={joinCode}
                maxLength={8}
                placeholder="ROOM CODE"
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") go(); }}
                autoCapitalize="none"
                spellCheck={false}
                className="w-full bg-paper px-3 py-2.5 font-mono text-sm font-bold tracking-[0.08em] text-ink outline-none transition-[border-color,box-shadow] duration-150"
                style={{ border: "1px solid var(--rule)", borderRadius: 2, fontSize: 15 }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid var(--ink)";
                  e.currentTarget.style.boxShadow = "2px 2px 0 var(--ink)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid var(--rule)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          )}

          {/* Error */}
          {error ? (
            <div
              className="mb-4 px-3 py-2 text-[13px]"
              style={{
                border: "1px solid #C0392B",
                borderLeft: "3px solid #C0392B",
                color: "#C0392B",
                borderRadius: 2,
              }}
            >
              {error}
            </div>
          ) : null}

          {/* CTA */}
          <button
            type="button"
            disabled={busy}
            onClick={go}
            className="flex w-full cursor-pointer items-center justify-center gap-2 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink transition-[transform,box-shadow] duration-75 disabled:opacity-50"
            style={{
              background: "var(--terracotta)",
              border: "1px solid var(--terracotta)",
              borderRadius: 2,
              boxShadow: busy ? "none" : "2px 2px 0 rgba(0,0,0,0.25)",
              color: "var(--paper)",
            }}
            onMouseDown={(e) => {
              if (!busy) {
                e.currentTarget.style.transform = "translate(2px,2px)";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "2px 2px 0 rgba(0,0,0,0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "2px 2px 0 rgba(0,0,0,0.25)";
            }}
          >
            {busy ? (
              <>
                <div
                  className="h-3.5 w-3.5 rounded-full border-2"
                  style={{
                    borderColor: "rgba(255,255,255,0.4)",
                    borderTopColor: "#fff",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Processing…
              </>
            ) : mode === "create" ? (
              "Create room →"
            ) : (
              "Join room →"
            )}
          </button>

          <p className="mt-3.5 text-center text-[11px] leading-relaxed text-ink-faint">
            Paste an invite link or use{" "}
            <code className="rounded bg-warm-white px-1 py-px font-mono">?join=ROOMCODE</code>{" "}
            to pre-fill.
          </p>

          {import.meta.env.DEV ? (
            <p className="mt-4 text-center text-[11px] text-ink-faint">
              <Link
                to="/dev/simulator"
                className="underline decoration-rule underline-offset-2 hover:text-ink"
              >
                Dev simulator
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
