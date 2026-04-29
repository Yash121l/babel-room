import {
  STT_MIN_PCM_SECONDS,
  STT_SILENCE_MAX_PEAK,
  STT_SILENCE_MAX_RMS,
} from "./constants";

/** True when PCM is too short or too quiet to run STT reliably (Whisper hallucinates otherwise). */
export function shouldSkipSttForPcm(
  pcmBytes: Uint8Array,
  sampleRateHz: number,
): boolean {
  const minBytes = Math.floor(sampleRateHz * 2 * STT_MIN_PCM_SECONDS);
  if (pcmBytes.length < minBytes) return true;

  const n = Math.floor(pcmBytes.length / 2);
  if (n < 1) return true;

  const dv = new DataView(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    pcmBytes.byteOffset + pcmBytes.byteLength,
  );
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < n; i += 1) {
    const s = dv.getInt16(i * 2, true);
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / n);
  return peak <= STT_SILENCE_MAX_PEAK && rms <= STT_SILENCE_MAX_RMS;
}
