-- Migration 003: shifts
-- Source: Stage 4 §4. cash_tips+card_tips>0 enforced at the validation layer, not here
-- (Stage 4's explicit reasoning: this rule may evolve and shouldn't require a migration to change).

CREATE TABLE IF NOT EXISTS shifts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date  TEXT NOT NULL,              -- plain date string YYYY-MM-DD, no time/timezone (Stage 9 §7)
  hours       REAL,
  cash_tips   REAL NOT NULL DEFAULT 0 CHECK (cash_tips >= 0),
  card_tips   REAL NOT NULL DEFAULT 0 CHECK (card_tips >= 0),
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shifts_user_date ON shifts (user_id, shift_date DESC);
