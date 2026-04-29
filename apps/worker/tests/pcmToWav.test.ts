import { describe, expect, it } from "vitest";
import {
  decodeBase64ToBytes,
  pcm16LeMonoToWavBase64,
} from "../src/pcmToWav";

describe("pcm16LeMonoToWavBase64", () => {
  it("produces a valid WAV RIFF header", () => {
    const pcm = new Uint8Array([0x00, 0x00, 0xff, 0x7f]);
    const b64 = pcm16LeMonoToWavBase64(pcm, 16_000);
    const wav = decodeBase64ToBytes(b64);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...wav.subarray(12, 16))).toBe("fmt ");
    expect(String.fromCharCode(...wav.subarray(36, 40))).toBe("data");
    expect(wav.length).toBe(44 + pcm.length);
  });

  it("pads odd-length PCM to even sample boundary", () => {
    const pcm = new Uint8Array([0x01, 0x02, 0x03]);
    const b64 = pcm16LeMonoToWavBase64(pcm, 48_000);
    const wav = decodeBase64ToBytes(b64);
    const dv = new DataView(wav.buffer, wav.byteOffset + 40, 4);
    expect(dv.getUint32(0, true)).toBe(4);
  });
});
