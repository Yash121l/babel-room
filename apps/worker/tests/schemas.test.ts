import { describe, expect, it } from "vitest";
import {
  audioChunkBodySchema,
  joinRoomBodySchema,
  participantIdSchema,
  pipelineBroadcastBodySchema,
  roomIdParamSchema,
} from "../src/schemas";

describe("roomIdParamSchema", () => {
  it("accepts valid 8-char alphanumeric ids", () => {
    expect(roomIdParamSchema.safeParse("abcd1234").success).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(roomIdParamSchema.safeParse("abc").success).toBe(false);
  });
  it("rejects non-alphanumeric", () => {
    expect(roomIdParamSchema.safeParse("abcd-234").success).toBe(false);
  });
});

describe("participantIdSchema", () => {
  it("accepts UUID v4", () => {
    expect(
      participantIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000")
        .success,
    ).toBe(true);
  });
  it("rejects invalid", () => {
    expect(participantIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("joinRoomBodySchema", () => {
  it("accepts valid body", () => {
    const r = joinRoomBodySchema.safeParse({
      displayName: "  Ada  ",
      sourceLang: "en",
      targetLang: "ja",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayName).toBe("Ada");
  });
  it("rejects bad language", () => {
    expect(
      joinRoomBodySchema.safeParse({
        displayName: "x",
        sourceLang: "xx",
        targetLang: "en",
      }).success,
    ).toBe(false);
  });
});

describe("audioChunkBodySchema", () => {
  it("accepts valid chunk", () => {
    expect(
      audioChunkBodySchema.safeParse({
        participantId: "550e8400-e29b-41d4-a716-446655440000",
        roomId: "abcd1234",
        pcmBase64: "AAAA",
        sequenceNum: 0,
        timestampMs: 1,
      }).success,
    ).toBe(true);
  });
});

describe("pipelineBroadcastBodySchema", () => {
  it("accepts broadcast payload", () => {
    expect(
      pipelineBroadcastBodySchema.safeParse({
        participantId: "550e8400-e29b-41d4-a716-446655440000",
        pipelineResult: {
          transcript: "hi",
          sourceLang: "en",
          translations: { es: "hola" },
          audioTracks: { es: "qqqq" },
          durationMs: 10,
        },
      }).success,
    ).toBe(true);
  });
  it("rejects invalid sourceLang", () => {
    expect(
      pipelineBroadcastBodySchema.safeParse({
        participantId: "550e8400-e29b-41d4-a716-446655440000",
        pipelineResult: {
          transcript: "hi",
          sourceLang: "xx",
          translations: {},
          audioTracks: {},
          durationMs: 0,
        },
      }).success,
    ).toBe(false);
  });
});
