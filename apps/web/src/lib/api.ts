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
  createdAt: number;
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

export interface EndRoomResponse {
  success: boolean;
  alreadyEnded: boolean;
}

export async function endRoom(roomId: string): Promise<EndRoomResponse> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    logger.error("end_room_failed", { status: res.status });
    throw new Error("Failed to end call");
  }
  return (await res.json()) as EndRoomResponse;
}

export type RoomSummaryResponse =
  | { status: "pending" }
  | {
      status: "ready";
      roomId: string;
      summary: string;
      segmentCount: number;
      generatedAt: number;
    };

export async function getRoomSummary(
  roomId: string,
): Promise<RoomSummaryResponse> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/summary`);
  if (!res.ok) {
    logger.error("get_summary_failed", { status: res.status });
    throw new Error("Failed to load summary");
  }
  return (await res.json()) as RoomSummaryResponse;
}
