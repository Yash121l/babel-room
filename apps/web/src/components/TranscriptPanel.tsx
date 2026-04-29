import type { Language } from "@babel-room/shared";
import { useEffect, useRef } from "react";
import type { TranscriptLine } from "../hooks/useTranscript";

const colors: Record<Language, string> = {
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

function lineDisplay(
  line: TranscriptLine,
  mode: "mine" | "original",
  viewerTargetLang: Language,
): { text: string; lang: Language } {
  if (mode === "original") {
    return { text: line.sourceText, lang: line.sourceLang };
  }
  const t = line.translations[viewerTargetLang]?.trim();
  if (t) return { text: t, lang: viewerTargetLang };
  return { text: line.sourceText, lang: line.sourceLang };
}

export function TranscriptPanel(props: {
  lines: TranscriptLine[];
  participantNames: Record<string, string>;
  /** Language you want to read/hear (captions in this language when mode is mine). */
  viewerTargetLang: Language;
  transcriptMode: "mine" | "original";
  className?: string;
}): JSX.Element {
  const { lines, participantNames, viewerTargetLang, transcriptMode, className } =
    props;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto rounded-xl border border-slate-800 bg-room-panel p-3 ${className ?? "max-h-80"}`}
    >
      {lines.length === 0 ? (
        <p className="text-sm text-room-muted">Transcript appears as people speak.</p>
      ) : null}
      {lines.map((line) => {
        const { text, lang } = lineDisplay(line, transcriptMode, viewerTargetLang);
        return (
          <div
            key={line.id}
            className={`rounded-r-md border-l-4 bg-slate-900/60 px-3 py-2 text-sm ${colors[lang]}`}
          >
            <div className="text-xs text-room-muted">
              {participantNames[line.participantId] ?? line.participantId} · {lang}
              {transcriptMode === "mine" && lang !== line.sourceLang ? (
                <span className="text-slate-500"> (from {line.sourceLang})</span>
              ) : null}
            </div>
            <div className="mt-1 text-slate-100">{text}</div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
