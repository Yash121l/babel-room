import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useLocation, useParams } from "react-router-dom";
import { track } from "../lib/analytics";
import { getRoomSummary } from "../lib/api";
import { logger } from "../lib/logger";

const POLL_MS = 2500;
const MAX_POLLS = 80;

function participantKeyForRoom(roomId: string): string {
  return `babel-room:${roomId}:participantId`;
}

function SummaryShell(props: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-paper"
      style={{ fontFamily: "var(--sans)" }}
    >
      {props.children}
    </div>
  );
}

function Masthead(props: { right: React.ReactNode }): JSX.Element {
  return (
    <div className="shrink-0 px-16">
      <div style={{ height: 1, background: "var(--ink)" }} />
      <div className="flex items-center justify-between py-4">
        <span className="font-serif text-xl text-ink">Babel Room</span>
        {props.right}
      </div>
      <div style={{ height: 1, background: "var(--ink)" }} />
    </div>
  );
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
      typeof (location.state as { participantId?: unknown }).participantId === "string"
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
          track("summary_viewed", { room_id: roomId, segment_count: res.segmentCount, polls: attempts });
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
      track("summary_copied", { room_id: roomId, summary_chars: summary.length });
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setCopyDone(false);
    }
  }, [roomId, summary]);

  if (!roomId || roomId.length !== 8) {
    return (
      <SummaryShell>
        <Masthead
          right={<span className="font-mono text-[11px] tracking-[0.06em] text-ink-faint">Invalid room</span>}
        />
        <div className="flex flex-1 items-center justify-center p-16">
          <p className="text-sm text-ink-light">This room link is not valid.</p>
        </div>
      </SummaryShell>
    );
  }

  if (!participantId) {
    return (
      <SummaryShell>
        <Masthead
          right={
            <span className="font-mono text-[11px] tracking-[0.06em] text-ink-faint">
              Room {roomId.toUpperCase()} — ended
            </span>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-16">
          <div className="w-full max-w-md" style={{ animation: "fadeUp 0.4s ease" }}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
              Call summary
            </p>
            <div style={{ height: 1, background: "var(--ink)", marginBottom: 20 }} />
            <p className="mb-6 text-sm leading-relaxed text-ink-light">
              Open this page from the same browser session right after the host ends the call, or join
              the room from this device first so we can verify your access.
            </p>
            <Link
              to="/"
              className="inline-flex cursor-pointer items-center justify-center border border-ink bg-transparent px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,box-shadow] duration-75"
              style={{ borderRadius: 2, boxShadow: "2px 2px 0 var(--ink)" }}
            >
              Back to home
            </Link>
          </div>
        </div>
      </SummaryShell>
    );
  }

  if (forbidden) {
    return (
      <SummaryShell>
        <Masthead
          right={
            <span className="font-mono text-[11px] tracking-[0.06em] text-ink-faint">
              Room {roomId.toUpperCase()} — ended
            </span>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-16">
          <div className="w-full max-w-md" style={{ animation: "fadeUp 0.4s ease" }}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
              Call summary
            </p>
            <div style={{ height: 1, background: "var(--ink)", marginBottom: 20 }} />
            <p className="mb-6 text-sm leading-relaxed text-ink-light">
              You don&apos;t have access to these notes. Only the person who started the room (the first
              to join) can view them after the call ends.
            </p>
            <Link
              to="/"
              className="inline-flex cursor-pointer items-center justify-center border border-ink bg-transparent px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,box-shadow] duration-75"
              style={{ borderRadius: 2, boxShadow: "2px 2px 0 var(--ink)" }}
            >
              Back to home
            </Link>
          </div>
        </div>
      </SummaryShell>
    );
  }

  return (
    <SummaryShell>
      <Masthead
        right={
          <span className="font-mono text-[11px] tracking-[0.06em] text-ink-faint">
            Room {roomId.toUpperCase()} — ended
          </span>
        }
      />

      <div className="flex flex-1 items-center justify-center overflow-y-auto p-16">
        <div className="w-full max-w-[560px]" style={{ animation: "fadeUp 0.4s ease" }}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
              Call summary
            </p>
            {summary ? (
              <button
                type="button"
                onClick={() => void onCopyNotes()}
                className="shrink-0 cursor-pointer bg-transparent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-light"
                style={{ border: "1px solid var(--rule)", borderRadius: 2 }}
              >
                {copyDone ? "Copied" : "Copy notes"}
              </button>
            ) : null}
          </div>
          <div style={{ height: 1, background: "var(--ink)", marginBottom: 28 }} />

          {loadError ? (
            <p className="mb-4 text-sm text-red-700" role="alert">
              {loadError}
            </p>
          ) : null}

          {summary === null && !loadError && !timedOut && !forbidden ? (
            <div className="flex items-center gap-4 py-8">
              <div
                className="h-5 w-5 shrink-0 rounded-full border-2"
                style={{
                  borderColor: "var(--rule)",
                  borderTopColor: "var(--ink)",
                  animation: "spin 0.8s linear infinite",
                }}
                aria-hidden
              />
              <div>
                <div className="font-serif text-base font-semibold text-ink">Generating summary…</div>
                <div className="mt-1 text-[13px] text-ink-light">Llama is processing your transcript</div>
              </div>
            </div>
          ) : null}

          {timedOut && summary === null ? (
            <p
              className="mb-6 bg-warm-white p-4 text-sm leading-relaxed text-ink-light"
              style={{ border: "1px solid var(--rule)", borderRadius: 2 }}
            >
              Notes are taking longer than expected. You can return home and try opening this page again
              later.
            </p>
          ) : null}

          {summary !== null ? (
            <>
              <div className="mb-6 mt-6">
                <h2 className="mb-4 font-serif text-[32px] tracking-[-0.02em] text-ink">Post-call notes</h2>
                {segmentCount !== null ? (
                  <p className="mb-4 text-xs text-ink-faint">
                    From {segmentCount} transcript segment{segmentCount === 1 ? "" : "s"}.
                  </p>
                ) : null}
                <div
                  className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:text-ink prose-p:text-ink prose-p:leading-relaxed prose-strong:text-ink prose-li:text-ink"
                >
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              </div>

              <div className="mb-7 flex items-center gap-2.5 border-t border-ink py-3">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent-alt)" }} />
                <span className="text-xs text-ink-light">
                  Saved to R2 ·{" "}
                  <code className="rounded bg-warm-white px-1 py-px font-mono text-[11px]">
                    rooms/{roomId}/summary.json
                  </code>
                </span>
              </div>

              <Link
                to="/"
                className="flex w-full cursor-pointer items-center justify-center gap-2 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-paper transition-[transform,box-shadow] duration-75"
                style={{
                  background: "var(--accent)",
                  border: "1px solid var(--accent)",
                  borderRadius: 2,
                  boxShadow: "2px 2px 0 rgba(0,0,0,0.25)",
                }}
              >
                Start a new room →
              </Link>
            </>
          ) : null}

          {summary === null && (loadError || timedOut) ? (
            <Link
              to="/"
              className="mt-6 inline-flex cursor-pointer items-center justify-center border border-ink bg-transparent px-5 py-2.5 text-sm font-semibold text-ink"
              style={{ borderRadius: 2, boxShadow: "2px 2px 0 var(--ink)" }}
            >
              Back to home
            </Link>
          ) : null}
        </div>
      </div>
    </SummaryShell>
  );
}
