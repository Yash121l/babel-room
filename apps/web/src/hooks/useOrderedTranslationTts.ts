import { useCallback, useEffect, useRef } from "react";
import { logger } from "../lib/logger";

const MAX_PENDING_CLIPS = 32;
/** If the first buffered clip has seq > 1, wait briefly for a lower seq still in flight. */
const HEAD_DEFER_MS = 120;

/**
 * Buffers translated TTS clips until `sequenceNum` is contiguous from the stream head,
 * then forwards to sequential playback. Handles HTTP responses completing out of
 * capture order (summary stays correct via D1 `started_at`; live TTS needs this).
 */
export function useOrderedTranslationTts(
  enqueue: (audioB64: string) => void,
  clearQueue: () => void,
  options: { resetKey: string },
): {
  enqueueSequenced: (
    speakerParticipantId: string,
    sequenceNum: number,
    audioB64: string,
  ) => void;
} {
  const { resetKey } = options;
  const pendingRef = useRef<Map<string, Map<number, string>>>(new Map());
  /** `undefined` = head not pinned yet; number = next seq to play. */
  const nextPlayRef = useRef<Map<string, number | undefined>>(new Map());
  const headDeferTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const clearDefer = useCallback((speakerId: string) => {
    const t = headDeferTimerRef.current.get(speakerId);
    if (t) clearTimeout(t);
    headDeferTimerRef.current.delete(speakerId);
  }, []);

  useEffect(() => {
    for (const t of headDeferTimerRef.current.values()) clearTimeout(t);
    headDeferTimerRef.current.clear();
    pendingRef.current.clear();
    nextPlayRef.current.clear();
    clearQueue();
  }, [resetKey, clearQueue]);

  const drainSpeaker = useCallback(
    (speakerId: string, opts?: { forceHead?: boolean }) => {
      const pending = pendingRef.current.get(speakerId);
      if (!pending || pending.size === 0) return;

      let next = nextPlayRef.current.get(speakerId);
      if (next === undefined) {
        const kmin = Math.min(...pending.keys());
        if (!opts?.forceHead && pending.size === 1 && kmin > 1) {
          if (!headDeferTimerRef.current.has(speakerId)) {
            const t = setTimeout(() => {
              headDeferTimerRef.current.delete(speakerId);
              drainSpeaker(speakerId, { forceHead: true });
            }, HEAD_DEFER_MS);
            headDeferTimerRef.current.set(speakerId, t);
          }
          return;
        }
        next = kmin;
        nextPlayRef.current.set(speakerId, next);
        clearDefer(speakerId);
      }

      while (pending.has(next)) {
        const b64 = pending.get(next)!;
        pending.delete(next);
        enqueue(b64);
        next += 1;
      }
      nextPlayRef.current.set(speakerId, next);

      if (pending.size > MAX_PENDING_CLIPS) {
        const keys = [...pending.keys()].sort((a, b) => b - a);
        while (keys.length > MAX_PENDING_CLIPS) {
          const drop = keys.shift();
          if (drop !== undefined) pending.delete(drop);
        }
      }
    },
    [enqueue, clearDefer],
  );

  const enqueueSequenced = useCallback(
    (speakerParticipantId: string, sequenceNum: number, audioB64: string) => {
      if (!audioB64) return;
      const next = nextPlayRef.current.get(speakerParticipantId);
      if (typeof next === "number" && sequenceNum < next) {
        logger.warn("tts_late_out_of_order", {
          speakerParticipantId,
          sequenceNum,
          nextExpected: next,
        });
        return;
      }
      let m = pendingRef.current.get(speakerParticipantId);
      if (!m) {
        m = new Map();
        pendingRef.current.set(speakerParticipantId, m);
      }
      m.set(sequenceNum, audioB64);
      drainSpeaker(speakerParticipantId);
    },
    [drainSpeaker],
  );

  return { enqueueSequenced };
}
