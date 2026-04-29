import type { Language } from "@babel-room/shared";
import { SUPPORTED_LANGUAGES } from "../constants";

export interface RoomRow {
  id: string;
  created_at: number;
  ended_at: number | null;
  participant_count: number;
}

export async function insertRoom(
  db: D1Database,
  id: string,
  createdAt: number,
): Promise<void> {
  await db
    .prepare(`INSERT INTO rooms (id, created_at) VALUES (?, ?)`)
    .bind(id, createdAt)
    .run();
}

export async function getRoomById(
  db: D1Database,
  roomId: string,
): Promise<RoomRow | null> {
  const row = await db
    .prepare(`SELECT * FROM rooms WHERE id = ?`)
    .bind(roomId)
    .first<RoomRow>();
  return row ?? null;
}

export async function markRoomEnded(
  db: D1Database,
  roomId: string,
  endedAt: number,
): Promise<void> {
  await db
    .prepare(`UPDATE rooms SET ended_at = ? WHERE id = ?`)
    .bind(endedAt, roomId)
    .run();
}

export async function insertParticipant(
  db: D1Database,
  args: {
    id: string;
    roomId: string;
    displayName: string;
    sourceLang: Language;
    targetLang: Language;
    joinedAt: number;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO participants (id, room_id, display_name, source_language, target_language, joined_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        args.id,
        args.roomId,
        args.displayName,
        args.sourceLang,
        args.targetLang,
        args.joinedAt,
      ),
    db
      .prepare(
        `UPDATE rooms SET participant_count = participant_count + 1 WHERE id = ?`,
      )
      .bind(args.roomId),
  ]);
}

export interface ParticipantTranscriptionHints {
  sourceLang: Language | null;
  /** Short line for Whisper `initial_prompt` (display name vocabulary). */
  whisperVocabHint: string | null;
}

export async function getParticipantTranscriptionHints(
  db: D1Database,
  roomId: string,
  participantId: string,
): Promise<ParticipantTranscriptionHints | null> {
  const row = await db
    .prepare(
      `SELECT source_language AS lang, display_name AS dn FROM participants
       WHERE id = ? AND room_id = ? AND left_at IS NULL`,
    )
    .bind(participantId, roomId)
    .first<{ lang: string; dn: string }>();
  if (!row) return null;
  const allow = new Set<string>(SUPPORTED_LANGUAGES);
  const sourceLang = allow.has(row.lang) ? (row.lang as Language) : null;
  const name = row.dn.replace(/\s+/g, " ").trim().slice(0, 80);
  const whisperVocabHint =
    name.length > 0 ? `Speaker names may include: ${name}.` : null;
  return { sourceLang, whisperVocabHint };
}

export async function getDistinctTargetLanguagesForRoom(
  db: D1Database,
  roomId: string,
): Promise<Language[]> {
  const result = await db
    .prepare(
      `SELECT DISTINCT target_language AS lang FROM participants
       WHERE room_id = ? AND left_at IS NULL`,
    )
    .bind(roomId)
    .all<{ lang: string }>();

  const allow = new Set<string>(SUPPORTED_LANGUAGES);
  const out: Language[] = [];
  for (const row of result.results ?? []) {
    const lang = row.lang;
    if (allow.has(lang)) out.push(lang as Language);
  }
  return out;
}

export interface ParticipantListRow {
  id: string;
  display_name: string;
  source_language: string;
  target_language: string;
  joined_at: number;
}

export async function listParticipantsForRoom(
  db: D1Database,
  roomId: string,
): Promise<ParticipantListRow[]> {
  const result = await db
    .prepare(
      `SELECT id, display_name, source_language, target_language, joined_at
       FROM participants WHERE room_id = ? AND left_at IS NULL
       ORDER BY joined_at ASC`,
    )
    .bind(roomId)
    .all<ParticipantListRow>();
  return result.results ?? [];
}

export async function isParticipantInRoom(
  db: D1Database,
  roomId: string,
  participantId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM participants WHERE id = ? AND room_id = ? AND left_at IS NULL`,
    )
    .bind(participantId, roomId)
    .first<{ ok: number }>();
  return row != null;
}

export async function insertTranscriptSegment(
  db: D1Database,
  args: {
    id: string;
    roomId: string;
    participantId: string;
    sourceText: string;
    sourceLanguage: Language;
    startedAt: number;
    durationMs: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO transcript_segments (id, room_id, participant_id, source_text, source_language, started_at, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      args.id,
      args.roomId,
      args.participantId,
      args.sourceText,
      args.sourceLanguage,
      args.startedAt,
      args.durationMs,
    )
    .run();
}

export async function markParticipantLeft(
  db: D1Database,
  participantId: string,
  leftAt: number,
): Promise<void> {
  const row = await db
    .prepare(`SELECT room_id FROM participants WHERE id = ? AND left_at IS NULL`)
    .bind(participantId)
    .first<{ room_id: string }>();
  if (!row) return;

  await db.batch([
    db
      .prepare(`UPDATE participants SET left_at = ? WHERE id = ?`)
      .bind(leftAt, participantId),
    db
      .prepare(
        `UPDATE rooms SET participant_count = CASE WHEN participant_count > 0 THEN participant_count - 1 ELSE 0 END WHERE id = ?`,
      )
      .bind(row.room_id),
  ]);
}
