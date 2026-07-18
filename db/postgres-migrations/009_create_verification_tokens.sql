-- PostgreSQL migration 009: verification_tokens
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/009_create_verification_tokens.sql.

CREATE TABLE IF NOT EXISTS verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_user ON verification_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_hash ON verification_tokens (token_hash);
