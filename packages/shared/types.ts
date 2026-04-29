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

/** Serializable ICE candidate for WebSocket signaling */
export interface IceCandidateJson {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

/** WebSocket message types — DO ↔ client */
export type WSMessageType =
  | { type: "participant_joined"; participant: Participant }
  | { type: "participant_left"; participantId: string }
  | {
      type: "transcript_segment";
      participantId: string;
      /** Raw STT / spoken text */
      sourceText: string;
      sourceLang: Language;
      /** Per-target-language strings (same keys as pipeline translations) */
      translations: Partial<Record<Language, string>>;
      ts: number;
    }
  | {
      type: "translated_audio";
      targetParticipantId: string;
      audioB64: string;
      lang: Language;
    }
  | {
      type: "webrtc_signal";
      from: string;
      to: string;
      kind: "offer" | "answer" | "ice";
      sdp?: string;
      candidate?: IceCandidateJson;
    }
  | { type: "room_state"; state: RoomState }
  | { type: "room_ended" }
  | { type: "error"; code: string; message: string }
  | { type: "ping" }
  | { type: "pong" };

/** Client → DO messages (JSON on room WebSocket) */
export type RoomClientMessage =
  | { type: "ping" }
  | {
      type: "webrtc_signal";
      to: string;
      kind: "offer" | "answer" | "ice";
      sdp?: string;
      candidate?: IceCandidateJson;
    };

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
