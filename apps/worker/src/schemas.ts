import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "./constants";

const languageSchema = z.enum(SUPPORTED_LANGUAGES);

export const roomIdParamSchema = z
  .string()
  .length(8)
  .regex(/^[a-z0-9]+$/);

export const participantIdSchema = z.string().uuid();

export const joinRoomBodySchema = z.object({
  displayName: z
    .string()
    .min(1)
    .max(120)
    .transform((s) => s.trim()),
  sourceLang: languageSchema,
  targetLang: languageSchema,
});

export type JoinRoomBody = z.infer<typeof joinRoomBodySchema>;

export const audioChunkBodySchema = z.object({
  participantId: participantIdSchema,
  roomId: roomIdParamSchema,
  pcmBase64: z.string().min(1),
  sampleRateHz: z.number().int().min(8000).max(96_000).optional(),
  sequenceNum: z.number().int().nonnegative(),
  timestampMs: z.number().int().nonnegative(),
});

export type AudioChunkBody = z.infer<typeof audioChunkBodySchema>;

const pipelineResultSchema = z.object({
  transcript: z.string(),
  sourceLang: languageSchema,
  translations: z.record(z.string(), z.string()),
  audioTracks: z.record(z.string(), z.string()),
  durationMs: z.number().nonnegative(),
});

export const pipelineBroadcastBodySchema = z.object({
  participantId: participantIdSchema,
  pipelineResult: pipelineResultSchema,
  transcriptSegment: z
    .object({
      ts: z.number().int().nonnegative(),
      sourceText: z.string().min(1).max(8000),
      sourceLang: languageSchema,
      translations: z.record(z.string(), z.string()),
    })
    .optional(),
});

export const devInjectTranscriptBodySchema = z.object({
  participantId: participantIdSchema,
  segments: z
    .array(
      z.object({
        sourceText: z.string().min(1).max(4000),
        sourceLang: languageSchema,
        translations: z.record(languageSchema, z.string()).optional(),
      }),
    )
    .min(1)
    .max(80),
});

export const devInjectTranslatedAudioBodySchema = z.object({
  targetParticipantId: participantIdSchema,
  audioB64: z.string().min(1).max(2_000_000),
  lang: languageSchema,
});
