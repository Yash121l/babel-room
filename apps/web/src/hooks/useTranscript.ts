import { useCallback, useState } from "react";
import type { Language } from "@babel-room/shared";

export interface TranscriptLine {
  id: string;
  participantId: string;
  sourceText: string;
  sourceLang: Language;
  translations: Partial<Record<Language, string>>;
  ts: number;
}

export function useTranscript(): {
  lines: TranscriptLine[];
  addLine: (line: Omit<TranscriptLine, "id">) => void;
  clear: () => void;
} {
  const [lines, setLines] = useState<TranscriptLine[]>([]);

  const addLine = useCallback((line: Omit<TranscriptLine, "id">) => {
    if (!line.sourceText.trim()) return;
    setLines((prev) => {
      const next = [
        ...prev,
        { ...line, id: crypto.randomUUID() },
      ];
      const cap = 200;
      return next.length > cap ? next.slice(-cap) : next;
    });
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  return { lines, addLine, clear };
}
