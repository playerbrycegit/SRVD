/**
 * Auth module — service layer, converted to strict TypeScript. Source of truth: Stage 4 §6,
 * Stage 9 §8. Now depends on `Database` (data-access.ts) instead of node:sqlite directly.
 */
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { validateEmail, validatePassword, ValidationError } from '../../shared-kernel/validation';
import { writeAudit } from '../../shared-kernel/audit';
import type { Database } from '../../shared-kernel/data-access';
import type {
  UserRow, SessionRow, VerificationTokenRow, PublicUser, LoginResult, TokenPurpose,
} from '../../shared-kernel/types';

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches Stage 4 §6
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, shorter than verification since it's higher-stakes

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  deviceLabel?: string | null;
}

export interface DeleteAccountInput {
  userId: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface PasswordResetRequestResult {
  requested: true;
  token: string | null;
}

export class AuthService {
  constructor(private readonly db: Database) {}

  /** Stage 4 §6: Registration. Email uniqueness enforced by the DB's UNIQUE index (Stage 4 §4). */
  register({ email, password }: RegisterInput): PublicUser {
    const normalizedEmail = validateEmail(email);
    validatePassword(password);

    const existing = this.db.get<{ id: string }>('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [normalizedEmail]);
    if (existing) {
      // Register is a safe context to be specific (Stage 7's Login-vs-Register distinction) —
      // the user is actively choosing to create an account, not probing for valid emails.
      throw new ValidationError('An account with this email already exists', 'email');
    }

    const id = randomUUID();
    const now = Date.now();
    this.db.run(
      `INSERT INTO users (id, email, password_hash, email_verified_at, unit_preference, currency_preference, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'oz', 'USD', ?, ?)`,
      [id, normalizedEmail, hashPassword(password), now, now]
    );

    writeAudit(this.db, { userId: id, action: 'account_created', resourceType: 'users', resourceId: id });
    return { id, email: normalizedEmail };
  }

  /**
   * Stage 4 §6: Email Verification. Sandbox note: no email delivery infrastructure exists here,
   * so the token is returned directly to the caller rather than emailed — server.ts exposes this
   * as a dev-mode response field, clearly labeled, not silently mailed.
   */
  issueVerificationToken(userId: string): string {
    return this._issueToken(userId, 'email_verify', VERIFY_TOKEN_TTL_MS);
  }

  verifyEmail(token: string): { verified: true } {
    const record = this._consumeToken(token, 'email_verify');
    if (!record) throw new ValidationError('This verification link is invalid or has expired', null);
    this.db.run('UPDATE users SET email_verified_at = ? WHERE id = ?', [Date.now(), record.user_id]);
    return { verified: true };
  }

  /** Stage 4 §6: gate — shift/recipe creation requires a verified email. */
  isEmailVerified(userId: string): boolean {
    const user = this.db.get<{ email_verified_at: number | null }>('SELECT email_verified_at FROM users WHERE id = ?', [userId]);
    return Boolean(user && user.email_verified_at);
  }

  /** Stage 4 §6: Password Reset. Same response shape whether or not the email exists
   * (anti-enumeration) — the token itself is only generated for a real account. */
  requestPasswordReset(email: string): PasswordResetRequestResult {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = this.db.get<{ id: string }>('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [normalizedEmail]);
    if (!user) return { requested: true, token: null };
    const token = this._issueToken(user.id, 'password_reset', RESET_TOKEN_TTL_MS);
    return { requested: true, token };
  }

  resetPassword({ token, newPassword }: ResetPasswordInput): { reset: true } {
    validatePassword(newPassword);
    const record = this._consumeToken(token, 'password_reset');
    if (!record) throw new ValidationError('This reset link is invalid or has expired', null);
    this.db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(newPassword), Date.now(), record.user_id]);
    // Stage 4 §6: a password reset should not leave other sessions silently valid forever.
    this.db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [Date.now(), record.user_id]);
    writeAudit(this.db, { userId: record.user_id, action: 'password_reset', resourceType: 'users', resourceId: record.user_id });
    return { reset: true };
  }

  private _issueToken(userId: string, purpose: TokenPurpose, ttlMs: number): string {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    this.db.run(
      `INSERT INTO verification_tokens (id, user_id, token_hash, purpose, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [randomUUID(), userId, hashToken(token), purpose, now, now + ttlMs]
    );
    return token;
  }

  /** Single-use: marks the token consumed atomically with the lookup so a token can't be replayed. */
  private _consumeToken(token: string, purpose: TokenPurpose): VerificationTokenRow | undefined {
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    const record = this.db.get<VerificationTokenRow>(
      'SELECT * FROM verification_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL',
      [tokenHash, purpose]
    );
    if (!record || record.expires_at < Date.now()) return undefined;
    this.db.run('UPDATE verification_tokens SET used_at = ? WHERE id = ?', [Date.now(), record.id]);
    return record;
  }

  /** Stage 4 §6: Login. Deliberately vague error on failure (Stage 7's Login spec). */
  login({ email, password, deviceLabel = null }: LoginInput): LoginResult {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [normalizedEmail]);
    if (!user || !verifyPassword(password || '', user.password_hash)) {
      throw new ValidationError('Incorrect email or password', null);
    }
    const session = this._createSession(user.id, deviceLabel);
    return { user: { id: user.id, email: user.email }, token: session.token, expiresAt: session.expiresAt };
  }

  private _createSession(userId: string, deviceLabel: string | null): { token: string; expiresAt: number } {
    const token = issueSessionToken();
    const id = randomUUID();
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.db.run(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, device_label, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [id, userId, hashToken(token), deviceLabel, now, expiresAt]
    );
    return { token, expiresAt };
  }

  /** Verifies a bearer token, returns the authenticated userId or null. */
  verifySession(token: string): string | null {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = this.db.get<SessionRow>('SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL', [tokenHash]);
    if (!session) return null;
    if (session.expires_at < Date.now()) return null;
    return session.user_id;
  }

  /** Companion to verifySession, for the one caller (Settings' session list) that needs to know
   * *which* session a token belongs to, not just which user - kept separate rather than changing
   * the primary chokepoint's signature everywhere else depends on. */
  getSessionId(token: string): string | null {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = this.db.get<SessionRow>('SELECT id FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL', [tokenHash]);
    return session?.id ?? null;
  }

  /** Logout: revokes one session only, never all of a user's devices (Stage 4 §6 multi-device support). */
  logout(token: string): void {
    const tokenHash = hashToken(token);
    this.db.run('UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ?', [Date.now(), tokenHash]);
  }

  /** Stage 4 §6: Account deletion requires re-authentication immediately before the action. */
  deleteAccount({ userId, password }: DeleteAccountInput): void {
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw new ValidationError('Account not found', null);
    if (!verifyPassword(password || '', user.password_hash)) {
      throw new ValidationError('Incorrect password', 'password');
    }
    // Full cascade delete via FK ON DELETE CASCADE (Stage 4 §4/§5) — one statement, database-enforced.
    this.db.run('DELETE FROM users WHERE id = ?', [userId]);
    writeAudit(this.db, { userId: null, action: 'account_deleted', resourceType: 'users', resourceId: userId });
  }
}

export { hashPassword, verifyPassword };
