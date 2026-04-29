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
  const prevSpeakerIdRef = useRef<string | null>(null);
  const [speakerSwapFlash, setSpeakerSwapFlash] = useState(false);

  const displayLine = lines.length > 0 ? lines[lines.length - 1] : null;

  useEffect(() => {
    if (!displayLine) {
      prevSpeakerIdRef.current = null;
      return;
    }
    const prev = prevSpeakerIdRef.current;
    prevSpeakerIdRef.current = displayLine.participantId;
    if (prev !== null && prev !== displayLine.participantId) {
      setSpeakerSwapFlash(true);
      const t = window.setTimeout(() => setSpeakerSwapFlash(false), 380);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [displayLine?.participantId]);

  const viewerLabel = useMemo(
    () => LANGUAGE_LABEL[viewerTargetLang] ?? viewerTargetLang,
    [viewerTargetLang],
  );

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

  const caption = displayLine
    ? captionForViewer(displayLine, viewerTargetLang)
    : null;

  const primary =
    displayLine && caption
      ? transcriptMode === "original"
        ? {
            text: stripTranslationArtifacts(displayLine.sourceText),
            lang: displayLine.sourceLang,
          }
        : { text: caption.text, lang: caption.lang }
      : null;

  const ageMs = displayLine ? nowTick - displayLine.receivedAt : 0;
  const freshness = freshnessTone(ageMs);
  const freshnessClass =
    freshness === "live"
      ? "text-emerald-400"
      : freshness === "recent"
        ? "text-amber-300/90"
        : "text-slate-500";

  const spokenShort = displayLine
    ? (LANGUAGE_LABEL[displayLine.sourceLang] ?? displayLine.sourceLang)
    : "";
  const captionShort = primary
    ? (LANGUAGE_LABEL[primary.lang] ?? primary.lang)
    : "";

  const crossLang =
    displayLine && displayLine.sourceLang !== viewerTargetLang;
  const srcStripped = displayLine
    ? stripTranslationArtifacts(displayLine.sourceText)
    : "";
  const translatedDiffers =
    primary && caption
      ? primary.text.trim() !== srcStripped.trim()
      : false;
  const showOriginalSub =
    Boolean(displayLine) &&
    transcriptMode === "mine" &&
    caption &&
    !caption.missingTranslation &&
    crossLang &&
    translatedDiffers;

  const speakerName = displayLine
    ? (participantNames[displayLine.participantId] ?? "Participant")
    : "";

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/80 ${className ?? ""}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800/80 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Live caption
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
            {transcriptMode === "mine" ? (
              <>
                <span className="font-medium text-sky-200">{viewerLabel}</span>
                · one screen updates in place; switches when someone else speaks
              </>
            ) : (
              <>
                Raw spoken text ·{" "}
                <span className="font-medium text-sky-200">{viewerLabel}</span>{" "}
                in details
              </>
            )}
          </p>
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
        className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-4"
        style={
          {
            touchAction: "manipulation",
          } as CSSProperties
        }
      >
        {!displayLine ? (
          <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-slate-300">Waiting for speech</p>
            <p className="max-w-xs text-xs text-slate-500">
              The last line stays here and grows while the same person talks; the
              view refreshes when another participant speaks.
            </p>
          </div>
        ) : (
          <div
            className={`flex min-h-0 flex-1 flex-col rounded-lg border border-slate-800/70 bg-slate-900/40 ${
              speakerSwapFlash ? "motion-safe:animate-transcript-in" : ""
            }`}
          >
            <div className="shrink-0 border-b border-slate-800/50 px-3 py-2 sm:px-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800/90 text-xs font-semibold text-slate-100 ring-1 ring-slate-600/80"
                  aria-hidden
                >
                  {speakerName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {speakerName}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400 sm:text-xs">
                    <span className="font-mono text-slate-500">
                      {formatLineTime(displayLine.ts)}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span>{spokenShort}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-sky-300/90">
                      {transcriptMode === "mine" ? captionShort : "Original"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${freshnessClass}`}
                  title="Time since this caption last updated on your device"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      freshness === "live"
                        ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                        : freshness === "recent"
                          ? "bg-amber-400"
                          : "bg-slate-500"
                    }`}
                    aria-hidden
                  />
                  {ageLabelFromMs(ageMs)}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">
                  Buffer TTL: last {TRANSCRIPT_BUFFER_MAX_LINES} lines kept for Copy
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4 sm:py-4 [scrollbar-gutter:stable]">
              {primary ? (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-100 sm:text-lg">
                  {primary.text}
                </p>
              ) : null}

              {transcriptMode === "mine" && caption?.missingTranslation ? (
                <p className="mt-3 text-xs text-amber-300/90" role="status">
                  No caption for {viewerLabel} yet—showing original above.
                </p>
              ) : null}

              {showOriginalSub ? (
                <details className="group mt-4 border-t border-slate-800/60 pt-3">
                  <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:hidden hover:text-slate-400 [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-slate-600 transition-transform group-open:rotate-90">
                        ▸
                      </span>
                      Original ({spokenShort})
                    </span>
                  </summary>
                  <p className="mt-2 border-l border-slate-700/50 pl-3 text-sm leading-relaxed text-slate-400">
                    {srcStripped}
                  </p>
                </details>
              ) : null}

              {transcriptMode === "original" &&
              displayLine.translations[viewerTargetLang] ? (
                <details className="group mt-4 border-t border-slate-800/60 pt-3">
                  <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:hidden hover:text-slate-400 [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-slate-600 transition-transform group-open:rotate-90">
                        ▸
                      </span>
                      {viewerLabel}
                    </span>
                  </summary>
                  <p className="mt-2 border-l border-slate-700/50 pl-3 text-sm leading-relaxed text-slate-300">
                    {stripTranslationArtifacts(
                      displayLine.translations[viewerTargetLang] ?? "",
                    )}
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
