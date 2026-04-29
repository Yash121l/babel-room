import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRoomSummary } from "../lib/api";
import { logger } from "../lib/logger";

const POLL_MS = 2500;
const MAX_POLLS = 80;

export function RoomSummary(): JSX.Element {
  const { roomId: roomIdParam } = useParams();
  const roomId = roomIdParam ?? "";

  const [summary, setSummary] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!roomId || roomId.length !== 8) return undefined;

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
        const res = await getRoomSummary(roomId);
        if (cancelled) return;
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
  }, [roomId]);

  if (!roomId || roomId.length !== 8) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-rose-400">
        Invalid room.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-2xl font-semibold text-white">Call notes</h1>
        <p className="mt-1 font-mono text-sm text-room-muted">Room {roomId}</p>
      </header>

      {loadError ? (
        <p className="text-sm text-rose-400" role="alert">
          {loadError}
        </p>
      ) : null}

      {summary === null && !loadError && !timedOut ? (
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
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
            {summary || "(No summary text.)"}
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
