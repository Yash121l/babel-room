import { customAlphabet } from "nanoid";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AudioChunk, Language, PipelineResult } from "@babel-room/shared";
import {
  getDistinctTargetLanguagesForRoom,
  getParticipantTranscriptionHints,
  getRoomById,
  insertParticipant,
  insertRoom,
  insertTranscriptSegment,
  markRoomEnded,
} from "./db";
import { MAX_AUDIO_CHUNK_BYTES } from "./constants";
import { runAudioPipeline } from "./pipeline";
import { sanitizeTranscriptText } from "./sanitize";
import {
  audioChunkBodySchema,
  joinRoomBodySchema,
  roomIdParamSchema,
} from "./schemas";
import type { AppEnv } from "./middleware";
import { requestContextMiddleware, structuredError } from "./middleware";
export { RoomDO } from "./room";
export { PostCallSummaryWorkflow } from "./workflows";

const generateRoomId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

const app = new Hono<AppEnv>();

app.use("*", requestContextMiddleware);

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.options("*", (c) => c.body(null, 204));

app.post("/api/rooms", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    let roomId = generateRoomId();
    for (let i = 0; i < 12; i += 1) {
      const existing = await getRoomById(c.env.DB, roomId);
      if (!existing) break;
      roomId = generateRoomId();
    }

    const createdAt = Date.now();
    await insertRoom(c.env.DB, roomId, createdAt);

    const joinUrl = `/room/${roomId}`;
    console.log(
      JSON.stringify({
        level: "info",
        event: "room_created",
        roomId,
        requestId,
        durationMs: Date.now() - startedAt,
      }),
    );

    return c.json(
      { roomId, joinUrl },
      201,
      {
        "X-Request-Id": requestId,
        "X-Pipeline-Duration-Ms": "0",
      },
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "create_room_failed",
        requestId,
        message: String(e),
      }),
    );
    return structuredError(
      requestId,
      "INTERNAL",
      "Failed to create room",
      500,
    );
  }
});

app.get("/api/rooms/:roomId", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(requestId, "INVALID_ROOM", "Invalid room id", 400);
    }
    const room = await getRoomById(c.env.DB, roomIdParse.data);
    if (!room) {
      return structuredError(requestId, "NOT_FOUND", "Room not found", 404);
    }
    return c.json(room, 200, {
      "X-Request-Id": requestId,
      "X-Pipeline-Duration-Ms": "0",
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "get_room_failed",
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(requestId, "INTERNAL", "Failed to load room", 500);
  }
});

