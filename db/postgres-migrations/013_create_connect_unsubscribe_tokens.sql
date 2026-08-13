-- Migration 013: opaque one-click unsubscribe tokens for SERVD Connect email.
CREATE TABLE IF NOT EXISTS connect_unsubscribe_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_connect_unsubscribe_active
  ON connect_unsubscribe_tokens(token_hash, expires_at, used_at);
