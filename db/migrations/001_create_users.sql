-- Migration 001: users
-- Source of truth: Master Project Blueprint (Stage 10) Section 6; Technical Architecture (Stage 4) Section 4.
-- Note: SQLite syntax used here as the sandbox substitute for Postgres (see foundation README
-- for the documented substitution). Types map directly: TEXT<->UUID/VARCHAR, REAL<->DECIMAL,
-- INTEGER<->TIMESTAMP (stored as unix epoch ms). No behavior depends on a Postgres-only feature.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,           -- UUID
  email           TEXT NOT NULL UNIQUE,       -- case-insensitive uniqueness enforced in application layer (Stage 4 §4)
  password_hash   TEXT NOT NULL,
  email_verified_at INTEGER,                  -- nullable, epoch ms
  display_name    TEXT,
  unit_preference TEXT NOT NULL DEFAULT 'oz' CHECK (unit_preference IN ('oz','ml')),
  currency_preference TEXT NOT NULL DEFAULT 'USD',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (email COLLATE NOCASE);
