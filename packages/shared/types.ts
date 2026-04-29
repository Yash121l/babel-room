export type Language =
  | "en"
  | "es"
  | "ja"
  | "fr"
  | "de"
  | "pt"
  | "zh"
  | "hi"
  | "ar"
  | "ko";

export interface Participant {
  id: string;
  displayName: string;
  sourceLang: Language;
  targetLang: Language;
  joinedAt: number;
}

export interface RoomState {
  roomId: string;
  participants: Record<string, Participant>;
  createdAt: number;
  isActive: boolean;
}

/** WebSocket message types — DO ↔ client */
export type WSMessageType =
  | { type: "participant_joined"; participant: Participant }
  | { type: "participant_left"; participantId: string }
  | {
      type: "transcript_segment";
      participantId: string;
      text: string;
      lang: Language;
      ts: number;
    }
  | {
      type: "translated_audio";
      targetParticipantId: string;
      audioB64: string;
      lang: Language;
    }
  | { type: "room_state"; state: RoomState }
  | { type: "error"; code: string; message: string }
  | { type: "ping" }
  | { type: "pong" };

/** Audio pipeline message — Worker → DO internal */
export interface AudioChunk {
  participantId: string;
  roomId: string;
  pcmBase64: string;
  /** Actual `AudioContext.sampleRate` from capture (Whisper WAV header must match). */
  sampleRateHz?: number;
  sequenceNum: number;
  timestampMs: number;
}

export interface PipelineResult {
  transcript: string;
  sourceLang: Language;
  translations: Record<Language, string>;
  audioTracks: Record<Language, string>;
  durationMs: number;
}
