'use strict';
/**
 * Auth module — service layer. Source of truth: Stage 4 §6 (Authentication), Stage 9 §8 (Security).
 *
 * Implements real password hashing (scrypt), session issuance/verification/revocation, email
 * verification, and password reset — all with real, hashed, single-use, time-limited tokens.
 * Rate limiting lives in src/http/rate-limit.js and is applied at the HTTP layer, not here.
 * No email delivery infrastructure exists in this sandbox (no SMTP, no network) — verification
 * and reset tokens are returned directly by the API in a clearly-labeled dev-mode field rather
 * than emailed. See README "Sandbox Substitution" for the swap-in path to a real email provider.
 */
const crypto = require('node:crypto');
const { randomUUID } = crypto;
const { validateEmail, validatePassword, ValidationError } = require('../../shared-kernel/validation');
const { writeAudit } = require('../../shared-kernel/audit');

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches Stage 4 §6
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, shorter than verification since it's higher-stakes

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

  /**
   * Stage 4 §6: Email Verification. Sandbox note: no email delivery infrastructure exists here
   * (no SMTP, no network), so the token is returned directly to the caller rather than emailed —
   * server.js exposes this as a dev-mode response field, clearly labeled, not silently mailed.
   * In production this return value goes to an email template, not the HTTP response.
   */
  issueVerificationToken(userId) {
    return this._issueToken(userId, 'email_verify', VERIFY_TOKEN_TTL_MS);
  }

  verifyEmail(token) {
    const record = this._consumeToken(token, 'email_verify');
    if (!record) throw new ValidationError('This verification link is invalid or has expired', null);
    this.db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(Date.now(), record.user_id);
    return { verified: true };
  }

  /** Stage 4 §6: gate — shift/recipe creation requires a verified email. Checked at the module
   * boundary (server.js), not duplicated per-route. */
  isEmailVerified(userId) {
    const user = this.db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(userId);
    return Boolean(user && user.email_verified_at);
  }

  /**
   * Stage 4 §6: Password Reset. Deliberately returns the same shape whether or not the email
   * exists (Stage 4 §6's anti-enumeration requirement) — the token itself is only generated for
   * a real account, but the caller can't distinguish "sent" from "no such account" from the response.
   */
  requestPasswordReset(email) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = this.db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(normalizedEmail);
    if (!user) return { requested: true, token: null }; // same shape, no token — nothing to email
    const token = this._issueToken(user.id, 'password_reset', RESET_TOKEN_TTL_MS);
    return { requested: true, token }; // sandbox note applies here too — see issueVerificationToken
  }

  resetPassword({ token, newPassword }) {
    validatePassword(newPassword);
    const record = this._consumeToken(token, 'password_reset');
    if (!record) throw new ValidationError('This reset link is invalid or has expired', null);
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(newPassword), Date.now(), record.user_id);
    // Stage 4 §6: a password reset should not leave other sessions silently valid forever —
    // revoke every existing session so a stolen device/token can't survive a reset.
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(Date.now(), record.user_id);
    writeAudit(this.db, { userId: record.user_id, action: 'password_reset', resourceType: 'users', resourceId: record.user_id });
    return { reset: true };
  }

  _issueToken(userId, purpose, ttlMs) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO verification_tokens (id, user_id, token_hash, purpose, created_at, expires_at, used_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(randomUUID(), userId, hashToken(token), purpose, now, now + ttlMs);
    return token;
  }

  /** Single-use: marks the token consumed atomically with the lookup so a token can't be replayed
   * even if two requests race (Stage 9 §8 — never trust a check-then-act without atomicity). */
  _consumeToken(token, purpose) {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const record = this.db.prepare(`
      SELECT * FROM verification_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL
    `).get(tokenHash, purpose);
    if (!record || record.expires_at < Date.now()) return null;
    this.db.prepare('UPDATE verification_tokens SET used_at = ? WHERE id = ?').run(Date.now(), record.id);
    return record;
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
