'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { AuthService } = require('../dist/src/modules/auth/service');
const { ValidationError } = require('../dist/src/shared-kernel/validation');

function freshDb() {
  const db = createDb(':memory:');
  runMigrations(db);
  return db;
}

test('register: creates a user and returns id+email', () => {
  const auth = new AuthService(freshDb());
  const result = auth.register({ email: 'Test@Example.com', password: 'password123' });
  assert.ok(result.id);
  assert.equal(result.email, 'test@example.com'); // normalized lowercase
});

test('register: duplicate email is rejected (case-insensitive)', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'password123' });
  assert.throws(() => auth.register({ email: 'TEST@EXAMPLE.COM', password: 'anotherpass' }), /already exists/);
});

test('register: password is never stored in plaintext', () => {
  const db = freshDb();
  const auth = new AuthService(db);
  auth.register({ email: 'test@example.com', password: 'password123' });
  const row = db.get('SELECT password_hash FROM users');
  assert.ok(!row.password_hash.includes('password123'));
  assert.match(row.password_hash, /^[a-f0-9]+:[a-f0-9]+$/); // salt:hash format
});

test('login: correct credentials succeed and issue a session token', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'password123' });
  const result = auth.login({ email: 'test@example.com', password: 'password123' });
  assert.ok(result.token);
  assert.ok(result.expiresAt > Date.now());
});

test('login: wrong password fails with a vague error (no enumeration signal)', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'password123' });
  assert.throws(() => auth.login({ email: 'test@example.com', password: 'wrongpassword' }), /Incorrect email or password/);
});

test('login: nonexistent email fails with the SAME error message as wrong password (Stage 7 anti-enumeration rule)', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'real@example.com', password: 'password123' });
  let errA, errB;
  try { auth.login({ email: 'doesnotexist@example.com', password: 'anything' }); } catch (e) { errA = e.message; }
  try { auth.login({ email: 'real@example.com', password: 'wrongpassword' }); } catch (e) { errB = e.message; }
  assert.equal(errA, errB);
});

test('session: a valid token verifies to the correct userId', () => {
  const auth = new AuthService(freshDb());
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  const { token } = auth.login({ email: 'test@example.com', password: 'password123' });
  assert.equal(auth.verifySession(token), id);
});

test('session: an invalid/random token verifies to null', () => {
  const auth = new AuthService(freshDb());
  assert.equal(auth.verifySession('not-a-real-token'), null);
});

test('session: a revoked token (logout) no longer verifies', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'password123' });
  const { token } = auth.login({ email: 'test@example.com', password: 'password123' });
  assert.ok(auth.verifySession(token));
  auth.logout(token);
  assert.equal(auth.verifySession(token), null);
});

test('session: multi-device — logging in twice creates two independently-revocable sessions', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'password123' });
  const s1 = auth.login({ email: 'test@example.com', password: 'password123', deviceLabel: 'iPhone' });
  const s2 = auth.login({ email: 'test@example.com', password: 'password123', deviceLabel: 'Desktop' });
  auth.logout(s1.token);
  assert.equal(auth.verifySession(s1.token), null);
  assert.ok(auth.verifySession(s2.token)); // second device unaffected (Stage 4 §6 multi-device support)
});

test('account deletion: requires correct password re-authentication', () => {
  const auth = new AuthService(freshDb());
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  assert.throws(() => auth.deleteAccount({ userId: id, password: 'wrongpassword' }), /Incorrect password/);
});

test('account deletion: cascades to sessions (foreign key ON DELETE CASCADE)', () => {
  const db = freshDb();
  const auth = new AuthService(db);
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  auth.login({ email: 'test@example.com', password: 'password123' });
  assert.equal(db.get('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?', [id]).c, 1);
  auth.deleteAccount({ userId: id, password: 'password123' });
  assert.equal(db.get('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?', [id]).c, 0);
  assert.equal(db.get('SELECT COUNT(*) as c FROM users WHERE id = ?', [id]).c, 0);
});

