import type { AudioChunk, Language, PipelineResult } from "@babel-room/shared";
import {
  DEFAULT_CAPTURE_SAMPLE_RATE_HZ,
  LANGUAGE_TO_MELOTTS_LANG,
  LLAMA_MODEL,
  MELOTTS_MODEL,
  PIPELINE_TIMEOUT_MS,
  WHISPER_MODEL,
} from "./constants";
import { decodeBase64ToBytes, pcm16LeMonoToWavBase64 } from "./pcmToWav";
import { shouldSkipSttForPcm } from "./pcmGate";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDetectedLanguage(raw: string | undefined): Language {
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  const two = lower.slice(0, 2);
  const candidates: Language[] = [
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
  ];
  if (candidates.includes(two as Language)) return two as Language;
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("ko")) return "ko";
  return "en";
}

function emptyResult(
  durationMs: number,
  sourceLang: Language = "en",
): PipelineResult {
  return {
    transcript: "",
    sourceLang,
    translations: {} as Record<Language, string>,
    audioTracks: {} as Record<Language, string>,
    durationMs,
  };
}

export interface RunAudioPipelineOptions {
  targetLanguages: Language[];
  /** From D1 `participants.source_language` — narrows Whisper decoding. */
  spokenLanguageHint?: Language;
  /** From display name — Whisper `initial_prompt` for uncommon names. */
  whisperVocabHint?: string | null;
  /** Fires right after STT, before translate/TTS (lower perceived latency). */
  onTranscriptReady?: (e: {
    transcript: string;
    sourceLang: Language;
  }) => Promise<void>;
}

/**
 * STT → parallel translate+TTS per target language.
 * MeloTTS returns base64 MP3 (Workers AI); clients decode with decodeAudioData.
 */
export async function runAudioPipeline(
  chunk: AudioChunk,
  env: Env,
  options: RunAudioPipelineOptions,
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const logCtx = { roomId: chunk.roomId, participantId: chunk.participantId };

  const hintLang = options.spokenLanguageHint ?? "en";

  const runCore = async (): Promise<PipelineResult> => {
    const pcmBytes = decodeBase64ToBytes(chunk.pcmBase64);
    if (pcmBytes.length === 0) {
      return emptyResult(Date.now() - pipelineStart, hintLang);
    }
    const sampleRateHz =
      chunk.sampleRateHz ?? DEFAULT_CAPTURE_SAMPLE_RATE_HZ;

    if (shouldSkipSttForPcm(pcmBytes, sampleRateHz)) {
      return emptyResult(Date.now() - pipelineStart, hintLang);
    }

    const wavBase64 = pcm16LeMonoToWavBase64(pcmBytes, sampleRateHz);

    const whisperInput: {
      audio: string;
      task: string;
      vad_filter: boolean;
      condition_on_previous_text: boolean;
      no_speech_threshold: number;
      language?: string;
      initial_prompt?: string;
    } = {
      audio: wavBase64,
      task: "transcribe",
      vad_filter: true,
      condition_on_previous_text: false,
      no_speech_threshold: 0.55,
    };
    if (options.spokenLanguageHint) {
      whisperInput.language = options.spokenLanguageHint;
    }
    const vocab = options.whisperVocabHint?.trim();
    if (vocab) {
      whisperInput.initial_prompt = vocab.slice(0, 200);
    }

    let stt: { text?: string; detected_language?: string };
    try {
      stt = (await env.AI.run(
        WHISPER_MODEL,
        whisperInput,
      )) as { text?: string; detected_language?: string };
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "stt_failed",
          ...logCtx,
          sequenceNum: chunk.sequenceNum,
          message: String(e),
        }),
      );
      return emptyResult(Date.now() - pipelineStart, hintLang);
    }

    const transcript = (stt.text ?? "").trim();
    const sourceLang = normalizeDetectedLanguage(stt.detected_language);

    if (!transcript) {
      return {
        transcript: "",
        sourceLang,
        translations: {} as Record<Language, string>,
        audioTracks: {} as Record<Language, string>,
        durationMs: Date.now() - pipelineStart,
      };
    }

    try {
      await options.onTranscriptReady?.({ transcript, sourceLang });
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "transcript_ready_hook_failed",
          ...logCtx,
          sequenceNum: chunk.sequenceNum,
          message: String(e),
        }),
      );
    }

    const uniqueTargets = [...new Set(options.targetLanguages)].filter(
      (t) => t !== sourceLang,
    );

    if (uniqueTargets.length === 0) {
      return {
        transcript,
        sourceLang,
        translations: {} as Record<Language, string>,
        audioTracks: {} as Record<Language, string>,
        durationMs: Date.now() - pipelineStart,
      };
    }

    const perLang = await Promise.all(
      uniqueTargets.map(async (targetLang) => {
        let translated = "";
        try {
          const tr = (await env.AI.run(LLAMA_MODEL, {
            prompt: `Translate this ${sourceLang} text to ${targetLang}.
Output ONLY the translation, no explanation.
<text>${transcript}</text>`,
            max_tokens: 500,
          })) as { response?: string };
          translated = (tr.response ?? "").trim();
        } catch (e) {
          console.error(
            JSON.stringify({
              level: "error",
              event: "translate_failed",
              ...logCtx,
              sequenceNum: chunk.sequenceNum,
              targetLang,
              message: String(e),
            }),
          );
          return { targetLang, translated: "", audioB64: "" };
        }

        if (!translated) {
          return { targetLang, translated: "", audioB64: "" };
        }

        let audioB64 = "";
        try {
          const melo = (await env.AI.run(MELOTTS_MODEL, {
            prompt: translated,
            lang: LANGUAGE_TO_MELOTTS_LANG[targetLang],
          })) as { audio?: string };
          audioB64 = melo.audio ?? "";
        } catch (e) {
          console.error(
            JSON.stringify({
              level: "error",
              event: "tts_failed",
              ...logCtx,
              sequenceNum: chunk.sequenceNum,
              targetLang,
              message: String(e),
            }),
          );
        }

        return { targetLang, translated, audioB64 };
      }),
    );

    const translations = {} as Record<Language, string>;
    const audioTracks = {} as Record<Language, string>;
    for (const row of perLang) {
      if (row.translated) translations[row.targetLang] = row.translated;
      if (row.audioB64) audioTracks[row.targetLang] = row.audioB64;
    }

    return {
      transcript,
      sourceLang,
      translations,
      audioTracks,
      durationMs: Date.now() - pipelineStart,
    };
  };

  try {
    const result = await Promise.race([
      runCore(),
      sleep(PIPELINE_TIMEOUT_MS).then((): PipelineResult => {
        console.error(
          JSON.stringify({
            level: "error",
            event: "pipeline_timeout",
            ...logCtx,
            sequenceNum: chunk.sequenceNum,
          }),
        );
        return emptyResult(Date.now() - pipelineStart, hintLang);
      }),
    ]);

    console.log(
      JSON.stringify({
        level: "info",
        event: "pipeline_complete",
        ...logCtx,
        sequenceNum: chunk.sequenceNum,
        durationMs: result.durationMs,
      }),
    );
    return result;
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "pipeline_unexpected",
        ...logCtx,
        sequenceNum: chunk.sequenceNum,
        message: String(e),
      }),
    );
    return emptyResult(Date.now() - pipelineStart, hintLang);
  }
}
