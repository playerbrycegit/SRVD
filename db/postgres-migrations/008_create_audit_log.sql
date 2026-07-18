-- PostgreSQL migration 008: audit_log
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/008_create_audit_log.sql. JSONB used instead of SQLite's TEXT.

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
