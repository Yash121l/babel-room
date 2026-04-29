import type { Language, PipelineResult } from "@babel-room/shared";
import { logger } from "./logger";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface CreateRoomResponse {
  roomId: string;
  joinUrl: string;
}

export async function createRoom(): Promise<CreateRoomResponse> {
  const res = await fetch(`${API_BASE}/api/rooms`, { method: "POST" });
  if (!res.ok) {
    logger.error("create_room_failed", { status: res.status });
    throw new Error("Failed to create room");
  }
  return (await res.json()) as CreateRoomResponse;
}

export interface JoinRoomResponse {
  participantId: string;
  wsUrl: string;
}

export async function joinRoom(
  roomId: string,
  body: {
    displayName: string;
    sourceLang: Language;
    targetLang: Language;
  },
): Promise<JoinRoomResponse> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    logger.error("join_room_failed", { status: res.status });
    throw new Error("Failed to join room");
  }
  return (await res.json()) as JoinRoomResponse;
}

export async function postAudioChunk(
  roomId: string,
  payload: {
    participantId: string;
    roomId: string;
    pcmBase64: string;
    sampleRateHz?: number;
    sequenceNum: number;
    timestampMs: number;
  },
): Promise<{ result: PipelineResult; pipelineDurationMs: number }> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const pipelineDurationMs = Number(
    res.headers.get("X-Pipeline-Duration-Ms") ?? "0",
  );
  if (!res.ok) {
    logger.error("post_audio_failed", { status: res.status });
    throw new Error("Audio upload failed");
  }
  const result = (await res.json()) as PipelineResult;
  return { result, pipelineDurationMs };
}
