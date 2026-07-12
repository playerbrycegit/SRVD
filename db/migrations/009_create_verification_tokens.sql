-- Migration 009: verification_tokens
-- Source: Stage 4 §6 (Email Verification, Password Reset), implemented in the Phase 7
-- (Production Readiness) hardening pass. Additive migration - does not alter any existing table.
-- Single-use, time-limited, hashed at rest (never store the raw token, same pattern as sessions).

CREATE TABLE IF NOT EXISTS verification_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_user ON verification_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_hash ON verification_tokens (token_hash);
