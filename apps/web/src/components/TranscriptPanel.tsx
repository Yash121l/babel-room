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

export function TranscriptPanel(props: {
  lines: TranscriptLine[];
  participantNames: Record<string, string>;
}): JSX.Element {
  const { lines, participantNames } = props;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-xl border border-slate-800 bg-room-panel p-3">
      {lines.length === 0 ? (
        <p className="text-sm text-room-muted">Transcript appears as people speak.</p>
      ) : null}
      {lines.map((line) => (
        <div
          key={line.id}
          className={`rounded-r-md border-l-4 bg-slate-900/60 px-3 py-2 text-sm ${colors[line.lang]}`}
        >
          <div className="text-xs text-room-muted">
            {participantNames[line.participantId] ?? line.participantId} ·{" "}
            {line.lang}
          </div>
          <div className="mt-1 text-slate-100">{line.text}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
