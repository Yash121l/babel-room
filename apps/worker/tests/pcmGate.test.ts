import { describe, expect, it } from "vitest";
import { shouldSkipSttForPcm } from "../src/pcmGate";

describe("shouldSkipSttForPcm", () => {
  it("skips very short buffers", () => {
    const pcm = new Uint8Array(100);
    expect(shouldSkipSttForPcm(pcm, 48_000)).toBe(true);
  });

  it("skips long silence", () => {
    const samples = 48_000;
    const pcm = new Uint8Array(samples * 2);
    expect(shouldSkipSttForPcm(pcm, 48_000)).toBe(true);
  });

  it("allows tonal speech-like PCM", () => {
    const sampleRate = 48_000;
    const seconds = 0.25;
    const n = Math.floor(sampleRate * seconds);
    const buf = new Int16Array(n);
    for (let i = 0; i < n; i += 1) {
      buf[i] = Math.round(6000 * Math.sin((i * 2 * Math.PI * 220) / sampleRate));
    }
    const pcm = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    expect(shouldSkipSttForPcm(pcm, sampleRate)).toBe(false);
  });
});
