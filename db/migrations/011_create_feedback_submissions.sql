-- Migration 011: feedback_submissions
-- Source: Private Alpha Operations prompt §7/§8. Explicitly excludes sensitive content
-- (passwords, tokens, exact tip amounts, private recipe text) per §8's requirement -
-- enforced at the validation layer (src/modules/alpha/service.js), not just documented here.

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
  feedback_type      TEXT NOT NULL CHECK (feedback_type IN
                        ('bug','confusing_experience','performance','calculation_concern',
                         'accessibility','feature_request','positive','other')),
  affected_feature   TEXT,
  severity           TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description        TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  expected_behavior  TEXT,
  actual_behavior    TEXT,
  route              TEXT,           -- captured automatically, not user-entered (§8)
  device_type        TEXT,
  browser            TEXT,
  operating_system   TEXT,
  reproduction_steps TEXT,
  frequency          TEXT,
  contact_permission INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback_submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_submissions (feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_submissions (created_at);
