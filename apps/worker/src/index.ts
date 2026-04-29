import { customAlphabet } from "nanoid";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AudioChunk, Language } from "@babel-room/shared";
import { corsOriginCallback } from "./cors";
import {
  getDistinctTargetLanguagesForRoom,
  getParticipantTranscriptionHints,
  getRoomById,
  insertParticipant,
  insertRoom,
  insertTranscriptSegment,
  isParticipantInRoom,
  listParticipantsForRoom,
  markRoomEnded,
} from "./db";
import { MAX_AUDIO_CHUNK_BYTES } from "./constants";
import { runAudioPipeline } from "./pipeline";
import { sanitizeTranscriptText } from "./sanitize";
import {
  audioChunkBodySchema,
  devInjectTranslatedAudioBodySchema,
  devInjectTranscriptBodySchema,
  joinRoomBodySchema,
  roomIdParamSchema,
} from "./schemas";
import type { AppEnv } from "./middleware";
import { requestContextMiddleware, structuredError } from "./middleware";
export { RoomDO } from "./room";
export { PostCallSummaryWorkflow } from "./workflows";

const generateRoomId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

function devToolsEnabled(env: Env): boolean {
  return env.BABEL_DEV_TOOLS === "1";
}

function approxDecodedBase64Bytes(b64: string): number {
  const stripped = b64.replace(/=/g, "");
  return Math.ceil((stripped.length * 3) / 4);
}

function doInternalRequest(
  path: string,
  requestId: string,
  body?: unknown,
): Request {
  const headers: Record<string, string> = {
    "X-Request-Id": requestId,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return new Request(`http://do${path}`, {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const app = new Hono<AppEnv>();

app.use("*", requestContextMiddleware);

app.use(
  "*",
  cors((c) => ({
    origin: (origin) =>
      corsOriginCallback(c.env.ALLOWED_ORIGINS, origin ?? ""),
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })),
);

app.options("*", (c) => c.body(null, 204));

app.post("/api/rooms", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    let roomId = generateRoomId();
    let found = false;
    for (let i = 0; i < 12; i += 1) {
      const existing = await getRoomById(c.env.DB, roomId);
      if (!existing) {
        found = true;
        break;
      }
      roomId = generateRoomId();
    }
    if (!found) {
      return structuredError(
        c,
        "CAPACITY",
        "Could not generate a unique room id",
        503,
      );
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
    return structuredError(c, "INTERNAL", "Failed to create room", 500);
  }
});

app.get("/api/rooms/:roomId", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
    }
    const room = await getRoomById(c.env.DB, roomIdParse.data);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
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
    return structuredError(c, "INTERNAL", "Failed to load room", 500);
  }
});

app.get("/api/rooms/:roomId/summary", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;

    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
    }

    const key = `rooms/${roomId}/summary.json`;
    const obj = await c.env.TRANSCRIPTS.get(key);
    if (!obj) {
      return c.json({ status: "pending" as const }, 200, {
        "X-Request-Id": requestId,
        "X-Pipeline-Duration-Ms": "0",
      });
    }

    const text = await obj.text();
    const parsed = JSON.parse(text) as {
      roomId?: string;
      summary?: string;
      segmentCount?: number;
      generatedAt?: number;
    };

    return c.json(
      {
        status: "ready" as const,
        roomId: parsed.roomId ?? roomId,
        summary: parsed.summary ?? "",
        segmentCount: parsed.segmentCount ?? 0,
        generatedAt: parsed.generatedAt ?? 0,
      },
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
        event: "get_summary_failed",
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(c, "INTERNAL", "Failed to load summary", 500);
  }
});

