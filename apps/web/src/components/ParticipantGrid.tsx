import type { Language, Participant } from "@babel-room/shared";

const badgeColors: Record<Language, string> = {
  en: "bg-sky-900 text-sky-200",
  es: "bg-amber-900 text-amber-200",
  ja: "bg-fuchsia-900 text-fuchsia-200",
  fr: "bg-indigo-900 text-indigo-200",
  de: "bg-emerald-900 text-emerald-200",
  pt: "bg-orange-900 text-orange-200",
  zh: "bg-rose-900 text-rose-200",
  hi: "bg-lime-900 text-lime-200",
  ar: "bg-cyan-900 text-cyan-200",
  ko: "bg-violet-900 text-violet-200",
};

export function ParticipantGrid(props: {
  participants: Record<string, Participant>;
  selfId: string | null;
  speakingIds: ReadonlySet<string>;
}): JSX.Element {
  const { participants, selfId, speakingIds } = props;
  const list = Object.values(participants);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between rounded-xl border border-slate-800 bg-room-panel px-4 py-3"
        >
          <div>
            <div className="font-medium text-slate-100">
              {p.displayName}
              {p.id === selfId ? (
                <span className="ml-2 text-xs text-room-muted">(you)</span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded px-2 py-0.5 ${badgeColors[p.sourceLang]}`}
              >
                speaks {p.sourceLang}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                hears {p.targetLang}
              </span>
            </div>
          </div>
          <div
            className={`h-3 w-3 rounded-full ${
              speakingIds.has(p.id) ? "bg-emerald-400 shadow-[0_0_12px_#34d399]" : "bg-slate-700"
            }`}
            title={speakingIds.has(p.id) ? "Speaking" : "Idle"}
          />
        </div>
      ))}
    </div>
  );
}
