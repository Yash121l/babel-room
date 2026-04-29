import { useCallback, useEffect, useRef, useState } from "react";
import { capAudioQueue, MAX_TRANSLATION_AUDIO_QUEUE } from "../lib/audioQueue";
import { logger } from "../lib/logger";

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes and plays translated TTS clips one at a time to avoid overlapping speech.
 */
export function useSequentialAudioPlayback(): {
  enqueue: (audioB64: string) => void;
  clearQueue: () => void;
  dispose: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  setVolume: (v: number) => void;
  muted: boolean;
  volume: number;
  queueDepth: number;
  isPlaying: boolean;
} {
  const queueRef = useRef<string[]>([]);
  const drainingRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const mutedRef = useRef(false);
  const volumeRef = useRef(1);
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [queueDepth, setQueueDepth] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const ensureGraph = useCallback((): { ctx: AudioContext; gain: GainNode } => {
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      ctxRef.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = mutedRef.current ? 0 : volumeRef.current;
      gain.connect(ctx.destination);
      gainRef.current = gain;
    }
    const gain = gainRef.current!;
    return { ctx: ctxRef.current!, gain };
  }, []);

  const applyGain = useCallback(() => {
    const g = gainRef.current;
    if (!g) return;
    g.gain.value = mutedRef.current ? 0 : volumeRef.current;
  }, []);

  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m;
    setMutedState(m);
    applyGain();
  }, [applyGain]);

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      volumeRef.current = clamped;
      setVolumeState(clamped);
      applyGain();
    },
    [applyGain],
  );

  const drain = useCallback(async (): Promise<void> => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        if (mutedRef.current) {
          queueRef.current = [];
          setQueueDepth(0);
          break;
        }
        const b64 = queueRef.current.shift()!;
        setQueueDepth(queueRef.current.length);
        const { ctx, gain } = ensureGraph();
        if (ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch {
            /* ignore */
          }
        }
        try {
          const bytes = base64ToUint8Array(b64);
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          const audioBuffer = await ctx.decodeAudioData(ab);
          setIsPlaying(true);
          await new Promise<void>((resolve, reject) => {
            const src = ctx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(gain);
            src.onended = () => resolve();
            src.onerror = () => reject(new Error("buffer source error"));
            try {
              src.start();
            } catch (e) {
              reject(e);
            }
          });
        } catch (e) {
          logger.error("playback_failed", { message: String(e) });
        } finally {
          setIsPlaying(false);
        }
      }
    } finally {
      drainingRef.current = false;
      setQueueDepth(queueRef.current.length);
    }
  }, [ensureGraph]);

  const enqueue = useCallback(
    (audioB64: string) => {
      if (mutedRef.current || !audioB64) return;
      queueRef.current = capAudioQueue(
        [...queueRef.current, audioB64],
        MAX_TRANSLATION_AUDIO_QUEUE,
      );
      setQueueDepth(queueRef.current.length);
      void drain();
    },
    [drain],
  );

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    setQueueDepth(0);
  }, []);

  const dispose = useCallback(async (): Promise<void> => {
    queueRef.current = [];
    setQueueDepth(0);
    setIsPlaying(false);
    const ctx = ctxRef.current;
    ctxRef.current = null;
    gainRef.current = null;
    if (ctx && ctx.state !== "closed") {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      void dispose();
    };
  }, [dispose]);

  return {
    enqueue,
    clearQueue,
    dispose,
    setMuted,
    setVolume,
    muted,
    volume,
    queueDepth,
    isPlaying,
  };
}
