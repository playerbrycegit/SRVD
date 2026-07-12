-- Migration 010: alpha_invitations
-- Source: Private Alpha Operations prompt §2/§3. Controlled invitation system for a bounded
-- alpha cohort (5-15 participants per the prompt's own sizing). Single-use, expiring, revocable.

CREATE TABLE IF NOT EXISTS alpha_invitations (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  token_hash   TEXT NOT NULL,       -- hashed at rest, same pattern as sessions/verification tokens
  segment      TEXT,                -- e.g. 'new_bartender', 'craft', 'high_volume' (§1 cohort tracking)
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  accepted_at  INTEGER,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL  -- linked once accepted
);

CREATE INDEX IF NOT EXISTS idx_alpha_invitations_email ON alpha_invitations (email);
CREATE INDEX IF NOT EXISTS idx_alpha_invitations_token ON alpha_invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_alpha_invitations_status ON alpha_invitations (status);
