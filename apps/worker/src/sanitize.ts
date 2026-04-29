import { MAX_TRANSCRIPT_STORE_CHARS } from "./constants";

export function sanitizeTranscriptText(text: string): string {
  const noNulls = text.split("\u0000").join("");
  if (noNulls.length <= MAX_TRANSCRIPT_STORE_CHARS) return noNulls;
  return noNulls.slice(0, MAX_TRANSCRIPT_STORE_CHARS);
}
