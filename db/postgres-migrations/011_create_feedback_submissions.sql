-- PostgreSQL migration 011: feedback_submissions
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/011_create_feedback_submissions.sql. Real BOOLEAN used instead of SQLite's 0/1.

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
  contact_permission  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_submissions (feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_submissions (created_at);

-- ============================================================================
-- One-active-shift enforcement: NOT implemented in this migration set, because it doesn't exist
-- in the SQLite schema either. SRVD's approved V1 scope allows multiple shifts per user with
-- no "active shift" status concept. If that changes, it needs a new status column and a partial
-- unique index (CREATE UNIQUE INDEX ... WHERE status = 'active') - a real schema and product
-- change, not implemented here since it was never part of approved scope.
-- ============================================================================
