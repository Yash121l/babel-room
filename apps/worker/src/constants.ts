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

export const LANGUAGE_LABELS = {
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

/** Room IDs are 8 lowercase alphanumeric characters. */
export const ROOM_ID_LENGTH = 8;

/** Max stored transcript length after sanitization. */
export const MAX_TRANSCRIPT_STORE_CHARS = 5000;

/** PCM16 mono @ 16kHz — soft cap on decoded chunk size (bytes). */
export const MAX_AUDIO_CHUNK_BYTES = 512_000;

/** Default WAV sample rate if client omits `sampleRateHz` (see `AudioContext` hint). */
export const DEFAULT_CAPTURE_SAMPLE_RATE_HZ = 16_000;

/** Skip STT below this much mono PCM16 audio (reduces Whisper hallucinations on tiny clips). */
export const STT_MIN_PCM_SECONDS = 0.18;

/**
 * Treat as silence if BOTH peak and RMS are below these (int16 scale).
 * Skips STT to avoid stock-phrase hallucinations on near-silent buffers.
 */
export const STT_SILENCE_MAX_PEAK = 320;
export const STT_SILENCE_MAX_RMS = 32;

/** Pipeline wall-clock budget (ms). */
export const PIPELINE_TIMEOUT_MS = 5000;

/** Rolling window for audio POST rate limit (ms). */
export const AUDIO_RATE_WINDOW_MS = 1000;

/** Max audio POSTs per participant per rolling window. */
export const AUDIO_RATE_MAX_PER_WINDOW = 4;

/** Whisper model id (Workers AI). */
export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

/** Translation model id. */
export const LLAMA_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/** TTS model id. */
export const MELOTTS_MODEL = "@cf/myshell-ai/melotts";

/**
 * MeloTTS `lang` values differ slightly from BCP-47 in some cases.
 * @see https://developers.cloudflare.com/workers-ai/models/melotts/
 */
export const LANGUAGE_TO_MELOTTS_LANG: Record<Language, string> = {
  en: "en",
  es: "es",
  ja: "ja",
  fr: "fr",
  de: "de",
  pt: "pt",
  zh: "zh",
  hi: "en",
  ar: "en",
  ko: "kr",
} as const satisfies Record<Language, string>;
