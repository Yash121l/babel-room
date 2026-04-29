import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useLocation, useParams } from "react-router-dom";
import { getRoomSummary } from "../lib/api";
import { logger } from "../lib/logger";

const POLL_MS = 2500;
const MAX_POLLS = 80;

function participantKeyForRoom(roomId: string): string {
  return `babel-room:${roomId}:participantId`;
}

export function RoomSummary(): JSX.Element {
  const { roomId: roomIdParam } = useParams();
  const location = useLocation();
  const roomId = roomIdParam ?? "";

  const participantId = useMemo((): string | null => {
    const fromState =
      location.state &&
      typeof location.state === "object" &&
      "participantId" in location.state &&
      typeof (location.state as { participantId?: unknown }).participantId ===
        "string"
        ? (location.state as { participantId: string }).participantId.trim()
        : "";
    if (fromState) return fromState;
    try {
      const s = sessionStorage.getItem(participantKeyForRoom(roomId));
      return s && s.length > 0 ? s : null;
    } catch {
      return null;
    }
  }, [location.state, roomId]);

  const [summary, setSummary] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    if (!roomId || roomId.length !== 8 || !participantId) return undefined;

    let cancelled = false;
    let attempts = 0;
    let intervalId: number | null = null;

    const stop = (): void => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > MAX_POLLS) {
        stop();
        setTimedOut(true);
        return;
      }
      try {
        const res = await getRoomSummary(roomId, participantId);
        if (cancelled) return;
        if (res.status === "forbidden") {
          stop();
          setForbidden(true);
          setLoadError(null);
          return;
        }
        if (res.status === "ready") {
          stop();
          setSummary(res.summary);
          setSegmentCount(res.segmentCount);
          setLoadError(null);
        }
      } catch (e) {
        logger.error("summary_poll_failed", { message: String(e) });
        if (!cancelled) {
          setLoadError("Could not load notes.");
          stop();
        }
      }
    };

    void tick();
    intervalId = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      stop();
    };
  }, [roomId, participantId]);

  const onCopyNotes = useCallback(async (): Promise<void> => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setCopyDone(false);
    }
  }, [summary]);

  if (!roomId || roomId.length !== 8) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-rose-400">
        Invalid room.
      </div>
    );
  }

  if (!participantId) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold text-white">Call notes</h1>
        <p className="text-sm text-slate-300">
          Open this page from the same browser session right after the host ends
          the call, or join the room from this device first so we can verify you are
          the host.
        </p>
        <Link
          to="/"
          className="inline-flex w-fit rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold text-white">Call notes</h1>
        <p className="text-sm text-slate-300">
          You don&apos;t have access to these notes. Only the person who started the
          room (the first to join) can view them after the call ends.
        </p>
        <Link
          to="/"
          className="inline-flex w-fit rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Call notes</h1>
          <p className="mt-1 font-mono text-sm text-room-muted">Room {roomId}</p>
        </div>
        {summary ? (
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 sm:text-sm"
            onClick={() => void onCopyNotes()}
          >
            {copyDone ? "Copied" : "Copy notes"}
          </button>
        ) : null}
      </header>

      {loadError ? (
        <p className="text-sm text-rose-400" role="alert">
          {loadError}
        </p>
      ) : null}

      {summary === null && !loadError && !timedOut && !forbidden ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-room-panel py-12">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-room-accent border-t-transparent"
            aria-hidden
          />
          <p className="text-sm text-room-muted">Generating notes…</p>
        </div>
      ) : null}

      {timedOut && summary === null ? (
        <p className="rounded-xl border border-slate-800 bg-room-panel p-4 text-sm text-room-muted">
          Notes are taking longer than expected. You can return home and try
          opening this page again later.
        </p>
      ) : null}

      {summary !== null ? (
        <article className="rounded-2xl border border-slate-800 bg-room-panel p-6">
          {segmentCount !== null ? (
            <p className="mb-4 text-xs text-room-muted">
              From {segmentCount} transcript segment
              {segmentCount === 1 ? "" : "s"}.
            </p>
          ) : null}
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-100 prose-p:text-slate-200 prose-strong:text-white prose-li:text-slate-200">
            {summary ? (
              <ReactMarkdown>{summary}</ReactMarkdown>
            ) : (
              <p className="text-slate-300">(No summary text.)</p>
            )}
          </div>
        </article>
      ) : null}

      <Link
        to="/"
        className="inline-flex w-fit rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
      >
        Back to home
      </Link>
    </div>
  );
}
