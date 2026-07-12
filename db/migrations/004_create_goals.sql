-- Migration 004: goals
-- Source: Stage 4 §4. "One active goal per user" enforced at the DB level via UNIQUE(user_id) -
-- Stage 4's explicit reasoning: this rule is stable and central, so a DB constraint is appropriate here.

CREATE TABLE IF NOT EXISTS goals (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_amount REAL NOT NULL CHECK (target_amount > 0),
  window_days  INTEGER NOT NULL DEFAULT 7,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
