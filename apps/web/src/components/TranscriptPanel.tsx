import type { Language } from "@babel-room/shared";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { TranscriptLine } from "../hooks/useTranscript";
import { LANGUAGE_LABEL } from "../lib/languageLabels";

const accent: Record<Language, string> = {
  en: "from-sky-500/20 to-sky-500/5 border-sky-500/40",
  es: "from-amber-500/20 to-amber-500/5 border-amber-500/40",
  ja: "from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/40",
  fr: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/40",
  de: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/40",
  pt: "from-orange-500/20 to-orange-500/5 border-orange-500/40",
  zh: "from-rose-500/20 to-rose-500/5 border-rose-500/40",
  hi: "from-lime-500/20 to-lime-500/5 border-lime-500/40",
  ar: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/40",
  ko: "from-violet-500/20 to-violet-500/5 border-violet-500/40",
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
    return { text: t, lang: viewerTargetLang, missingTranslation: false };
  }
  if (viewerTargetLang === line.sourceLang) {
    return {
      text: line.sourceText,
      lang: line.sourceLang,
      missingTranslation: false,
    };
  }
  return {
    text: line.sourceText,
    lang: line.sourceLang,
    missingTranslation: true,
  };
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

  const viewerLabel = useMemo(
    () => LANGUAGE_LABEL[viewerTargetLang] ?? viewerTargetLang,
    [viewerTargetLang],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-b from-slate-900/90 to-slate-950/95 shadow-lg shadow-black/20 ${className ?? ""}`}
    >
      <div className="shrink-0 border-b border-slate-800/80 bg-slate-950/95 px-3 py-2 backdrop-blur-sm sm:px-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Conversation
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
          {transcriptMode === "mine" ? (
            <>
              <span className="font-medium text-sky-200">{viewerLabel}</span> captions
              · scroll below
            </>
          ) : (
            <>
              Raw lines ·{" "}
              <span className="font-medium text-sky-200">My language</span> for{" "}
              {viewerLabel}
            </>
          )}
        </p>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth px-3 py-3 [scrollbar-gutter:stable]"
        style={
          {
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
          } as CSSProperties
        }
      >
        {lines.length === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 py-10 text-center">
            <p className="text-sm font-medium text-slate-300">No messages yet</p>
            <p className="max-w-xs text-xs text-slate-500">
              Captions appear after each speech segment is processed.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pb-2 sm:gap-2.5">
          {lines.map((line) => {
            const name = participantNames[line.participantId] ?? "Participant";
            const time = formatLineTime(line.ts);
            const cap = captionForViewer(line, viewerTargetLang);
            const crossLang = line.sourceLang !== viewerTargetLang;
            const translatedDiffers = cap.text.trim() !== line.sourceText.trim();
            const showOriginalSub =
              transcriptMode === "mine" &&
              !cap.missingTranslation &&
              crossLang &&
              translatedDiffers;
            const primary =
              transcriptMode === "original"
                ? { text: line.sourceText, lang: line.sourceLang }
                : { text: cap.text, lang: cap.lang };
            const grad = accent[primary.lang] ?? accent.en;
            const spokenShort = LANGUAGE_LABEL[line.sourceLang] ?? line.sourceLang;
            const captionShort = LANGUAGE_LABEL[primary.lang] ?? primary.lang;

            return (
              <article
                key={line.id}
                className={`relative overflow-hidden rounded-lg border bg-gradient-to-br p-2.5 sm:p-3 ${grad}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-sky-200 ring-1 ring-slate-600 sm:h-8 sm:w-8 sm:text-sm"
                    aria-hidden
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500 sm:text-[11px]">
                        {time}
                      </span>
                      <span className="hidden h-1 w-1 shrink-0 rounded-full bg-slate-600 sm:inline-block" />
                      <span className="rounded bg-slate-800/90 px-1.5 py-px text-[10px] text-slate-400 ring-1 ring-slate-600/60">
                        {spokenShort}
                      </span>
                      <span className="rounded-full bg-sky-950/80 px-1.5 py-px text-[10px] font-medium text-sky-200 ring-1 ring-sky-700/40">
                        {transcriptMode === "mine" ? captionShort : "Original"}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-sm leading-snug text-slate-50 sm:text-[15px]">
                  {primary.text}
                </p>

                {transcriptMode === "mine" && showOriginalSub ? (
                  <details className="group mt-2 rounded-md border border-slate-700/50 bg-black/15">
                    <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-slate-400 marker:hidden [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-500 transition-transform group-open:rotate-90">
                          ▸
                        </span>
                        Original ({spokenShort})
                      </span>
                    </summary>
                    <p className="border-t border-slate-700/40 px-2 pb-2 pt-1 text-xs leading-snug text-slate-400">
                      {line.sourceText}
                    </p>
                  </details>
                ) : null}

                {transcriptMode === "mine" && cap.missingTranslation ? (
                  <p className="mt-1.5 text-[11px] text-amber-300/90" role="status">
                    No caption for {viewerLabel} yet—showing original above.
                  </p>
                ) : null}

                {transcriptMode === "original" && line.translations[viewerTargetLang] ? (
                  <details className="group mt-2 rounded-md border border-slate-700/40 bg-slate-900/35">
                    <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] font-medium text-slate-400 marker:hidden [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-500 transition-transform group-open:rotate-90">
                          ▸
                        </span>
                        {viewerLabel}
                      </span>
                    </summary>
                    <p className="border-t border-slate-700/30 px-2 pb-2 pt-1 text-xs leading-snug text-slate-300">
                      {line.translations[viewerTargetLang]}
                    </p>
                  </details>
                ) : null}
              </article>
            );
          })}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>
    </div>
  );
}
