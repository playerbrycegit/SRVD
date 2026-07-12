-- ============================================================================
-- PostgreSQL migration set. Translated from db/migrations/*.sql (the SQLite originals still in
-- use for actual runtime — see src/shared-kernel/data-access.ts's header).
--
-- STATUS: written in correct PostgreSQL syntax, NEVER EXECUTED. No Postgres server exists in
-- this sandbox and no network access to install one. Do not treat the presence of this file as
-- evidence that "the application uses PostgreSQL successfully" (this migration's own completion
-- criterion) — that criterion is not met and cannot be verified here.
--
-- FIX APPLIED HERE THAT THE SQLITE VERSION DOES NOT HAVE: cash_tips, card_tips, and target_amount
-- use NUMERIC(10,2) instead of SQLite's REAL. Per Stage 4 §8 ("never persist financial values as
-- binary floating-point numbers") and the prior production audit's explicit finding that SQLite's
-- REAL type violates this rule today — Postgres NUMERIC is exact, and this is the moment to fix it.
-- ============================================================================

-- 001: users
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  email_verified_at     TIMESTAMPTZ,
  display_name          TEXT,
  unit_preference       TEXT NOT NULL DEFAULT 'oz' CHECK (unit_preference IN ('oz','ml')),
  currency_preference   TEXT NOT NULL DEFAULT 'USD',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- 002: sessions
CREATE TABLE IF NOT EXISTS sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash    TEXT NOT NULL,
  device_label          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  revoked_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- 003: shifts — NUMERIC currency fix applied here
CREATE TABLE IF NOT EXISTS shifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date   DATE NOT NULL,
  hours        NUMERIC(4,2),
  cash_tips    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cash_tips >= 0),
  card_tips    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (card_tips >= 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shifts_user_date ON shifts (user_id, shift_date DESC);

-- 004: goals — NUMERIC currency fix applied here
CREATE TABLE IF NOT EXISTS goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_amount  NUMERIC(10,2) NOT NULL CHECK (target_amount > 0),
  window_days    INTEGER NOT NULL DEFAULT 7,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 005: recipes
CREATE TABLE IF NOT EXISTS recipes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  category       TEXT NOT NULL CHECK (category IN ('Classic','Original','Stirred','Shaken','Built','Batch')),
  glassware      TEXT,
  method         TEXT,
  tasting_notes  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipes_user_created ON recipes (user_id, created_at DESC);
-- Optional enhancement over the SQLite version (not required for parity): full-text search index.
-- CREATE INDEX IF NOT EXISTS idx_recipes_name_fts ON recipes USING GIN (to_tsvector('english', name));

-- 006: recipe_ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL,
  amount           TEXT,
  unit             TEXT,
  ingredient_name  TEXT NOT NULL CHECK (length(ingredient_name) BETWEEN 1 AND 120)
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients (recipe_id);

-- 007: calculator_presets
CREATE TABLE IF NOT EXISTS calculator_presets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset_type  TEXT NOT NULL CHECK (preset_type IN ('batch','abv')),
  name         TEXT NOT NULL,
  payload      JSONB NOT NULL,  -- Postgres has a real JSON type; SQLite stored this as TEXT
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presets_user_type ON calculator_presets (user_id, preset_type);

-- 008: audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (action IN (
                   'account_created','account_deleted','password_changed','password_reset',
                   'recipe_deleted','shift_deleted','permission_denied','data_exported'
                 )),
  resource_type  TEXT,
  resource_id    TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);

-- 009: verification_tokens
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

-- 010: alpha_invitations
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

-- 011: feedback_submissions
CREATE TABLE IF NOT EXISTS feedback_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  feedback_type       TEXT NOT NULL CHECK (feedback_type IN
                         ('bug','confusing_experience','performance','calculation_concern',
                          'accessibility','feature_request','positive','other')),
  affected_feature    TEXT,
  severity            TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description         TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  expected_behavior   TEXT,
  actual_behavior     TEXT,
  route               TEXT,
  device_type         TEXT,
  browser             TEXT,
  operating_system    TEXT,
  reproduction_steps  TEXT,
  frequency           TEXT,
  contact_permission  BOOLEAN NOT NULL DEFAULT FALSE,  -- Postgres has a real boolean; SQLite used 0/1
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_submissions (feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_submissions (created_at);

-- ============================================================================
-- One-active-shift enforcement: NOT implemented above, because it doesn't exist in the SQLite
-- schema either — STATION's approved V1 scope allows multiple shifts per user (no "active" status
-- concept at all; a shift is just a completed record with a date and tip amounts). This migration
-- prompt's §5 asks to verify/implement "one active shift per user," which would require adding a
-- status column and a partial unique index (e.g. `CREATE UNIQUE INDEX ... WHERE status = 'active'`)
-- — that's a real schema and product change beyond what exists today, not a straight port. Not
-- implemented here since it wasn't asked for as new scope, only flagged as a discrepancy between
-- this prompt's assumptions and the actual current schema.
-- ============================================================================
