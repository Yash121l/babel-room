import { useCallback, useState } from "react";
import type { Language } from "@babel-room/shared";

export interface TranscriptLine {
  id: string;
  participantId: string;
  text: string;
  lang: Language;
  ts: number;
}

export function useTranscript(): {
  lines: TranscriptLine[];
  addLine: (line: Omit<TranscriptLine, "id">) => void;
  clear: () => void;
} {
  const [lines, setLines] = useState<TranscriptLine[]>([]);

  const addLine = useCallback((line: Omit<TranscriptLine, "id">) => {
    if (!line.text.trim()) return;
    setLines((prev) => [
      ...prev,
      { ...line, id: `${line.ts}-${line.participantId}-${prev.length}` },
    ]);
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  return { lines, addLine, clear };
}
