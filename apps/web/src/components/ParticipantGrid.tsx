import type { Language, Participant } from "@babel-room/shared";
import { LANGUAGE_LABEL } from "../lib/languageLabels";

const PARTICIPANT_COLORS = [
  "#E07A5F",
  "#5C7A6E",
  "#7A5C46",
  "#5C6B7A",
  "#6B5C7A",
  "#7A6B5C",
];

function colorForId(id: string, index: number): string {
  const seed = id.charCodeAt(0) + index;
  return PARTICIPANT_COLORS[seed % PARTICIPANT_COLORS.length] ?? "#666";
}

function langLabel(code: Language): string {
  return LANGUAGE_LABEL[code] ?? code;
}

export function ParticipantGrid(props: {
  participants: Record<string, Participant>;
  selfId: string | null;
  speakingIds: ReadonlySet<string>;
  /** Participant id that should show the Host badge (first joiner / room creator). */
  hostParticipantId?: string | null;
}): JSX.Element {
  const { participants, selfId, speakingIds, hostParticipantId } = props;
  const list = Object.values(participants);

  if (list.length === 0) {
    return (
      <p className="text-xs text-ink-faint">No other participants yet.</p>
    );
  }

  return (
    <div className="flex flex-col">
      {list.map((p, i) => {
        const color = colorForId(p.id, i);
        const speaking = speakingIds.has(p.id);
        return (
          <div key={p.id}>
            {i > 0 && (
              <div style={{ height: 1, background: "var(--rule)" }} />
            )}
            <div className="flex items-center gap-2.5 py-2.5">
              <div
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center text-xs font-bold text-white"
                style={{
                  background: color,
                  borderRadius: 1,
                  outline: speaking
                    ? `2px solid var(--accent-alt)`
                    : "none",
                  outlineOffset: 2,
                  transition: "outline 0.2s",
                }}
              >
                {p.displayName[0]?.toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">
                    {p.displayName}
                  </span>
                  {hostParticipantId && p.id === hostParticipantId && (
                    <span
                      className="px-1 py-px text-[9px] uppercase tracking-[0.07em] text-ink"
                      style={{ border: "1px solid var(--ink)", borderRadius: 1 }}
                    >
                      Host
                    </span>
                  )}
                  {p.id === selfId && (
                    <span
                      className="px-1 py-px text-[9px] uppercase tracking-[0.07em] text-ink-faint"
                      style={{
                        border: "1px solid var(--rule)",
                        borderRadius: 1,
                      }}
                    >
                      You
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-light">
                  {langLabel(p.sourceLang)} → {langLabel(p.targetLang)}
                </div>
              </div>

              {/* Speaking indicator */}
              {speaking ? (
                <div className="flex h-3.5 items-end gap-0.5">
                  {[4, 8, 12, 7, 5].map((h, j) => (
                    <div
                      key={j}
                      style={{
                        width: 2,
                        background: "var(--accent-alt)",
                        borderRadius: 1,
                        height: h,
                        animation: `waveBar ${0.3 + j * 0.07}s ease-in-out infinite`,
                        animationDelay: `${j * 0.04}s`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--rule)" }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
