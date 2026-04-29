import { useCallback, useState } from "react";
import type { Language } from "@babel-room/shared";

export interface TranscriptLine {
  id: string;
  participantId: string;
  sourceText: string;
  sourceLang: Language;
  translations: Partial<Record<Language, string>>;
  /** Server-ish segment time from pipeline. */
  ts: number;
  /** Capture batch order per speaker (optional for dev / legacy). */
  sequenceNum?: number;
  /** Client time when this line was created or last coalesced into (freshness / age UI). */
  receivedAt: number;
}

const COALESCE_MAX_GAP_MS = 1500;

const COALESCE_MAX_CHARS = 800;

function mergeTranslations(
  prev: Partial<Record<Language, string>>,
  incoming: Partial<Record<Language, string>>,
): Partial<Record<Language, string>> {
  const out = { ...prev };
  for (const [lang, t] of Object.entries(incoming) as [Language, string][]) {
    const v = t.trim();
    if (v) out[lang] = v;
  }
  return out;
}

function compareLines(a: TranscriptLine, b: TranscriptLine): number {
  const dts = a.ts - b.ts;
  if (dts !== 0) return dts;
  const sa = a.sequenceNum ?? 0;
  const sb = b.sequenceNum ?? 0;
  if (sa !== sb) return sa - sb;
  return a.participantId.localeCompare(b.participantId);
}

function mergeCoalesced(sorted: TranscriptLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of sorted) {
    const last = out[out.length - 1];
    const bothHaveSeq =
      last !== undefined &&
      last.sequenceNum !== undefined &&
      line.sequenceNum !== undefined;
    const seqConsecutive =
      bothHaveSeq && line.sequenceNum === last.sequenceNum! + 1;
    const seqOk = !bothHaveSeq || seqConsecutive;

    const canCoalesce =
      last &&
      last.participantId === line.participantId &&
      last.sourceLang === line.sourceLang &&
      seqOk &&
      line.ts >= last.ts &&
      line.ts - last.ts < COALESCE_MAX_GAP_MS &&
      last.sourceText.length + 1 + line.sourceText.trim().length <=
        COALESCE_MAX_CHARS;

    if (canCoalesce && last) {
      out[out.length - 1] = {
        ...last,
        sourceText: `${last.sourceText} ${line.sourceText.trim()}`.trim(),
        translations: mergeTranslations(last.translations, line.translations),
        ts: line.ts,
        sequenceNum: line.sequenceNum ?? last.sequenceNum,
        receivedAt: line.receivedAt,
      };
    } else {
      out.push(line);
    }
  }
  return out;
}

export const TRANSCRIPT_BUFFER_MAX_LINES = 200;

export function useTranscript(): {
  lines: TranscriptLine[];
  addLine: (line: Omit<TranscriptLine, "id" | "receivedAt">) => void;
  clear: () => void;
} {
  const [lines, setLines] = useState<TranscriptLine[]>([]);

  const addLine = useCallback((line: Omit<TranscriptLine, "id" | "receivedAt">) => {
    if (!line.sourceText.trim()) return;
    setLines((prev) => {
      const now = Date.now();
      const newLine: TranscriptLine = {
        ...line,
        id: crypto.randomUUID(),
        receivedAt: now,
      };
      const combined = [...prev, newLine].sort(compareLines);
      const merged = mergeCoalesced(combined);
      const cap = TRANSCRIPT_BUFFER_MAX_LINES;
      return merged.length > cap ? merged.slice(-cap) : merged;
    });
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  return { lines, addLine, clear };
}
