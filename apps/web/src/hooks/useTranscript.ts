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
      const last = prev[prev.length - 1];
      const nextChunk = line.sourceText.trim();
      const canCoalesce =
        last &&
        last.participantId === line.participantId &&
        last.sourceLang === line.sourceLang &&
        line.ts - last.ts < COALESCE_MAX_GAP_MS &&
        last.sourceText.length + 1 + nextChunk.length <= COALESCE_MAX_CHARS;

      const now = Date.now();
      if (canCoalesce) {
        const merged: TranscriptLine = {
          ...last,
          sourceText: `${last.sourceText} ${nextChunk}`.trim(),
          translations: mergeTranslations(last.translations, line.translations),
          ts: line.ts,
          receivedAt: now,
        };
        const next = [...prev.slice(0, -1), merged];
        const cap = TRANSCRIPT_BUFFER_MAX_LINES;
        return next.length > cap ? next.slice(-cap) : next;
      }

      const next = [
        ...prev,
        { ...line, id: crypto.randomUUID(), receivedAt: now },
      ];
      const cap = TRANSCRIPT_BUFFER_MAX_LINES;
      return next.length > cap ? next.slice(-cap) : next;
    });
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  return { lines, addLine, clear };
}
