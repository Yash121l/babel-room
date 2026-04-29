import type { Language } from "@babel-room/shared";

export const SUPPORTED_LANGUAGES = [
  "en",
  "es",
  "ja",
  "fr",
  "de",
  "pt",
  "zh",
  "hi",
  "ar",
  "ko",
] as const satisfies readonly Language[];

export const LANGUAGE_OPTIONS = {
  en: { native: "English", english: "English" },
  es: { native: "Español", english: "Spanish" },
  ja: { native: "日本語", english: "Japanese" },
  fr: { native: "Français", english: "French" },
  de: { native: "Deutsch", english: "German" },
  pt: { native: "Português", english: "Portuguese" },
  zh: { native: "中文", english: "Chinese" },
  hi: { native: "हिन्दी", english: "Hindi" },
  ar: { native: "العربية", english: "Arabic" },
  ko: { native: "한국어", english: "Korean" },
} as const satisfies Record<
  Language,
  { readonly native: string; readonly english: string }
>;

/** ~0.75s of mono PCM at 48kHz — balance latency vs Whisper stability. */
export const PCM_BATCH_SAMPLES = 36_000;

export const MAX_WEBSOCKET_RECONNECTS = 5;

export const INITIAL_BACKOFF_MS = 500;

export const MAX_BACKOFF_MS = 10_000;