app.post("/api/rooms/:roomId/join", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;

    const bodyUnknown = await c.req.json().catch(() => null);
    const bodyParse = joinRoomBodySchema.safeParse(bodyUnknown);
    if (!bodyParse.success) {
      return structuredError(
        c,
        "INVALID_BODY",
        bodyParse.error.message,
        400,
      );
    }
    const body = bodyParse.data;

    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
    }
    if (room.ended_at != null) {
      return structuredError(c, "ROOM_ENDED", "This room has ended", 410);
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
    )}&targetLang=${encodeURIComponent(body.targetLang)}&roomCreatedAt=${encodeURIComponent(
      String(room.created_at),
    )}`;

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
      { participantId, wsUrl, createdAt: room.created_at },
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
    return structuredError(c, "INTERNAL", "Failed to join room", 500);
  }
});

app.get("/api/rooms/:roomId/ws", async (c) => {
  const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
  if (!roomIdParse.success) {
    return new Response("Invalid room id", { status: 400 });
  }
  const roomId = roomIdParse.data;
  const room = await getRoomById(c.env.DB, roomId);
  if (!room) {
    return new Response("Room not found", { status: 404 });
  }
  if (room.ended_at != null) {
    return new Response("Room has ended", { status: 410 });
  }
  const id = c.env.ROOM.idFromName(roomId);
  const stub = c.env.ROOM.get(id);
  return stub.fetch(c.req.raw);
});

app.post("/api/rooms/:roomId/audio", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
  if (!roomIdParse.success) {
    return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
  }
  const roomId = roomIdParse.data;

  try {
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
    }
    if (room.ended_at != null) {
      return structuredError(c, "ROOM_ENDED", "This room has ended", 410);
    }

    const bodyUnknown = await c.req.json().catch(() => null);
    const bodyParse = audioChunkBodySchema.safeParse(bodyUnknown);
    if (!bodyParse.success) {
      return structuredError(
        c,
        "INVALID_BODY",
        bodyParse.error.message,
        400,
      );
    }
    const body = bodyParse.data;
    if (body.roomId !== roomId) {
      return structuredError(c, "ROOM_MISMATCH", "roomId mismatch", 400);
    }

    const pcmBytes = approxDecodedBase64Bytes(body.pcmBase64);
    if (pcmBytes > MAX_AUDIO_CHUNK_BYTES) {
      return structuredError(c, "AUDIO_TOO_LARGE", "Audio chunk too large", 413);
    }

    const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
    const rateRes = await stub.fetch(
      doInternalRequest("/internal/rate-limit-audio", requestId, {
        participantId: body.participantId,
      }),
    );
    if (rateRes.status === 429) {
      return structuredError(c, "RATE_LIMIT", "Too many audio requests", 429);
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

    const pipelineStarted = Date.now();
    const result = await runAudioPipeline(chunk, c.env, {
      targetLanguages,
      spokenLanguageHint: hints?.sourceLang ?? undefined,
      whisperVocabHint: hints?.whisperVocabHint ?? null,
    });
    const pipelineWallMs = Date.now() - pipelineStarted;

    let transcriptSegment:
      | {
          ts: number;
          sourceText: string;
          sourceLang: Language;
          translations: Record<string, string>;
        }
      | undefined;
    if (result.transcript.trim().length > 0) {
      const safeText = sanitizeTranscriptText(result.transcript);
      if (safeText.length > 0) {
        const translations: Record<string, string> = {};
        for (const [lang, text] of Object.entries(result.translations)) {
          const t = typeof text === "string" ? text.trim() : "";
          if (t.length > 0) translations[lang] = t;
        }
        // Ensure every listener language in the room has a caption string when it
        // matches the spoken language (passthrough); avoids empty maps on the wire.
        for (const lang of targetLanguages) {
          if (!translations[lang] && lang === result.sourceLang) {
            translations[lang] = safeText;
          }
        }
        transcriptSegment = {
          ts: body.timestampMs,
          sourceText: safeText,
          sourceLang: result.sourceLang,
          translations,
        };
      }
    }

    await stub.fetch(
      doInternalRequest("/broadcast-pipeline-result", requestId, {
        participantId: body.participantId,
        pipelineResult: result,
        transcriptSegment,
      }),
    );

    if (result.transcript.length > 0) {
      const safeText = sanitizeTranscriptText(result.transcript);
      if (safeText.length > 0) {
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
    return structuredError(c, "INTERNAL", "Audio pipeline request failed", 500);
  }
});

app.delete("/api/rooms/:roomId", async (c) => {
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;

    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
    }

    if (room.ended_at != null) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "room_delete_idempotent",
          roomId,
          requestId,
          durationMs: Date.now() - startedAt,
        }),
      );
      return c.json(
        { success: true, alreadyEnded: true },
        200,
        {
          "X-Request-Id": requestId,
          "X-Pipeline-Duration-Ms": "0",
        },
      );
    }

    await markRoomEnded(c.env.DB, roomId, Date.now());

    const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
    await stub.fetch(doInternalRequest("/internal/room-ended", requestId, {}));

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
      { success: true, alreadyEnded: false },
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
    return structuredError(c, "INTERNAL", "Failed to end room", 500);
  }
});

app.get("/api/rooms/:roomId/dev/participants", async (c) => {
  if (!devToolsEnabled(c.env)) {
    return structuredError(c, "NOT_FOUND", "Route not found", 404);
  }
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;
    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
    }
    const rows = await listParticipantsForRoom(c.env.DB, roomId);
    const participants = rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      sourceLang: r.source_language,
      targetLang: r.target_language,
      joinedAt: r.joined_at,
    }));
    return c.json({ participants }, 200, {
      "X-Request-Id": requestId,
      "X-Pipeline-Duration-Ms": "0",
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "dev_participants_failed",
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(c, "INTERNAL", "Failed to list participants", 500);
  }
});

app.post("/api/rooms/:roomId/dev/inject-transcript", async (c) => {
  if (!devToolsEnabled(c.env)) {
    return structuredError(c, "NOT_FOUND", "Route not found", 404);
  }
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;

    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
    }

    const bodyUnknown = await c.req.json().catch(() => null);
    const bodyParse = devInjectTranscriptBodySchema.safeParse(bodyUnknown);
    if (!bodyParse.success) {
      return structuredError(
        c,
        "INVALID_BODY",
        bodyParse.error.message,
        400,
      );
    }
    const { participantId, segments } = bodyParse.data;

    const ok = await isParticipantInRoom(c.env.DB, roomId, participantId);
    if (!ok) {
      return structuredError(c, "INVALID_PARTICIPANT", "Participant not in room", 400);
    }

    const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
    const now = Date.now();
    let injected = 0;
    for (const seg of segments) {
      const safeText = sanitizeTranscriptText(seg.sourceText);
      if (safeText.length === 0) continue;
      const segId = crypto.randomUUID();
      const ts = now + injected;
      injected += 1;
      const translations: Record<string, string> = {};
      if (seg.translations) {
        for (const [lang, text] of Object.entries(seg.translations)) {
          const t = text.trim();
          if (t.length > 0) translations[lang] = t;
        }
      }
      await insertTranscriptSegment(c.env.DB, {
        id: segId,
        roomId,
        participantId,
        sourceText: safeText,
        sourceLanguage: seg.sourceLang,
        startedAt: ts,
        durationMs: 0,
      });
      await stub.fetch(
        doInternalRequest("/internal/broadcast-transcript", requestId, {
          participantId,
          sourceText: safeText,
          sourceLang: seg.sourceLang,
          translations,
          ts,
        }),
      );
    }

    if (injected === 0) {
      return structuredError(
        c,
        "INVALID_BODY",
        "All segments were empty after sanitization",
        400,
      );
    }

    return c.json({ success: true, injected }, 200, {
      "X-Request-Id": requestId,
      "X-Pipeline-Duration-Ms": "0",
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "dev_inject_transcript_failed",
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(c, "INTERNAL", "Inject transcript failed", 500);
  }
});

app.post("/api/rooms/:roomId/dev/inject-translated-audio", async (c) => {
  if (!devToolsEnabled(c.env)) {
    return structuredError(c, "NOT_FOUND", "Route not found", 404);
  }
  const requestId = c.get("requestId");
  const startedAt = c.get("startedAt");
  try {
    const roomIdParse = roomIdParamSchema.safeParse(c.req.param("roomId"));
    if (!roomIdParse.success) {
      return structuredError(c, "INVALID_ROOM", "Invalid room id", 400);
    }
    const roomId = roomIdParse.data;

    const room = await getRoomById(c.env.DB, roomId);
    if (!room) {
      return structuredError(c, "NOT_FOUND", "Room not found", 404);
    }

    const bodyUnknown = await c.req.json().catch(() => null);
    const bodyParse = devInjectTranslatedAudioBodySchema.safeParse(bodyUnknown);
    if (!bodyParse.success) {
      return structuredError(
        c,
        "INVALID_BODY",
        bodyParse.error.message,
        400,
      );
    }
    const { targetParticipantId, audioB64, lang } = bodyParse.data;

    const inRoom = await isParticipantInRoom(
      c.env.DB,
      roomId,
      targetParticipantId,
    );
    if (!inRoom) {
      return structuredError(c, "INVALID_PARTICIPANT", "Participant not in room", 400);
    }

    const approxBytes = approxDecodedBase64Bytes(audioB64);
    if (approxBytes > MAX_AUDIO_CHUNK_BYTES) {
      return structuredError(c, "AUDIO_TOO_LARGE", "Audio payload too large", 413);
    }

    const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
    const res = await stub.fetch(
      doInternalRequest("/internal/dev-send-translated-audio", requestId, {
        targetParticipantId,
        audioB64,
        lang,
      }),
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as {
        reason?: string;
      } | null;
      if (res.status === 404 && j?.reason === "TARGET_OFFLINE") {
        return structuredError(
          c,
          "TARGET_OFFLINE",
          "Target participant has no active WebSocket",
          404,
        );
      }
      return structuredError(c, "INTERNAL", "Inject audio failed", 500);
    }

    return c.json({ success: true }, 200, {
      "X-Request-Id": requestId,
      "X-Pipeline-Duration-Ms": "0",
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "dev_inject_audio_failed",
        requestId,
        message: String(e),
        durationMs: Date.now() - startedAt,
      }),
    );
    return structuredError(c, "INTERNAL", "Inject audio failed", 500);
  }
});

app.notFound((c) => structuredError(c, "NOT_FOUND", "Route not found", 404));

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
      return Response.json(
        {
          error: {
            code: "INTERNAL",
            message: "Unhandled error",
            requestId,
          },
        },
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    });
  },
} satisfies ExportedHandler<Env>;
