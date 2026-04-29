import type { AudioChunk } from "@babel-room/shared";
import { describe, expect, it, vi } from "vitest";
import { runAudioPipeline } from "../src/pipeline";

function makeTonePcmBase64(sampleRateHz: number, seconds = 0.35): string {
  const n = Math.floor(sampleRateHz * seconds);
  const buf = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    buf[i] = Math.round(7000 * Math.sin((i * 2 * Math.PI * 440) / sampleRateHz));
  }
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let binary = "";
  for (let i = 0; i < u8.length; i += 1) binary += String.fromCharCode(u8[i]!);
  return btoa(binary);
}

function makeEnv(ai: Ai): Env {
  return {
    AI: ai,
    ROOM: {} as DurableObjectNamespace,
    DB: {} as D1Database,
    TRANSCRIPTS: {} as R2Bucket,
    SUMMARY_WORKFLOW: {} as Workflow,
  };
}

describe("runAudioPipeline", () => {
  it("returns empty transcript when STT fails", async () => {
    const run = vi.fn().mockRejectedValue(new Error("stt down"));
    const env = makeEnv({ run } as unknown as Ai);
    const chunk: AudioChunk = {
      participantId: "p",
      roomId: "abcd1234",
      pcmBase64: makeTonePcmBase64(16_000),
      sampleRateHz: 16_000,
      sequenceNum: 1,
      timestampMs: Date.now(),
    };
    const result = await runAudioPipeline(chunk, env, {
      targetLanguages: ["en"],
      spokenLanguageHint: "en",
    });
    expect(result.transcript).toBe("");
    expect(run).toHaveBeenCalled();
  });

  it("runs translate and TTS when STT succeeds", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ text: "hola", detected_language: "es" })
      .mockResolvedValueOnce({ response: "hello" })
      .mockResolvedValueOnce({ audio: "bXAz" });
    const env = makeEnv({ run } as unknown as Ai);
    const chunk: AudioChunk = {
      participantId: "p",
      roomId: "abcd1234",
      pcmBase64: makeTonePcmBase64(16_000),
      sampleRateHz: 16_000,
      sequenceNum: 2,
      timestampMs: Date.now(),
    };
    const onTranscriptReady = vi.fn().mockResolvedValue(undefined);
    const result = await runAudioPipeline(chunk, env, {
      targetLanguages: ["en"],
      spokenLanguageHint: "es",
      whisperVocabHint: "Speaker names may include: Yash.",
      onTranscriptReady,
    });
    expect(result.transcript).toBe("hola");
    expect(result.translations.en).toBe("hello");
    expect(result.audioTracks.en).toBe("bXAz");
    expect(onTranscriptReady).toHaveBeenCalledWith({
      transcript: "hola",
      sourceLang: "es",
    });
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(3);
    const whisperArgs = run.mock.calls[0][1] as {
      language?: string;
      vad_filter?: boolean;
      initial_prompt?: string;
    };
    expect(whisperArgs.language).toBe("es");
    expect(whisperArgs.vad_filter).toBe(true);
    expect(whisperArgs.initial_prompt).toContain("Yash");
  });

  it("skips translate and TTS when all target languages match source", async () => {
    const run = vi.fn().mockResolvedValueOnce({
      text: "hello",
      detected_language: "en",
    });
    const env = makeEnv({ run } as unknown as Ai);
    const chunk: AudioChunk = {
      participantId: "p",
      roomId: "abcd1234",
      pcmBase64: makeTonePcmBase64(16_000),
      sampleRateHz: 16_000,
      sequenceNum: 4,
      timestampMs: Date.now(),
    };
    const result = await runAudioPipeline(chunk, env, {
      targetLanguages: ["en"],
      spokenLanguageHint: "en",
    });
    expect(result.transcript).toBe("hello");
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.translations).toEqual({});
  });

  it("does not call Whisper for near-silence PCM", async () => {
    const run = vi.fn();
    const env = makeEnv({ run } as unknown as Ai);
    const samples = 24_000;
    const pcm = new Uint8Array(samples * 2);
    let binary = "";
    for (let i = 0; i < pcm.length; i += 1)
      binary += String.fromCharCode(pcm[i]!);
    const chunk: AudioChunk = {
      participantId: "p",
      roomId: "abcd1234",
      pcmBase64: btoa(binary),
      sampleRateHz: 48_000,
      sequenceNum: 3,
      timestampMs: Date.now(),
    };
    const result = await runAudioPipeline(chunk, env, {
      targetLanguages: ["en"],
      spokenLanguageHint: "en",
    });
    expect(result.transcript).toBe("");
    expect(run).not.toHaveBeenCalled();
  });
});