test('account deletion: writes an audit_log entry that survives the user row being gone (nullable FK)', () => {
  const db = freshDb();
  const auth = new AuthService(db);
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  auth.deleteAccount({ userId: id, password: 'password123' });
  const entry = db.get("SELECT * FROM audit_log WHERE action = 'account_deleted' AND resource_id = ?", [id]);
  assert.ok(entry, 'audit entry should exist even though the user row is gone');
  assert.equal(entry.user_id, null); // ON DELETE SET NULL per migration 008
});

test('validation: weak password rejected at registration', () => {
  const auth = new AuthService(freshDb());
  assert.throws(() => auth.register({ email: 'test@example.com', password: 'short' }), ValidationError);
});

test('validation: malformed email rejected at registration', () => {
  const auth = new AuthService(freshDb());
  assert.throws(() => auth.register({ email: 'not-an-email', password: 'password123' }), ValidationError);
});

test('verification: a fresh user is not verified by default', () => {
  const auth = new AuthService(freshDb());
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  assert.equal(auth.isEmailVerified(id), false);
});

test('verification: consuming a valid token marks the user verified', () => {
  const auth = new AuthService(freshDb());
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  const token = auth.issueVerificationToken(id);
  auth.verifyEmail(token);
  assert.equal(auth.isEmailVerified(id), true);
});

test('verification: an expired token is rejected', () => {
  const db = freshDb();
  const auth = new AuthService(db);
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  const token = auth.issueVerificationToken(id);
  // simulate expiry by backdating the row directly (no fake timers needed for this one check)
  db.run('UPDATE verification_tokens SET expires_at = ? WHERE user_id = ?', [Date.now() - 1000, id]);
  assert.throws(() => auth.verifyEmail(token), /invalid or has expired/);
});

test('verification: a token cannot be reused after being consumed', () => {
  const auth = new AuthService(freshDb());
  const { id } = auth.register({ email: 'test@example.com', password: 'password123' });
  const token = auth.issueVerificationToken(id);
  auth.verifyEmail(token);
  assert.throws(() => auth.verifyEmail(token), /invalid or has expired/);
});

test('password reset: request returns null token for a nonexistent email (anti-enumeration)', () => {
  const auth = new AuthService(freshDb());
  const result = auth.requestPasswordReset('ghost@example.com');
  assert.equal(result.token, null);
  assert.equal(result.requested, true); // same shape regardless
});

test('password reset: request returns a real token for a real account', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'password123' });
  const result = auth.requestPasswordReset('test@example.com');
  assert.ok(result.token);
});

test('password reset: resetting changes the password and old credentials stop working', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'oldpassword1' });
  const { token } = auth.requestPasswordReset('test@example.com');
  auth.resetPassword({ token, newPassword: 'newpassword1' });
  assert.throws(() => auth.login({ email: 'test@example.com', password: 'oldpassword1' }), /Incorrect email or password/);
  const result = auth.login({ email: 'test@example.com', password: 'newpassword1' });
  assert.ok(result.token);
});

test('password reset: rejects a weak new password', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'password123' });
  const { token } = auth.requestPasswordReset('test@example.com');
  assert.throws(() => auth.resetPassword({ token, newPassword: 'short' }), ValidationError);
});

test('password reset: revokes all existing sessions', () => {
  const auth = new AuthService(freshDb());
  auth.register({ email: 'test@example.com', password: 'oldpassword1' });
  const { token: sessionToken } = auth.login({ email: 'test@example.com', password: 'oldpassword1' });
  assert.ok(auth.verifySession(sessionToken));
  const { token: resetToken } = auth.requestPasswordReset('test@example.com');
  auth.resetPassword({ token: resetToken, newPassword: 'newpassword1' });
  assert.equal(auth.verifySession(sessionToken), null);
});
