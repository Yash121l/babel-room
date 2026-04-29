/** Strip XML-like junk from translation strings (mirrors worker sanitize). */
export function stripTranslationArtifacts(text: string): string {
  let t = text.trim();
  t = t.replace(/<\/?xt>/gi, "");
  t = t.replace(/<\/?ext>/gi, "");
  t = t.replace(/<\/?text>/gi, "");
  const wrapped = t.match(/^<text[^>]*>([\s\S]*)<\/text>$/i);
  if (wrapped) t = wrapped[1].trim();
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
