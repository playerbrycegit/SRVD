-- Migration 002: sessions
-- Source: Stage 4 §4. Refresh tokens stored hashed, never in plaintext (Stage 4 §6, Stage 9 §8).

CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash    TEXT NOT NULL,
  device_label          TEXT,
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  revoked_at            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
