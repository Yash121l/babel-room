import type {
  Language,
  Participant,
  PipelineResult,
  RoomClientMessage,
  RoomState,
  WSMessageType,
} from "@babel-room/shared";
import { DurableObject } from "cloudflare:workers";
import { AUDIO_RATE_MAX_PER_WINDOW, AUDIO_RATE_WINDOW_MS } from "./constants";
import { markParticipantLeft } from "./db/queries";

interface DoParticipantRow {
  participant_id: string;
  display_name: string;
  source_lang: string;
  target_lang: string;
  joined_at: number;
}

export class RoomDO extends DurableObject<Env> {
  private readonly participants = new Map<string, Participant>();
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS do_participants (
        participant_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        joined_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        created_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS audio_rate_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id TEXT NOT NULL,
        ts INTEGER NOT NULL
      )
    `);
    this.restoreParticipantsFromStorage();
  }

  private restoreParticipantsFromStorage(): void {
    const cursor = this.sql.exec(
      `SELECT participant_id, display_name, source_lang, target_lang, joined_at FROM do_participants`,
    );
    this.participants.clear();
    for (const row of cursor) {
      const r = row as unknown as DoParticipantRow;
      this.participants.set(r.participant_id, {
        id: r.participant_id,
        displayName: r.display_name,
        sourceLang: r.source_lang as Language,
        targetLang: r.target_lang as Language,
        joinedAt: r.joined_at,
      });
    }
  }

  private parseRoomIdFromRequest(request: Request): string | null {
    const url = new URL(request.url);
    const m = /^\/api\/rooms\/([^/]+)\//.exec(url.pathname + "/");
    return m?.[1] ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    const url = new URL(request.url);
    if (url.pathname === "/broadcast-pipeline-result") {
      return this.handlePipelineResult(request);
    }
    if (url.pathname === "/internal/broadcast-transcript") {
      return this.handleBroadcastTranscript(request);
    }
    if (url.pathname === "/internal/room-ended") {
      return this.handleRoomEnded(request);
    }
    if (url.pathname === "/internal/rate-limit-audio") {
      return this.handleRateLimitAudio(request);
    }
    if (url.pathname === "/internal/dev-send-translated-audio") {
      return this.handleDevSendTranslatedAudio(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleBroadcastTranscript(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    let body: {
      participantId?: string;
      sourceText?: string;
      sourceLang?: Language;
      translations?: Partial<Record<Language, string>>;
      ts?: number;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, reason: "INVALID_JSON" }, { status: 400 });
    }
    const sourceText = (body.sourceText ?? "").trim();
    if (!body.participantId || !sourceText || !body.sourceLang) {
      return Response.json({ ok: false, reason: "INVALID_BODY" }, { status: 400 });
    }

    const translations: Partial<Record<Language, string>> = {};
    const raw = body.translations ?? {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.trim().length > 0) {
        translations[k as Language] = v.trim();
      }
    }

    this.broadcast({
      type: "transcript_segment",
      participantId: body.participantId,
      sourceText,
      sourceLang: body.sourceLang,
      translations,
      ts: body.ts ?? Date.now(),
    });

    return Response.json({ ok: true });
  }

  private async handleDevSendTranslatedAudio(
    request: Request,
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    let body: {
      targetParticipantId?: string;
      audioB64?: string;
      lang?: Language;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, reason: "INVALID_JSON" }, { status: 400 });
    }
    const targetParticipantId = body.targetParticipantId;
    const audioB64 = body.audioB64;
    const lang = body.lang;
    if (!targetParticipantId || !audioB64 || !lang) {
      return Response.json({ ok: false, reason: "INVALID_BODY" }, { status: 400 });
    }

    const sockets = this.ctx.getWebSockets();
    const wsByParticipant = new Map<string, WebSocket>();
    for (const ws of sockets) {
      const tags = this.ctx.getTags(ws);
      const pid = tags[0];
      if (pid) wsByParticipant.set(pid, ws);
    }
    const ws = wsByParticipant.get(targetParticipantId);
    if (!ws) {
      return Response.json({ ok: false, reason: "TARGET_OFFLINE" }, { status: 404 });
    }

    this.sendToWebSocket(ws, {
      type: "translated_audio",
      targetParticipantId,
      audioB64,
      lang,
    });

    return Response.json({ ok: true });
  }

  private async handleRoomEnded(request: Request): Promise<Response> {
    void request;
    this.broadcast({ type: "room_ended" });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4001, "Room ended");
      } catch {
        /* ignore */
      }
    }
    return Response.json({ ok: true });
  }

  private async handleRateLimitAudio(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    let body: { participantId?: string };
    try {
      body = (await request.json()) as { participantId?: string };
    } catch {
      return Response.json({ ok: false, reason: "INVALID_JSON" }, { status: 400 });
    }
    const participantId = body.participantId;
    if (!participantId) {
      return Response.json({ ok: false, reason: "MISSING_PARTICIPANT" }, { status: 400 });
    }

    const now = Date.now();
    const windowStart = now - AUDIO_RATE_WINDOW_MS;
    this.sql.exec("DELETE FROM audio_rate_events WHERE ts < ?", now - 5000);

    let count = 0;
    for (const row of this.sql.exec(
      "SELECT 1 FROM audio_rate_events WHERE participant_id = ? AND ts > ?",
      participantId,
      windowStart,
    )) {
      void row;
      count += 1;
    }

    if (count >= AUDIO_RATE_MAX_PER_WINDOW) {
      return Response.json({ ok: false, reason: "RATE_LIMIT" }, { status: 429 });
    }

    this.sql.exec(
      "INSERT INTO audio_rate_events (participant_id, ts) VALUES (?, ?)",
      participantId,
      now,
    );

    return Response.json({ ok: true });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const participantId = url.searchParams.get("participantId");
    const displayName = url.searchParams.get("displayName");
    const sourceLang = url.searchParams.get("sourceLang") as Language | null;
    const targetLang = url.searchParams.get("targetLang") as Language | null;
    const roomCreatedAtRaw = url.searchParams.get("roomCreatedAt");
    const roomCreatedAt = Number(roomCreatedAtRaw);
    const createdAtMs =
      Number.isFinite(roomCreatedAt) && roomCreatedAt > 0
        ? Math.floor(roomCreatedAt)
        : Date.now();

    if (!participantId || !displayName || !sourceLang || !targetLang) {
      return new Response("Missing params", { status: 400 });
    }

    this.sql.exec(
      `INSERT OR IGNORE INTO room_meta (singleton, created_at) VALUES (1, ?)`,
      createdAtMs,
    );

    const [client, server] = Object.values(new WebSocketPair()) as [
      WebSocket,
      WebSocket,
    ];
    this.ctx.acceptWebSocket(server, [participantId]);

    const participant: Participant = {
      id: participantId,
      displayName,
      sourceLang,
      targetLang,
      joinedAt: Date.now(),
    };

    this.participants.set(participantId, participant);
    this.sql.exec(
      `INSERT OR REPLACE INTO do_participants (participant_id, display_name, source_lang, target_lang, joined_at)
       VALUES (?, ?, ?, ?, ?)`,
      participant.id,
      participant.displayName,
      participant.sourceLang,
      participant.targetLang,
      participant.joinedAt,
    );

    this.sendToWebSocket(server, { type: "room_state", state: this.getRoomState(request) });
    this.broadcast({ type: "participant_joined", participant }, participantId);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const participantId = tags[0];
    if (!participantId) return;

    try {
      const msg = JSON.parse(message as string) as RoomClientMessage | WSMessageType;
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" } satisfies WSMessageType));
        return;
      }
      if (msg.type === "webrtc_signal") {
        const to = msg.to;
        if (!to || to === participantId || !this.participants.has(to)) {
          return;
        }
        const sockets = this.ctx.getWebSockets();
        const wsByParticipant = new Map<string, WebSocket>();
        for (const s of sockets) {
          const t = this.ctx.getTags(s);
          const pid = t[0];
          if (pid) wsByParticipant.set(pid, s);
        }
        const targetWs = wsByParticipant.get(to);
        if (!targetWs) return;
        this.sendToWebSocket(targetWs, {
          type: "webrtc_signal",
          from: participantId,
          to,
          kind: msg.kind,
          sdp: msg.sdp,
          candidate: msg.candidate,
        });
        return;
      }
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "PARSE_ERROR",
          message: "Invalid JSON",
        } satisfies WSMessageType),
      );
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    void code;
    void reason;
    void wasClean;
    const tags = this.ctx.getTags(ws);
    const participantId = tags[0];
    if (!participantId) return;

    this.participants.delete(participantId);
    this.sql.exec(`DELETE FROM do_participants WHERE participant_id = ?`, participantId);

    try {
      await markParticipantLeft(this.env.DB, participantId, Date.now());
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "participant_left_d1_failed",
          participantId,
          message: String(e),
        }),
      );
    }

    this.broadcast({ type: "participant_left", participantId });
  }

  async webSocketError(ws: WebSocket, err: unknown): Promise<void> {
    void err;
    const tags = this.ctx.getTags(ws);
    const participantId = tags[0];
    if (!participantId) return;
    this.participants.delete(participantId);
    this.sql.exec(`DELETE FROM do_participants WHERE participant_id = ?`, participantId);
    try {
      await markParticipantLeft(this.env.DB, participantId, Date.now());
    } catch {
      /* ignore */
    }
    this.broadcast({ type: "participant_left", participantId });
  }

  private async handlePipelineResult(request: Request): Promise<Response> {
    let parsed: {
      participantId: string;
      pipelineResult: PipelineResult;
      transcriptSegment?: {
        ts: number;
        sourceText: string;
        sourceLang: Language;
        translations: Record<string, string>;
      };
    };
    try {
      parsed = (await request.json()) as typeof parsed;
    } catch {
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    }

    const { participantId, pipelineResult, transcriptSegment } = parsed;

    const sockets = this.ctx.getWebSockets();
    const wsByParticipant = new Map<string, WebSocket>();
    for (const ws of sockets) {
      const tags = this.ctx.getTags(ws);
      const pid = tags[0];
      if (pid) wsByParticipant.set(pid, ws);
    }

    for (const [pid, participant] of this.participants) {
      if (pid === participantId) continue;
      const targetLang = participant.targetLang;
      const audioB64 = pipelineResult.audioTracks[targetLang];
      if (!audioB64) continue;
      const ws = wsByParticipant.get(pid);
      if (!ws) continue;
      this.sendToWebSocket(ws, {
        type: "translated_audio",
        targetParticipantId: pid,
        audioB64,
        lang: targetLang,
      });
    }

    if (transcriptSegment) {
      const translations: Partial<Record<Language, string>> = {};
      for (const [k, v] of Object.entries(transcriptSegment.translations)) {
        if (typeof v === "string" && v.trim().length > 0) {
          translations[k as Language] = v.trim();
        }
      }
      this.broadcast({
        type: "transcript_segment",
        participantId,
        sourceText: transcriptSegment.sourceText,
        sourceLang: transcriptSegment.sourceLang,
        translations,
        ts: transcriptSegment.ts,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private broadcast(msg: WSMessageType, excludeId?: string): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      if (tags[0] === excludeId) continue;
      try {
        ws.send(payload);
      } catch {
        /* client disconnected */
      }
    }
  }

  private sendToWebSocket(ws: WebSocket, msg: WSMessageType): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  private getRoomCreatedAtMs(): number {
    for (const row of this.sql.exec(
      "SELECT created_at FROM room_meta WHERE singleton = 1",
    )) {
      const r = row as unknown as { created_at: number };
      const v = Number(r.created_at);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return Date.now();
  }

  private getRoomState(request: Request): RoomState {
    const durableName = this.ctx.id.name;
    const roomId =
      this.parseRoomIdFromRequest(request) ??
      (durableName && durableName.length > 0 ? durableName : this.ctx.id.toString());
    return {
      roomId,
      participants: Object.fromEntries(this.participants),
      createdAt: this.getRoomCreatedAtMs(),
      isActive: true,
    };
  }
}
