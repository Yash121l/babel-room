import type { Language } from "@babel-room/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "../hooks/useTranscript";
import { TRANSCRIPT_BUFFER_MAX_LINES } from "../hooks/useTranscript";
import { LANGUAGE_LABEL } from "../lib/languageLabels";
import { stripTranslationArtifacts } from "../lib/stripTranslationArtifacts";

function formatLineTime(ts: number): string {
  try {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    const s = d.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  } catch {
    return "";
  }
}

function captionText(
  line: TranscriptLine,
  viewerTargetLang: Language,
): { primary: string; missingTranslation: boolean } {
  const t = line.translations[viewerTargetLang]?.trim();
  if (t) return { primary: stripTranslationArtifacts(t), missingTranslation: false };
  return {
    primary: stripTranslationArtifacts(line.sourceText),
    missingTranslation: viewerTargetLang !== line.sourceLang,
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
    const cap = captionText(line, viewerTargetLang);
    const primary =
      transcriptMode === "original"
        ? stripTranslationArtifacts(line.sourceText)
        : cap.primary;
    let chunk = `[${time}] ${name}\n${primary}`;
    if (
      transcriptMode === "mine" &&
      !cap.missingTranslation &&
      line.sourceLang !== viewerTargetLang &&
      cap.primary.trim() !== stripTranslationArtifacts(line.sourceText).trim()
    ) {
      chunk += `\nOriginal: ${stripTranslationArtifacts(line.sourceText)}`;
    }
    blocks.push(chunk);
  }
  return blocks.join("\n\n");
}

const PARTICIPANT_COLORS = [
  "#E07A5F",
  "#5C7A6E",
  "#7A5C46",
  "#5C6B7A",
  "#6B5C7A",
  "#7A6B5C",
];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PARTICIPANT_COLORS[Math.abs(hash) % PARTICIPANT_COLORS.length] ?? "#666";
}

export function TranscriptPanel(props: {
  lines: TranscriptLine[];
  participantNames: Record<string, string>;
  viewerTargetLang: Language;
  transcriptMode: "mine" | "original";
  className?: string;
  /** When true, only the scrollable transcript (parent supplies masthead / toggles). */
  embedded?: boolean;
}): JSX.Element {
  const { lines, participantNames, viewerTargetLang, transcriptMode, className, embedded } = props;
  const [copyDone, setCopyDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const onCopyTranscript = useCallback(async (): Promise<void> => {
    if (lines.length === 0) return;
    const text = buildTranscriptPlaintext(lines, participantNames, viewerTargetLang, transcriptMode);
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setCopyDone(false);
    }
  }, [lines, participantNames, viewerTargetLang, transcriptMode]);

  const latestId = lines.length > 0 ? lines[lines.length - 1]?.participantId : null;

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className ?? ""}`}>
      {!embedded && (
        <div
          className="flex shrink-0 items-center justify-between px-8 py-3.5"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-light">
              Live Transcript
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              Showing last {TRANSCRIPT_BUFFER_MAX_LINES} segments ·{" "}
              {lines.length === 0 ? "waiting for speech" : `${lines.length} lines`}
            </p>
          </div>
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={() => void onCopyTranscript()}
            className="cursor-pointer bg-transparent px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-light transition-[transform,box-shadow] duration-75 disabled:opacity-40"
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 2,
            }}
          >
            {copyDone ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 py-6"
      >
        {lines.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-ink-light">Waiting for speech</p>
            <p className="max-w-xs text-xs text-ink-faint">
              The panel updates as participants speak. Start talking or ask
              someone to join.
            </p>
          </div>
        ) : (
          lines.map((line, idx) => {
            const isLatest = idx === lines.length - 1;
            const name = participantNames[line.participantId] ?? "Participant";
            const color = colorForId(line.participantId);
            const langLabel = LANGUAGE_LABEL[line.sourceLang] ?? line.sourceLang;
            const cap = captionText(line, viewerTargetLang);
            const primaryText =
              transcriptMode === "original"
                ? stripTranslationArtifacts(line.sourceText)
                : cap.primary;
            const showOriginalSub =
              transcriptMode === "mine" &&
              !cap.missingTranslation &&
              line.sourceLang !== viewerTargetLang &&
              cap.primary.trim() !== stripTranslationArtifacts(line.sourceText).trim();
            const activeId = isLatest ? latestId : null;

            return (
              <div
                key={line.participantId + line.ts}
                style={{ animation: "slideIn 0.25s ease" }}
              >
                {idx > 0 && (
                  <div style={{ height: 1, background: "var(--rule)", margin: 0 }} />
                )}
                <div
                  className="py-4 transition-[border-color,padding-left] duration-300"
                  style={{
                    borderLeft: isLatest
                      ? "3px solid var(--accent)"
                      : "3px solid transparent",
                    paddingLeft: isLatest ? 16 : 0,
                  }}
                >
                  {/* Header row */}
                  <div className="mb-[7px] flex flex-wrap items-center gap-2.5">
                    <div
                      className="flex shrink-0 items-center justify-center text-[10px] font-bold text-white"
                      style={{ width: 22, height: 22, background: color, borderRadius: 1 }}
                    >
                      {name[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-ink">{name}</span>
                    <span className="font-mono text-[11px] text-ink-faint">
                      {formatLineTime(line.ts)}
                    </span>
                    <span
                      className="px-1.5 py-px text-[10px] uppercase tracking-[0.06em] text-ink-light"
                      style={{ border: "1px solid var(--rule)", borderRadius: 1 }}
                    >
                      {langLabel}
                    </span>
                    {isLatest && activeId === line.participantId && (
                      <span
                        className="px-1.5 py-px text-[10px] uppercase tracking-[0.06em] text-white"
                        style={{ background: "var(--accent)", borderRadius: 1 }}
                      >
                        Live
                      </span>
                    )}
                  </div>

                  {/* Primary text */}
                  <p
                    className="pl-8 text-[15px] leading-relaxed text-ink"
                    style={{ fontWeight: isLatest ? 500 : 400 }}
                  >
                    {primaryText}
                  </p>

                  {/* Original sub-text in translated mode */}
                  {showOriginalSub && (
                    <p className="mt-1 pl-8 text-[13px] italic leading-relaxed text-ink-light">
                      {stripTranslationArtifacts(line.sourceText)}
                    </p>
                  )}

                  {/* Missing translation notice */}
                  {transcriptMode === "mine" && cap.missingTranslation && (
                    <p className="mt-1 pl-8 text-xs text-amber-600">
                      No translation to {LANGUAGE_LABEL[viewerTargetLang] ?? viewerTargetLang} — showing original.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
