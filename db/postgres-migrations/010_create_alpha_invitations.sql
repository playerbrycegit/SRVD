-- PostgreSQL migration 010: alpha_invitations
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/010_create_alpha_invitations.sql.

CREATE TABLE IF NOT EXISTS alpha_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  segment      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_alpha_invitations_email ON alpha_invitations (email);
CREATE INDEX IF NOT EXISTS idx_alpha_invitations_token ON alpha_invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_alpha_invitations_status ON alpha_invitations (status);
