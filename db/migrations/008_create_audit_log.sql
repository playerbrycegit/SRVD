-- Migration 008: audit_log
-- Source: Stage 4 §4/§18. Append-only. user_id is nullable so the record survives account deletion
-- (Stage 4's explicit reasoning: an audit trail of "an account was deleted" must outlive the account).

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL CHECK (action IN (
                  'account_created','account_deleted','password_changed','password_reset',
                  'recipe_deleted','shift_deleted','permission_denied','data_exported'
                )),
  resource_type TEXT,
  resource_id   TEXT,
  metadata      TEXT,          -- JSON-encoded, minimal (Stage 4 §4)
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
