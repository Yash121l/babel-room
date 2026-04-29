/**
 * Workers AI Whisper expects a decodable audio file (WAV/MP3), not raw PCM bytes.
 * @see https://developers.cloudflare.com/workers-ai/models/whisper/
 */

function writeFourCc(dv: DataView, offset: number, s: string): number {
  for (let i = 0; i < 4; i++) dv.setUint8(offset + i, s.charCodeAt(i));
  return offset + 4;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(i + chunk, bytes.length);
    for (let j = i; j < end; j += 1) binary += String.fromCharCode(bytes[j]!);
  }
  return btoa(binary);
}

/** Decode standard base64 to bytes (PCM little-endian int16 mono). */
export function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Wrap PCM16 LE mono samples in a WAV container; returns base64 of full file. */
export function pcm16LeMonoToWavBase64(
  pcmBytes: Uint8Array,
  sampleRateHz: number,
): string {
  if (pcmBytes.length === 0) return "";

  let pcm = pcmBytes;
  if (pcm.length % 2 === 1) {
    const padded = new Uint8Array(pcm.length + 1);
    padded.set(pcm);
    padded[pcm.length] = 0;
    pcm = padded;
  }

  const dataSize = pcm.length;
  const wav = new Uint8Array(44 + dataSize);
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let o = 0;
  o = writeFourCc(dv, o, "RIFF");
  dv.setUint32(o, 36 + dataSize, true);
  o += 4;
  o = writeFourCc(dv, o, "WAVE");
  o = writeFourCc(dv, o, "fmt ");
  dv.setUint32(o, 16, true);
  o += 4;
  dv.setUint16(o, 1, true);
  o += 2;
  dv.setUint16(o, 1, true);
  o += 2;
  dv.setUint32(o, sampleRateHz, true);
  o += 4;
  dv.setUint32(o, sampleRateHz * 2, true);
  o += 4;
  dv.setUint16(o, 2, true);
  o += 2;
  dv.setUint16(o, 16, true);
  o += 2;
  o = writeFourCc(dv, o, "data");
  dv.setUint32(o, dataSize, true);
  o += 4;
  wav.set(pcm, 44);
  return bytesToBase64(wav);
}
