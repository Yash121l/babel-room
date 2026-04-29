import type { Language } from "@babel-room/shared";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptLine } from "../hooks/useTranscript";
import { TRANSCRIPT_BUFFER_MAX_LINES } from "../hooks/useTranscript";
import { LANGUAGE_LABEL } from "../lib/languageLabels";
import { stripTranslationArtifacts } from "../lib/stripTranslationArtifacts";

function formatLineTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

function captionForViewer(
  line: TranscriptLine,
  viewerTargetLang: Language,
): { text: string; lang: Language; missingTranslation: boolean } {
  const t = line.translations[viewerTargetLang]?.trim();
  if (t) {
    return {
      text: stripTranslationArtifacts(t),
      lang: viewerTargetLang,
      missingTranslation: false,
    };
  }
  if (viewerTargetLang === line.sourceLang) {
    return {
      text: stripTranslationArtifacts(line.sourceText),
      lang: line.sourceLang,
      missingTranslation: false,
    };
  }
  return {
    text: stripTranslationArtifacts(line.sourceText),
    lang: line.sourceLang,
    missingTranslation: true,
  };
}

function ageLabelFromMs(ageMs: number): string {
  const s = Math.floor(ageMs / 1000);
  if (s < 4) return "Live";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function freshnessTone(ageMs: number): "live" | "recent" | "stale" {
  if (ageMs < 5000) return "live";
  if (ageMs < 45000) return "recent";
  return "stale";
}

/** Plaintext for clipboard (matches on-screen caption mode). */
export function buildTranscriptPlaintext(
  lines: TranscriptLine[],
  participantNames: Record<string, string>,
  viewerTargetLang: Language,
  transcriptMode: "mine" | "original",
): string {
  const blocks: string[] = [];
  for (const line of lines) {
    const name = participantNames[line.participantId] ?? "Participant";
    const time = formatLineTime(line.ts);
    const cap = captionForViewer(line, viewerTargetLang);
    const primary =
      transcriptMode === "original"
        ? stripTranslationArtifacts(line.sourceText)
        : cap.text;
    const crossLang = line.sourceLang !== viewerTargetLang;
    const translatedDiffers = cap.text.trim() !== stripTranslationArtifacts(line.sourceText).trim();
    const showOriginal =
      transcriptMode === "mine" &&
      !cap.missingTranslation &&
      crossLang &&
      translatedDiffers;

    let chunk = `[${time}] ${name}\n${primary}`;
    if (showOriginal) {
      chunk += `\nOriginal: ${stripTranslationArtifacts(line.sourceText)}`;
    }
    if (transcriptMode === "original" && line.translations[viewerTargetLang]) {
      chunk += `\n${LANGUAGE_LABEL[viewerTargetLang] ?? viewerTargetLang}: ${stripTranslationArtifacts(line.translations[viewerTargetLang] ?? "")}`;
    }
    blocks.push(chunk);
  }
  return blocks.join("\n\n");
}

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function streamTailSignature(lines: TranscriptLine[]): string {
  const last = lines.at(-1);
  if (!last) return "0";
  return `${lines.length}:${last.id}:${last.receivedAt}:${last.sourceText.length}`;
}

const SCROLL_BOTTOM_SLACK_PX = 100;

export function TranscriptPanel(props: {
  lines: TranscriptLine[];
  participantNames: Record<string, string>;
  viewerTargetLang: Language;
  transcriptMode: "mine" | "original";
  className?: string;
}): JSX.Element {
  const { lines, participantNames, viewerTargetLang, transcriptMode, className } =
    props;
  const [copyDone, setCopyDone] = useState(false);
  const nowTick = useNowTick(1000);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinnedToLive, setPinnedToLive] = useState(true);
  const pinnedToLiveRef = useRef(true);
  pinnedToLiveRef.current = pinnedToLive;

  const viewerLabel = useMemo(
    () => LANGUAGE_LABEL[viewerTargetLang] ?? viewerTargetLang,
    [viewerTargetLang],
  );

  const onScroll = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    const slack = SCROLL_BOTTOM_SLACK_PX;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= slack;
    setPinnedToLive(atBottom);
  }, []);

  const tailSig = useMemo(() => streamTailSignature(lines), [lines]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedToLiveRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [tailSig]);

  const jumpToLatest = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinnedToLive(true);
  }, []);

  const onCopyTranscript = useCallback(async (): Promise<void> => {
    if (lines.length === 0) return;
    const text = buildTranscriptPlaintext(
      lines,
      participantNames,
      viewerTargetLang,
      transcriptMode,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setCopyDone(false);
    }
  }, [lines, participantNames, viewerTargetLang, transcriptMode]);

  const lastLine = lines.at(-1);
  const lastAgeMs = lastLine ? nowTick - lastLine.receivedAt : 0;
  const lastFresh = freshnessTone(lastAgeMs);
  const lastFreshClass =
    lastFresh === "live"
      ? "text-emerald-400"
      : lastFresh === "recent"
        ? "text-amber-300/90"
        : "text-slate-500";

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/80 ${className ?? ""}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800/80 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Caption stream
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
            <span className="font-medium text-sky-200">{viewerLabel}</span>
            {transcriptMode === "mine" ? (
              <> · full history scrolls like lyrics; auto-follows the end</>
            ) : (
              <> · original + {viewerLabel} line per cue</>
            )}
          </p>
          {lines.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-500 sm:text-[11px]">
              <span className={`inline-flex items-center gap-1 font-medium ${lastFreshClass}`}>
                <span
                  className={`h-1 w-1 shrink-0 rounded-full ${
                    lastFresh === "live"
                      ? "bg-emerald-400"
                      : lastFresh === "recent"
                        ? "bg-amber-400"
                        : "bg-slate-500"
                  }`}
                  aria-hidden
                />
                Latest {ageLabelFromMs(lastAgeMs)}
              </span>
              <span className="text-slate-600">·</span>
              <span>
                Buffer {lines.length}/{TRANSCRIPT_BUFFER_MAX_LINES} for Copy
              </span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={lines.length === 0}
          className="shrink-0 rounded-md border border-slate-600/80 px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40 sm:text-xs"
          onClick={() => void onCopyTranscript()}
        >
          {copyDone ? "Copied" : "Copy transcript"}
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth px-3 py-3 [scrollbar-gutter:stable] sm:px-4"
        style={
          {
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
          } as CSSProperties
        }
      >
        {/* Top fade — lyric / music-app feel */}
        <div
          className="pointer-events-none sticky top-0 z-10 -mx-3 h-8 bg-gradient-to-b from-slate-950/95 to-transparent sm:-mx-4"
          aria-hidden
        />

        {lines.length === 0 ? (
          <div className="flex min-h-[10rem] flex-col items-center justify-center gap-1 py-12 text-center">
            <p className="text-sm font-medium text-slate-300">Waiting for speech</p>
            <p className="max-w-xs text-xs text-slate-500">
              Lines stack here as they arrive. Scroll stays pinned to the newest
              line unless you move up.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pb-16 pt-1">
            {lines.map((line, index) => {
              const name = participantNames[line.participantId] ?? "Participant";
              const time = formatLineTime(line.ts);
              const cap = captionForViewer(line, viewerTargetLang);
              const spokenShort =
                LANGUAGE_LABEL[line.sourceLang] ?? line.sourceLang;
              const primary =
                transcriptMode === "original"
                  ? {
                      text: stripTranslationArtifacts(line.sourceText),
                      lang: line.sourceLang,
                    }
                  : { text: cap.text, lang: cap.lang };
              const captionShort =
                LANGUAGE_LABEL[primary.lang] ?? primary.lang;
              const srcStripped = stripTranslationArtifacts(line.sourceText);
              const crossLang = line.sourceLang !== viewerTargetLang;
              const translatedDiffers =
                primary.text.trim() !== srcStripped.trim();
              const showOriginalSub =
                transcriptMode === "mine" &&
                !cap.missingTranslation &&
                crossLang &&
                translatedDiffers;
              const showTranslationSub =
                transcriptMode === "original" &&
                Boolean(line.translations[viewerTargetLang]);
              const fromEnd = lines.length - 1 - index;
              const recency = Math.min(1, fromEnd / 6);
              const opacity = 0.38 + recency * 0.62;
              const isLatest = fromEnd === 0;
              const ageMs = nowTick - line.receivedAt;
              const fresh = freshnessTone(ageMs);

              return (
                <article
                  key={line.id}
                  className={`border-l-2 pl-3 transition-opacity duration-300 sm:pl-4 ${
                    isLatest
                      ? "border-sky-400/90"
                      : fresh === "stale"
                        ? "border-slate-700/60"
                        : "border-slate-600/50"
                  }`}
                  style={{ opacity }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-slate-500 sm:text-xs">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800/80 text-[10px] font-semibold text-slate-200 ring-1 ring-slate-700/80"
                      aria-hidden
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="font-medium text-slate-200">{name}</span>
                    <span className="font-mono text-slate-500">{time}</span>
                    <span className="text-slate-600">·</span>
                    <span>{spokenShort}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-sky-300/80">
                      {transcriptMode === "mine" ? captionShort : "Original"}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span
                      className={
                        fresh === "live"
                          ? "text-emerald-400/90"
                          : fresh === "recent"
                            ? "text-amber-300/80"
                            : "text-slate-500"
                      }
                    >
                      {ageLabelFromMs(ageMs)}
                    </span>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-100 sm:text-[15px]">
                    {primary.text}
                  </p>

                  {showOriginalSub ? (
                    <p className="mt-2 border-l border-slate-700/60 pl-2.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
                      <span className="font-medium text-slate-500">
                        Original ({spokenShort})
                      </span>
                      <br />
                      {srcStripped}
                    </p>
                  ) : null}

                  {showTranslationSub ? (
                    <p className="mt-2 border-l border-sky-900/40 pl-2.5 text-xs leading-relaxed text-slate-300 sm:text-sm">
                      <span className="font-medium text-sky-400/80">
                        {viewerLabel}
                      </span>
                      <br />
                      {stripTranslationArtifacts(
                        line.translations[viewerTargetLang] ?? "",
                      )}
                    </p>
                  ) : null}

                  {transcriptMode === "mine" && cap.missingTranslation ? (
                    <p className="mt-1.5 text-[11px] text-amber-300/90" role="status">
                      No caption for {viewerLabel}—original above.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div
          className="pointer-events-none sticky bottom-0 z-10 -mx-3 h-10 bg-gradient-to-t from-slate-950/95 to-transparent sm:-mx-4"
          aria-hidden
        />
      </div>

      {!pinnedToLive && lines.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <button
            type="button"
            onClick={jumpToLatest}
            className="pointer-events-auto rounded-full border border-sky-600/80 bg-sky-950/95 px-4 py-2 text-xs font-semibold text-sky-100 shadow-lg shadow-black/40 backdrop-blur-sm hover:bg-sky-900/95"
          >
            Jump to latest
          </button>
        </div>
      ) : null}
    </div>
  );
}
