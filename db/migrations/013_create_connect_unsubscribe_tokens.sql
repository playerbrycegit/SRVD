-- Migration 013: opaque one-click unsubscribe tokens for SERVD Connect email.
CREATE TABLE IF NOT EXISTS connect_unsubscribe_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_connect_unsubscribe_active
  ON connect_unsubscribe_tokens(token_hash, expires_at, used_at);
