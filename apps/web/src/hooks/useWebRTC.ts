import { useCallback, useEffect, useRef, useState } from "react";
import { PCM_BATCH_SAMPLES } from "../constants";
import { postAudioChunk } from "../lib/api";
import { logger } from "../lib/logger";

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const buffer = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    buffer[i] =
      s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return buffer;
}

function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  );
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function useWebRTC(options: {
  roomId: string;
  participantId: string | null;
  enabled: boolean;
  onPipelineLatency?: (ms: number) => void;
  onBatchUploaded?: () => void;
}): {
  isCapturing: boolean;
  error: string | null;
  mediaStream: MediaStream | null;
} {
  const { roomId, participantId, enabled, onPipelineLatency, onBatchUploaded } =
    options;
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const seqRef = useRef(0);
  const backoffRef = useRef(500);
  const accumRef = useRef<Float32Array[]>([]);
  const sampleCountRef = useRef(0);
  const sampleRateRef = useRef(16_000);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioNode | null>(null);
  const onPipelineLatencyRef = useRef(onPipelineLatency);
  onPipelineLatencyRef.current = onPipelineLatency;
  const onBatchUploadedRef = useRef(onBatchUploaded);
  onBatchUploadedRef.current = onBatchUploaded;

  const flushBatch = useCallback(async () => {
    if (!participantId) return;
    const chunks = accumRef.current;
    accumRef.current = [];
    sampleCountRef.current = 0;
    if (chunks.length === 0) return;
    let total = 0;
    for (const c of chunks) total += c.length;
    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const pcm = floatTo16BitPCM(merged);
    const pcmBase64 = int16ToBase64(pcm);
    seqRef.current += 1;
    const payload = {
      participantId,
      roomId,
      pcmBase64,
      sampleRateHz: sampleRateRef.current,
      sequenceNum: seqRef.current,
      timestampMs: Date.now(),
    };
    try {
      const { pipelineDurationMs } = await postAudioChunk(roomId, payload);
      onPipelineLatencyRef.current?.(pipelineDurationMs);
      onBatchUploadedRef.current?.();
      backoffRef.current = 500;
    } catch {
      logger.warn("audio_post_retry", { backoffMs: backoffRef.current });
      await new Promise((r) => setTimeout(r, backoffRef.current));
      backoffRef.current = Math.min(10_000, backoffRef.current * 2);
    }
  }, [participantId, roomId]);

  useEffect(() => {
    if (!enabled || !participantId) return undefined;

    let cancelled = false;
    let flushTimer: number | null = null;

    const scheduleFlush = (): void => {
      if (flushTimer !== null) window.clearInterval(flushTimer);
      flushTimer = window.setInterval(() => {
        void flushBatch();
      }, 750);
    };

    const start = async (): Promise<void> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16_000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMediaStream(stream);
        const audioContext = new AudioContext({ sampleRate: 16_000 });
        ctxRef.current = audioContext;
        sampleRateRef.current = Math.round(audioContext.sampleRate);
        await audioContext.audioWorklet.addModule("/pcm-worklet.js");
        const source = audioContext.createMediaStreamSource(stream);
        const capture = new AudioWorkletNode(audioContext, "pcm-capture");
        workletRef.current = capture;
        capture.port.onmessage = (ev: MessageEvent<Float32Array>) => {
          const data = ev.data;
          accumRef.current.push(data);
          sampleCountRef.current += data.length;
          if (sampleCountRef.current >= PCM_BATCH_SAMPLES) {
            void flushBatch();
          }
        };
        const mute = audioContext.createGain();
        mute.gain.value = 0;
        source.connect(capture);
        capture.connect(mute);
        mute.connect(audioContext.destination);
        setIsCapturing(true);
        scheduleFlush();
      } catch (e) {
        setError(String(e));
        logger.error("mic_start_failed", { message: String(e) });
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (flushTimer !== null) window.clearInterval(flushTimer);
      workletRef.current?.disconnect();
      workletRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      setMediaStream(null);
      setIsCapturing(false);
    };
  }, [enabled, participantId, roomId, flushBatch]);

  return { isCapturing, error, mediaStream };
}
