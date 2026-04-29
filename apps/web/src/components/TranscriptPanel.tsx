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
      <div className="shrink-0 border-b border-slate-800/80 bg-slate-950/95 px-4 pb-3 pt-3 backdrop-blur-sm">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Conversation
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {transcriptMode === "mine" ? (
            <>
              Captions in{" "}
              <span className="font-medium text-sky-200">{viewerLabel}</span> (your
              &quot;hear&quot; language). Scroll the list below.
            </>
          ) : (
            <>
              Raw transcript. Switch to{" "}
              <span className="font-medium text-sky-200">My language</span> for{" "}
              {viewerLabel}.
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

        <div className="flex flex-col gap-3 pb-2">
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

            return (
              <article
                key={line.id}
                className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 ${grad}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-sky-200 ring-1 ring-slate-600"
                      aria-hidden
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-100">{name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-slate-400">
                          {time}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-400">
                          Spoken: {LANGUAGE_LABEL[line.sourceLang] ?? line.sourceLang}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <span className="rounded-full bg-sky-950/80 px-2.5 py-0.5 text-[11px] font-medium text-sky-200 ring-1 ring-sky-700/50">
                      {transcriptMode === "mine"
                        ? `Caption: ${LANGUAGE_LABEL[primary.lang] ?? primary.lang}`
                        : "Original"}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-base leading-relaxed text-slate-50">{primary.text}</p>

                {transcriptMode === "mine" && showOriginalSub ? (
                  <div className="mt-3 rounded-lg border border-slate-700/60 bg-black/20 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Original ({LANGUAGE_LABEL[line.sourceLang] ?? line.sourceLang})
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {line.sourceText}
                    </p>
                  </div>
                ) : null}

                {transcriptMode === "mine" && cap.missingTranslation ? (
                  <p className="mt-2 text-xs text-amber-300/90" role="status">
                    No translated caption for {viewerLabel} yet—showing the original line
                    above.
                  </p>
                ) : null}

                {transcriptMode === "original" && line.translations[viewerTargetLang] ? (
                  <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Also available in {viewerLabel}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {line.translations[viewerTargetLang]}
                    </p>
                  </div>
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
