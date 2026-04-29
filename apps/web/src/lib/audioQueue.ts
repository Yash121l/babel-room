/** Max queued translated clips before dropping oldest (backpressure). */
export const MAX_TRANSLATION_AUDIO_QUEUE = 16;

export function capAudioQueue<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return items.slice(items.length - max);
}
