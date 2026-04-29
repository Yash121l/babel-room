import { describe, expect, it } from "vitest";
import {
  capAudioQueue,
  MAX_TRANSLATION_AUDIO_QUEUE,
} from "../../web/src/lib/audioQueue";

describe("audioQueue", () => {
  it("capAudioQueue keeps newest items when over max", () => {
    const items = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const capped = capAudioQueue(items, MAX_TRANSLATION_AUDIO_QUEUE);
    expect(capped).toHaveLength(MAX_TRANSLATION_AUDIO_QUEUE);
    expect(capped[0]).toBe("c4");
    expect(capped[MAX_TRANSLATION_AUDIO_QUEUE - 1]).toBe("c19");
  });

  it("capAudioQueue returns same array when under max", () => {
    const items = ["a", "b"];
    expect(capAudioQueue(items, 16)).toEqual(items);
  });
});
