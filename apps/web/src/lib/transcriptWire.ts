import type { Language } from "@babel-room/shared";
import { stripTranslationArtifacts } from "./stripTranslationArtifacts";

/** Normalize `translations` from WebSocket JSON (handles null / wrong shape). */
export function parseTranscriptSegmentTranslations(
  raw: unknown,
): Partial<Record<Language, string>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<Language, string>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const t = stripTranslationArtifacts(v);
    if (t.length > 0) out[k as Language] = t;
  }
  return out;
}
