CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  participant_count INTEGER DEFAULT 0,
  languages_used TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  display_name TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  left_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  source_text TEXT NOT NULL,
  source_language TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_segments_room_time ON transcript_segments(room_id, started_at);
