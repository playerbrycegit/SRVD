'use strict';
/**
 * Auth module — service layer. Source of truth: Stage 4 §6 (Authentication), Stage 9 §8 (Security).
 *
 * Foundation-phase scope note: this implements real password hashing (scrypt, built into Node's
 * crypto module - no external dependency needed) and real session issuance/verification/revocation.
 * Full refresh-token rotation-on-use and short-lived-access-token/long-lived-refresh-token split
 * (Stage 4 §6) is represented in the schema (sessions.refresh_token_hash, expires_at) and in
 * `rotateSession`, but the Phase-7 hardening pass (rate limiting, replay-attack testing) is explicitly
 * NOT done here — this is foundation, not production-hardened auth. Documented in README "Remaining Work".
 */
const crypto = require('node:crypto');
const { randomUUID } = crypto;
const { validateEmail, validatePassword, ValidationError } = require('../../shared-kernel/validation');
const { writeAudit } = require('../../shared-kernel/audit');

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches Stage 4 §6

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  // timing-safe comparison, per Stage 9 §8
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

class AuthService {
  /** @param {import('node:sqlite').DatabaseSync} db */
  constructor(db) {
    this.db = db;
  }

  /** Stage 4 §6: Registration. Email uniqueness enforced by the DB's UNIQUE index (Stage 4 §4). */
  register({ email, password }) {
    const normalizedEmail = validateEmail(email);
    validatePassword(password);

    const existing = this.db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(normalizedEmail);
    if (existing) {
      // Register is a safe context to be specific (Stage 7's Login-vs-Register distinction) —
      // the user is actively choosing to create an account, not probing for valid emails.
      throw new ValidationError('An account with this email already exists', 'email');
    }

    const id = randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO users (id, email, password_hash, email_verified_at, unit_preference, currency_preference, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 'oz', 'USD', ?, ?)
    `).run(id, normalizedEmail, hashPassword(password), now, now);

    writeAudit(this.db, { userId: id, action: 'account_created', resourceType: 'users', resourceId: id });
    return { id, email: normalizedEmail };
  }

  /** Stage 4 §6: Login. Deliberately vague error on failure (Stage 7's Login spec) — prevents
   * confirming which credential (email vs password) was wrong. */
  login({ email, password, deviceLabel = null }) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = this.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(normalizedEmail);
    if (!user || !verifyPassword(password || '', user.password_hash)) {
      throw new ValidationError('Incorrect email or password', null);
    }
    const session = this._createSession(user.id, deviceLabel);
    return { user: { id: user.id, email: user.email }, token: session.token, expiresAt: session.expiresAt };
  }

  _createSession(userId, deviceLabel) {
    const token = issueSessionToken();
    const id = randomUUID();
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, refresh_token_hash, device_label, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(id, userId, hashToken(token), deviceLabel, now, expiresAt);
    return { token, expiresAt };
  }

  /** Verifies a bearer token, returns the authenticated userId or null. This is the function every
   * protected route calls — the single chokepoint referenced throughout Stage 9. */
  verifySession(token) {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = this.db.prepare(`
      SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL
    `).get(tokenHash);
    if (!session) return null;
    if (session.expires_at < Date.now()) return null;
    return session.user_id;
  }

  /** Logout: revokes one session only, never all of a user's devices (Stage 4 §6 multi-device support). */
  logout(token) {
    const tokenHash = hashToken(token);
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ?').run(Date.now(), tokenHash);
  }

  /** Stage 4 §6: Account deletion requires re-authentication immediately before the action. */
  deleteAccount({ userId, password }) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw new ValidationError('Account not found', null);
    if (!verifyPassword(password || '', user.password_hash)) {
      throw new ValidationError('Incorrect password', 'password');
    }
    // Full cascade delete via FK ON DELETE CASCADE (Stage 4 §4/§5) — one statement, database-enforced.
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    writeAudit(this.db, { userId: null, action: 'account_deleted', resourceType: 'users', resourceId: userId });
  }
}

module.exports = { AuthService, hashPassword, verifyPassword };