app.post("/api/rooms/:roomId/join", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(requestId, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;

    const bodyUnknown = await c.req.json().catch(() => null);
    const bodyParse = joinRoomBodySchema.safeParse(bodyUnknown);
    if (!bodyParse.success) {
      return structuredError(
        requestId,
        "INVALID_BODY",
        bodyParse.error.message,
        400,
      );
    }
    const body = bodyParse.data;

    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(requestId, "NOT_FOUND", "Room not found", 404);
    }

    const participantId = crypto.randomUUID();
    await insertParticipant(c.env.DB, {
      id: participantId,
      roomId,
      displayName: body.displayName,
      sourceLang: body.sourceLang,
      targetLang: body.targetLang,
      joinedAt: Date.now(),
    });

    const url = new URL(c.req.url);
    const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${url.host}/api/rooms/${roomId}/ws?participantId=${encodeURIComponent(
      participantId,
    )}&displayName=${encodeURIComponent(body.displayName)}&sourceLang=${encodeURIComponent(
      body.sourceLang,
    )}&targetLang=${encodeURIComponent(body.targetLang)}`;

    console.log(
      JSON.stringify({
        level: "info",
        event: "participant_joined_api",
        roomId,
        participantId,
        requestId,
        durationMs: Date.now() - startedAt,
      }),
    );

    return c.json(
      { participantId, wsUrl },
      200,
      {
        "X-Request-Id": requestId,
        "X-Pipeline-Duration-Ms": "0",
      },
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "join_room_failed",
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(requestId, "INTERNAL", "Failed to join room", 500);
  }
});

app.get("/api/rooms/:roomId/ws", async (c) => {
  const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
  if (!roomIdParse.success) {
    return new Response("Invalid room id", { status: 400 });
  }
  const id = c.env.ROOM.idFromName(roomIdParse.data);
  const stub = c.env.ROOM.get(id);
  return stub.fetch(c.req.raw);
});

app.post("/api/rooms/:roomId/audio", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
  if (!roomIdParse.success) {
    return structuredError(requestId, "INVALID_ROOM", "Invalid room id", 400);
  }
  const roomId = roomIdParse.data;

  try {
    const bodyUnknown = await c.req.json().catch(() => null);
    const bodyParse = audioChunkBodySchema.safeParse(bodyUnknown);
    if (!bodyParse.success) {
      return structuredError(
        requestId,
        "INVALID_BODY",
        bodyParse.error.message,
        400,
      );
    }
    const body = bodyParse.data;
    if (body.roomId !== roomId) {
      return structuredError(requestId, "ROOM_MISMATCH", "roomId mismatch", 400);
    }

    let pcmBytes = 0;
    try {
      const bin = atob(body.pcmBase64);
      pcmBytes = bin.length;
    } catch {
      return structuredError(requestId, "INVALID_AUDIO", "Invalid base64", 400);
    }
    if (pcmBytes > MAX_AUDIO_CHUNK_BYTES) {
      return structuredError(requestId, "AUDIO_TOO_LARGE", "Audio chunk too large", 413);
    }

    const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
    const rateRes = await stub.fetch(
      new Request("http://do/internal/rate-limit-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: body.participantId }),
      }),
    );
    if (rateRes.status === 429) {
      return structuredError(
        requestId,
        "RATE_LIMIT",
        "Too many audio requests",
        429,
      );
    }

    const [targetLanguages, hints] = await Promise.all([
      getDistinctTargetLanguagesForRoom(c.env.DB, roomId),
      getParticipantTranscriptionHints(c.env.DB, roomId, body.participantId),
    ]);

    const chunk: AudioChunk = {
      participantId: body.participantId,
      roomId,
      pcmBase64: body.pcmBase64,
      sampleRateHz: body.sampleRateHz,
      sequenceNum: body.sequenceNum,
      timestampMs: body.timestampMs,
    };

    const onTranscriptReady = async (e: {
      transcript: string;
      sourceLang: Language;
    }): Promise<void> => {
      await stub.fetch(
        new Request("http://do/internal/broadcast-transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId: body.participantId,
            text: e.transcript,
            lang: e.sourceLang,
            ts: body.timestampMs,
          }),
        }),
      );
    };

    const pipelineStarted = Date.now();
    const result = await runAudioPipeline(chunk, c.env, {
      targetLanguages,
      spokenLanguageHint: hints?.sourceLang ?? undefined,
      whisperVocabHint: hints?.whisperVocabHint ?? null,
      onTranscriptReady,
    });
    const pipelineWallMs = Date.now() - pipelineStarted;

    await stub.fetch(
      new Request("http://do/broadcast-pipeline-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: body.participantId,
          pipelineResult: result,
        } satisfies { participantId: string; pipelineResult: PipelineResult }),
      }),
    );

    if (result.transcript.length > 0) {
      const safeText = sanitizeTranscriptText(result.transcript);
      const segId = crypto.randomUUID();
      await insertTranscriptSegment(c.env.DB, {
        id: segId,
        roomId,
        participantId: body.participantId,
        sourceText: safeText,
        sourceLanguage: result.sourceLang,
        startedAt: body.timestampMs,
        durationMs: result.durationMs,
      });
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "audio_pipeline_http",
        roomId,
        participantId: body.participantId,
        requestId,
        durationMs: Date.now() - startedAt,
      }),
    );

    return c.json(result, 200, {
      "X-Request-Id": requestId,
      "X-Pipeline-Duration-Ms": String(pipelineWallMs),
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "audio_route_failed",
        roomId,
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(
      requestId,
      "INTERNAL",
      "Audio pipeline request failed",
      500,
    );
  }
});

app.delete("/api/rooms/:roomId", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(requestId, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;

    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(requestId, "NOT_FOUND", "Room not found", 404);
    }

    await markRoomEnded(c.env.DB, roomId, Date.now());
    await c.env.SUMMARY_WORKFLOW.create({
      id: `summary-${roomId}-${crypto.randomUUID()}`,
      params: { roomId },
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "room_delete_summary_triggered",
        roomId,
        requestId,
        durationMs: Date.now() - startedAt,
      }),
    );

    return c.json(
      { success: true },
      200,
      {
        "X-Request-Id": requestId,
        "X-Pipeline-Duration-Ms": "0",
      },
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "delete_room_failed",
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(requestId, "INTERNAL", "Failed to end room", 500);
  }
});

app.notFound((c) => {
  const requestId = c.get("requestId");
  return structuredError(requestId, "NOT_FOUND", "Route not found", 404);
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    return Promise.resolve(app.fetch(request, env, ctx)).catch((e: unknown) => {
      const requestId = crypto.randomUUID();
      console.error(
        JSON.stringify({
          level: "error",
          event: "unhandled_fetch",
          requestId,
          message: String(e),
        }),
      );
      return structuredError(
        requestId,
        "INTERNAL",
        "Unhandled error",
        500,
      );
    });
  },
} satisfies ExportedHandler<Env>;
