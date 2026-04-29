import type { Language } from "@babel-room/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LanguageSelector } from "../components";
import { createRoom } from "../lib/api";
import { logger } from "../lib/logger";

export function Home(): JSX.Element {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [sourceLang, setSourceLang] = useState<Language>("en");
  const [targetLang, setTargetLang] = useState<Language>("es");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async (): Promise<void> => {
    setError(null);
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    setBusy(true);
    try {
      const { roomId } = await createRoom();
      navigate(`/room/${roomId}`, {
        state: { displayName: displayName.trim(), sourceLang, targetLang },
      });
    } catch (e) {
      logger.error("create_room_ui", { message: String(e) });
      setError("Could not create room.");
    } finally {
      setBusy(false);
    }
  };

  const onJoin = (): void => {
    setError(null);
    const code = joinCode.trim().toLowerCase();
    if (code.length !== 8 || !/^[a-z0-9]+$/.test(code)) {
      setError("Enter an 8-character room code.");
      return;
    }
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    navigate(`/room/${code}`, {
      state: { displayName: displayName.trim(), sourceLang, targetLang },
    });
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Babel Room
        </h1>
        <p className="mt-2 text-sm text-room-muted">
          Speak in your language. Hear everyone in yours — edge-hosted on
          Cloudflare.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-room-panel p-6">
        <label className="flex flex-col gap-1 text-sm" htmlFor="displayName">
          <span className="text-room-muted">Display name</span>
          <input
            id="displayName"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-room-accent"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
          />
        </label>
        <LanguageSelector
          id="sourceLang"
          label="Language you speak"
          value={sourceLang}
          onChange={setSourceLang}
        />
        <LanguageSelector
          id="targetLang"
          label="Language you want to hear"
          value={targetLang}
          onChange={setTargetLang}
        />

        {error ? (
          <p className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="rounded-lg bg-room-accent px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-300 disabled:opacity-50"
          disabled={busy}
          onClick={() => void onCreate()}
        >
          Create room
        </button>

        <div className="border-t border-slate-800 pt-4">
          <label className="flex flex-col gap-1 text-sm" htmlFor="joinCode">
            <span className="text-room-muted">Join with code</span>
            <input
              id="joinCode"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 outline-none focus:border-room-accent"
              value={joinCode}
              maxLength={8}
              placeholder="abcd1234"
              onChange={(e) => setJoinCode(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
            onClick={onJoin}
          >
            Join room
          </button>
        </div>
      </div>
    </div>
  );
}
