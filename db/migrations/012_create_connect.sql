-- Migration 012: SERVD Connect foundation (SQLite)
-- Bartender-owned guest relationships, visits, lists, consent, following, and messaging metadata.

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  venue_type TEXT,
  employment_status TEXT,
  start_date INTEGER,
  end_date INTEGER,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
  typical_schedule TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venues_user ON venues(user_id, is_current);

CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  social_handle TEXT,
  birthday INTEGER,
  anniversary INTEGER,
  city TEXT,
  occupation TEXT,
  notes TEXT,
  first_met_at INTEGER,
  first_met_venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  is_regular INTEGER NOT NULL DEFAULT 0 CHECK (is_regular IN (0,1)),
  is_vip INTEGER NOT NULL DEFAULT 0 CHECK (is_vip IN (0,1)),
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guests_user_name ON guests(user_id, display_name);
CREATE INDEX IF NOT EXISTS idx_guests_user_status ON guests(user_id, is_regular, is_favorite, is_vip);

CREATE TABLE IF NOT EXISTS guest_preferences (
  id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guest_id, preference_key)
);
CREATE INDEX IF NOT EXISTS idx_guest_preferences_guest ON guest_preferences(user_id, guest_id);

CREATE TABLE IF NOT EXISTS guest_tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS guest_tag_memberships (
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES guest_tags(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(guest_id, tag_id)
);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
  shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL,
  visited_at INTEGER NOT NULL,
  departure_at INTEGER,
  seat_section TEXT,
  drinks TEXT,
  food TEXT,
  approximate_spend REAL,
  approximate_tip REAL,
  occasion TEXT,
  companions TEXT,
  notes TEXT,
  follow_up_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_user_guest_date ON visits(user_id, guest_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_user_venue_date ON visits(user_id, venue_id, visited_at DESC);

CREATE TABLE IF NOT EXISTS guest_lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  list_type TEXT NOT NULL DEFAULT 'manual' CHECK (list_type IN ('manual','smart')),
  rule_json TEXT,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS guest_list_memberships (
  list_id TEXT NOT NULL REFERENCES guest_lists(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(list_id, guest_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_lists_user ON guest_lists(user_id, archived_at);

CREATE TABLE IF NOT EXISTS guest_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted','revoked')),
  source TEXT NOT NULL,
  language_version TEXT,
  granted_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, guest_id, consent_type, channel)
);
CREATE INDEX IF NOT EXISTS idx_guest_consents_eligibility ON guest_consents(user_id, guest_id, channel, status);

CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, guest_id, channel)
);

CREATE TABLE IF NOT EXISTS followers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  followed_at INTEGER NOT NULL,
  unfollowed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, guest_id)
);
CREATE INDEX IF NOT EXISTS idx_followers_user_active ON followers(user_id, unfollowed_at);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
  name TEXT,
  channel TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed')),
  scheduled_at INTEGER,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON message_campaigns(user_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS message_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES message_campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  eligibility_status TEXT NOT NULL CHECK (eligibility_status IN ('eligible','no_consent','suppressed','invalid_contact')),
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','delivered','failed','skipped')),
  provider_message_id TEXT,
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(campaign_id, guest_id)
);
CREATE INDEX IF NOT EXISTS idx_message_recipients_campaign ON message_recipients(campaign_id, eligibility_status, delivery_status);
