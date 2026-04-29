import type { Language } from "@babel-room/shared";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptLine } from "../hooks/useTranscript";
import { LANGUAGE_LABEL } from "../lib/languageLabels";
import { stripTranslationArtifacts } from "../lib/stripTranslationArtifacts";

const borderAccent: Record<Language, string> = {
  en: "border-l-sky-400",
  es: "border-l-amber-400",
  ja: "border-l-fuchsia-400",
  fr: "border-l-indigo-400",
  de: "border-l-emerald-400",
  pt: "border-l-orange-400",
  zh: "border-l-rose-400",
  hi: "border-l-lime-400",
  ar: "border-l-cyan-400",
  ko: "border-l-violet-400",
};

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

export function TranscriptPanel(props: {
  lines: TranscriptLine[];
  participantNames: Record<string, string>;
  viewerTargetLang: Language;
  transcriptMode: "mine" | "original";
  className?: string;
}): JSX.Element {
  const { lines, participantNames, viewerTargetLang, transcriptMode, className } =
    props;
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const viewerLabel = useMemo(
    () => LANGUAGE_LABEL[viewerTargetLang] ?? viewerTargetLang,
    [viewerTargetLang],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

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

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/80 ${className ?? ""}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-800/80 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Conversation
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
            {transcriptMode === "mine" ? (
              <>
                <span className="font-medium text-sky-200">{viewerLabel}</span>{" "}
                · stream below
              </>
            ) : (
              <>
                Raw ·{" "}
                <span className="font-medium text-sky-200">My language</span> for{" "}
                {viewerLabel}
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth px-2 py-2 [scrollbar-gutter:stable] sm:px-3"
        style={
          {
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
          } as CSSProperties
        }
      >
        {lines.length === 0 ? (
          <div className="flex min-h-[10rem] flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm font-medium text-slate-300">No messages yet</p>
            <p className="max-w-xs text-xs text-slate-500">
              Captions appear as speech is processed.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col">
          {lines.map((line, index) => {
            const name = participantNames[line.participantId] ?? "Participant";
            const time = formatLineTime(line.ts);
            const cap = captionForViewer(line, viewerTargetLang);
            const crossLang = line.sourceLang !== viewerTargetLang;
            const srcStripped = stripTranslationArtifacts(line.sourceText);
            const translatedDiffers = cap.text.trim() !== srcStripped.trim();
            const showOriginalSub =
              transcriptMode === "mine" &&
              !cap.missingTranslation &&
              crossLang &&
              translatedDiffers;
            const primary =
              transcriptMode === "original"
                ? {
                    text: stripTranslationArtifacts(line.sourceText),
                    lang: line.sourceLang,
                  }
                : { text: cap.text, lang: cap.lang };
            const accent = borderAccent[primary.lang] ?? borderAccent.en;
            const spokenShort = LANGUAGE_LABEL[line.sourceLang] ?? line.sourceLang;
            const captionShort = LANGUAGE_LABEL[primary.lang] ?? primary.lang;
            const showDivider = index > 0;

            return (
              <div
                key={line.id}
                className={`motion-safe:animate-transcript-in border-l-2 py-2.5 pl-2.5 sm:pl-3 ${accent} ${
                  showDivider ? "mt-0 border-t border-slate-800/60 pt-3" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800/90 text-[10px] font-semibold text-slate-200 ring-1 ring-slate-700 sm:h-7 sm:w-7 sm:text-xs"
                    aria-hidden
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400 sm:text-xs">
                      <span className="truncate font-medium text-slate-200">
                        {name}
                      </span>
                      <span className="font-mono text-slate-500">{time}</span>
                      <span className="text-slate-600">·</span>
                      <span>{spokenShort}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-sky-300/90">
                        {transcriptMode === "mine" ? captionShort : "Original"}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="mt-1.5 text-sm leading-snug text-slate-100 sm:text-[15px]">
                  {primary.text}
                </p>

                {transcriptMode === "mine" && showOriginalSub ? (
                  <details className="group mt-1.5">
                    <summary className="cursor-pointer list-none text-[10px] font-medium text-slate-500 marker:hidden hover:text-slate-400 [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-600 transition-transform group-open:rotate-90">
                          ▸
                        </span>
                        Original ({spokenShort})
                      </span>
                    </summary>
                    <p className="mt-1 border-l border-slate-700/50 pl-2 text-xs leading-snug text-slate-400">
                      {srcStripped}
                    </p>
                  </details>
                ) : null}

                {transcriptMode === "mine" && cap.missingTranslation ? (
                  <p className="mt-1 text-[11px] text-amber-300/90" role="status">
                    No caption for {viewerLabel} yet—showing original above.
                  </p>
                ) : null}

                {transcriptMode === "original" &&
                line.translations[viewerTargetLang] ? (
                  <details className="group mt-1.5">
                    <summary className="cursor-pointer list-none text-[10px] font-medium text-slate-500 marker:hidden hover:text-slate-400 [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-600 transition-transform group-open:rotate-90">
                          ▸
                        </span>
                        {viewerLabel}
                      </span>
                    </summary>
                    <p className="mt-1 border-l border-slate-700/50 pl-2 text-xs leading-snug text-slate-300">
                      {stripTranslationArtifacts(
                        line.translations[viewerTargetLang] ?? "",
                      )}
                    </p>
                  </details>
                ) : null}
              </div>
            );
          })}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>
    </div>
  );
}
