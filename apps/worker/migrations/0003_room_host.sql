-- First participant to join becomes room host (end call + summary access).
ALTER TABLE rooms ADD COLUMN host_participant_id TEXT;
