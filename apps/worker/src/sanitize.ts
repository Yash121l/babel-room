import { MAX_TRANSCRIPT_STORE_CHARS } from "./constants";

/**
 * Remove XML-like junk models sometimes echo (e.g. corrupted `<text>` → `<xt>`).
 */
/** Leading phrases instruct models sometimes emit despite MT-only prompts. */
const TRANSLATION_LEADER = new RegExp(
  "^\\s*(?:" +
    [
      "here(?:'s| is)\\s+(?:the\\s+)?translation\\s*:?",
      "the\\s+translation\\s+is\\s*:?",
      "translated\\s*(?:text|version)?\\s*:?",
      "\\*{0,2}translation\\*{0,2}\\s*:?",
      "sure[!,.]?\\s+",
      "okay[,!]?\\s+",
    ].join("|") +
    ")\\s*",
  "i",
);

export function stripTranslationArtifacts(text: string): string {
  let t = text.trim();
  t = t.replace(/<\/?xt>/gi, "");
  t = t.replace(/<\/?ext>/gi, "");
  t = t.replace(/<\/?text>/gi, "");
  const wrapped = t.match(/^<text[^>]*>([\s\S]*)<\/text>$/i);
  if (wrapped) t = wrapped[1].trim();
  t = t.replace(TRANSLATION_LEADER, "").trim();
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export function sanitizeTranscriptText(text: string): string {
  const noNulls = text.split("\u0000").join("");
  if (noNulls.length <= MAX_TRANSCRIPT_STORE_CHARS) return noNulls;
  return noNulls.slice(0, MAX_TRANSCRIPT_STORE_CHARS);
}
