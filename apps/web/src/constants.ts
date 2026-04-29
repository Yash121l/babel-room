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

/**
 * Target window of mono PCM before an early flush (seconds × actual sample rate).
 * Was previously a fixed sample count tuned for 48 kHz while capture runs at 16 kHz.
 */
export const PCM_FLUSH_TARGET_SEC = 0.5;

export const PCM_FLUSH_MIN_SAMPLES = 4_000;

export const PCM_FLUSH_MAX_SAMPLES = 16_000;

/**
 * Periodic flush while capturing. Worker allows ~4 audio POSTs/sec per participant
 * (see apps/worker AUDIO_RATE_MAX_PER_WINDOW); 480ms ≈ 2.1/sec average.
 */
export const PCM_PERIODIC_FLUSH_MS = 480;

export const MAX_WEBSOCKET_RECONNECTS = 5;

export const INITIAL_BACKOFF_MS = 500;

export const MAX_BACKOFF_MS = 10_000;
