import type { Language } from "@babel-room/shared";
import { useCallback, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  devInjectTranslatedAudio,
  devInjectTranscript,
  devListParticipants,
} from "../lib/api";
import { loadDevFixtureToneBase64 } from "../lib/devFixtureTone";
import { logger } from "../lib/logger";

const PRESETS: Record<string, { text: string; lang: Language }[]> = {
  es: [
    { text: "Hola, ¿cómo está el proyecto hoy?", lang: "es" },
    { text: "Necesitamos revisar el presupuesto.", lang: "es" },
  ],
  ja: [
    { text: "こんにちは、会議を始めます。", lang: "ja" },
    { text: "来週のリリースについて話し合いましょう。", lang: "ja" },
  ],
  fr: [
    { text: "Bonjour à tous, merci d'être là.", lang: "fr" },
    { text: "Les décisions seront prises après débat.", lang: "fr" },
  ],
};

export function DevSimulator(): JSX.Element {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }

  const [roomId, setRoomId] = useState("");
  const [participants, setParticipants] = useState<
    Awaited<ReturnType<typeof devListParticipants>>
  >([]);
  const [speakerId, setSpeakerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normRoom = roomId.trim().toLowerCase();

  const onLoadParticipants = useCallback(async (): Promise<void> => {
    setError(null);
    setStatus(null);
    if (normRoom.length !== 8 || !/^[a-z0-9]+$/.test(normRoom)) {
      setError("Enter a valid 8-character room id.");
      return;
    }
    setBusy(true);
    try {
      const list = await devListParticipants(normRoom);
      setParticipants(list);
      setSpeakerId(list[0]?.id ?? "");
      setTargetId(list[1]?.id ?? list[0]?.id ?? "");
      setStatus(`Loaded ${list.length} participant(s).`);
    } catch (e) {
      setError(String(e));
      logger.error("dev_sim_load", { message: String(e) });
    } finally {
      setBusy(false);
    }
  }, [normRoom]);

  const onInjectPreset = useCallback(
    async (key: keyof typeof PRESETS): Promise<void> => {
      setError(null);
      setStatus(null);
      if (!speakerId) {
        setError("Set speaker participant id (load participants first).");
        return;
      }
      setBusy(true);
      try {
        const { injected } = await devInjectTranscript(
          normRoom,
          speakerId,
          PRESETS[key],
        );
        setStatus(`Injected ${injected} segment(s) (${key}).`);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [normRoom, speakerId],
  );

  const onPlayFixture = useCallback(async (): Promise<void> => {
    setError(null);
    setStatus(null);
    if (!targetId) {
      setError("Set target participant (must have room open in a tab).");
      return;
    }
    setBusy(true);
    try {
      const audioB64 = await loadDevFixtureToneBase64();
      const target = participants.find((p) => p.id === targetId);
      const lang = (target?.targetLang ?? "en") as Language;
      await devInjectTranslatedAudio(normRoom, {
        targetParticipantId: targetId,
        audioB64,
        lang,
      });
      setStatus("Sent fixture WAV to target WebSocket.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [normRoom, participants, targetId]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-white">Dev simulator</h1>
        <p className="mt-2 text-sm text-room-muted">
          Local-only page. Requires API with{" "}
          <code className="text-room-accent">BABEL_DEV_TOOLS=&quot;1&quot;</code>{" "}
          (see <code className="text-room-accent">wrangler.test.toml</code>). Open
          the same room in another tab, join, then load participants here.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-room-panel p-5">
        <label className="flex flex-col gap-1 text-sm" htmlFor="simRoom">
          <span className="text-room-muted">Room id</span>
          <input
            id="simRoom"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
            value={roomId}
            maxLength={8}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="abcd1234"
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-room-accent px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
          disabled={busy}
          onClick={() => void onLoadParticipants()}
        >
          Load participants
        </button>

        {participants.length > 0 ? (
          <div className="text-xs text-room-muted">
            <p className="font-medium text-slate-300">Participants</p>
            <ul className="mt-2 max-h-40 overflow-y-auto font-mono">
              {participants.map((p) => (
                <li key={p.id} className="border-b border-slate-800 py-1">
                  {p.displayName} · {p.sourceLang}→{p.targetLang}
                  <br />
                  <span className="text-slate-500">{p.id}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-sm" htmlFor="speakerId">
          <span className="text-room-muted">Speaker participant UUID (inject transcript as)</span>
          <input
            id="speakerId"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
            value={speakerId}
            onChange={(e) => setSpeakerId(e.target.value)}
          />
        </label>

        <p className="text-xs font-medium uppercase tracking-wide text-room-muted">
          Inject transcript (live in room)
        </p>
        <div className="flex flex-wrap gap-2">
          {(["es", "ja", "fr"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800 disabled:opacity-50"
              disabled={busy}
              onClick={() => void onInjectPreset(k)}
            >
              Preset {k.toUpperCase()}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm" htmlFor="targetId">
          <span className="text-room-muted">
            Target participant UUID (fixture audio)
          </span>
          <input
            id="targetId"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => void onPlayFixture()}
        >
          Play fixture tone (WAV)
        </button>

        {status ? (
          <p className="text-sm text-emerald-400" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Link
        to="/"
        className="text-sm text-room-accent underline-offset-2 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
