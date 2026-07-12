'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { AuthService } = require('../dist/src/modules/auth/service');
const { AlphaService } = require('../dist/src/modules/alpha/service');
const { ValidationError, redactSensitivePatterns } = require('../dist/src/shared-kernel/validation');

function setup() {
  const db = createDb(':memory:');
  runMigrations(db);
  return { db, alpha: new AlphaService(db), auth: new AuthService(db) };
}

// ---------- Invitations ----------
test('invite: creates a pending invitation with a real token', () => {
  const { alpha } = setup();
  const result = alpha.inviteParticipant({ email: 'bartender@example.com', segment: 'craft' });
  assert.ok(result.token);
  assert.equal(result.email, 'bartender@example.com');
});

test('invite: accepting a valid invitation marks it accepted and links the user', () => {
  const { alpha, auth } = setup();
  const invite = alpha.inviteParticipant({ email: 'bartender@example.com' });
  const { id: userId } = auth.register({ email: 'bartender@example.com', password: 'password123' });
  const result = alpha.acceptInvitation({ token: invite.token, userId });
  assert.equal(result.accepted, true);
});

test('invite: a token cannot be accepted twice (single-use)', () => {
  const { alpha, auth } = setup();
  const invite = alpha.inviteParticipant({ email: 'bartender@example.com' });
  const { id: userId } = auth.register({ email: 'bartender@example.com', password: 'password123' });
  alpha.acceptInvitation({ token: invite.token, userId });
  assert.throws(() => alpha.acceptInvitation({ token: invite.token, userId }), /invalid, already used, or has expired/);
});

test('invite: an expired invitation is rejected', () => {
  const { db, alpha, auth } = setup();
  const invite = alpha.inviteParticipant({ email: 'bartender@example.com' });
  db.run('UPDATE alpha_invitations SET expires_at = ? WHERE id = ?', [Date.now() - 1000, invite.id]);
  const { id: userId } = auth.register({ email: 'bartender@example.com', password: 'password123' });
  assert.throws(() => alpha.acceptInvitation({ token: invite.token, userId }), /expired/);
});

test('invite: a bogus token is rejected', () => {
  const { alpha } = setup();
  assert.throws(() => alpha.acceptInvitation({ token: 'not-a-real-token', userId: 'x' }), ValidationError);
});

test('invite: revoking a pending invitation prevents it from being accepted', () => {
  const { alpha, auth } = setup();
  const invite = alpha.inviteParticipant({ email: 'bartender@example.com' });
  const revoked = alpha.revokeInvitation(invite.id);
  assert.equal(revoked, true);
  const { id: userId } = auth.register({ email: 'bartender@example.com', password: 'password123' });
  assert.throws(() => alpha.acceptInvitation({ token: invite.token, userId }));
});

test('invite: revoking an already-accepted invitation is a no-op (only pending invites can be revoked)', () => {
  const { alpha, auth } = setup();
  const invite = alpha.inviteParticipant({ email: 'bartender@example.com' });
  const { id: userId } = auth.register({ email: 'bartender@example.com', password: 'password123' });
  alpha.acceptInvitation({ token: invite.token, userId });
  assert.equal(alpha.revokeInvitation(invite.id), false);
});

test('invite: listInvitations reflects cohort status changes', () => {
  const { alpha } = setup();
  alpha.inviteParticipant({ email: 'a@example.com', segment: 'new' });
  alpha.inviteParticipant({ email: 'b@example.com', segment: 'craft' });
  const list = alpha.listInvitations();
  assert.equal(list.length, 2);
  assert.ok(list.every((i) => i.status === 'pending'));
});

// ---------- Feedback ----------
test('feedback: valid submission is stored', () => {
  const { alpha, auth } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  const result = alpha.submitFeedback(userId, {
    feedbackType: 'bug', severity: 'high', description: 'Batch calculator gave a wrong result',
    route: '/tools',
  });
  assert.ok(result.id);
});

test('feedback: invalid feedback type is rejected', () => {
  const { alpha, auth } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  assert.throws(() => alpha.submitFeedback(userId, { feedbackType: 'not-a-type', severity: 'low', description: 'x' }), ValidationError);
});

test('feedback: missing description is rejected', () => {
  const { alpha, auth } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  assert.throws(() => alpha.submitFeedback(userId, { feedbackType: 'bug', severity: 'low', description: '' }), ValidationError);
});

test('feedback: description over 2000 characters is rejected', () => {
  const { alpha, auth } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  const longText = 'x'.repeat(2001);
  assert.throws(() => alpha.submitFeedback(userId, { feedbackType: 'bug', severity: 'low', description: longText }), /too long/);
});

test('feedback: listMyFeedback is ownership-scoped', () => {
  const { alpha, auth } = setup();
  const { id: userOne } = auth.register({ email: 'a@example.com', password: 'password123' });
  const { id: userTwo } = auth.register({ email: 'b@example.com', password: 'password123' });
  alpha.submitFeedback(userOne, { feedbackType: 'bug', severity: 'low', description: 'issue A' });
  alpha.submitFeedback(userTwo, { feedbackType: 'bug', severity: 'low', description: 'issue B' });
  const userOneFeedback = alpha.listMyFeedback(userOne);
  assert.equal(userOneFeedback.length, 1);
  assert.equal(userOneFeedback[0].description, 'issue A');
});

// ---------- Sensitive-data redaction (§8's real technical safeguard) ----------
test('redaction: a 64-char hex string (matching our session/verification token format) is redacted', () => {
  const fakeToken = 'a'.repeat(64);
  assert.equal(redactSensitivePatterns(`my token was ${fakeToken} and it broke`), 'my token was [REDACTED-TOKEN] and it broke');
});

test('redaction: a scrypt salt:hash pair format is redacted', () => {
  const fakeHash = `${'a'.repeat(32)}:${'b'.repeat(128)}`;
  assert.equal(redactSensitivePatterns(`hash was ${fakeHash}`), 'hash was [REDACTED-CREDENTIAL]');
});

test('redaction: ordinary text is left untouched', () => {
  assert.equal(redactSensitivePatterns('the batch calculator rounded 2.333 to 2.33'), 'the batch calculator rounded 2.333 to 2.33');
});

test('feedback: a pasted token in the description is redacted before storage, not stored raw', () => {
  const { db, alpha, auth } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  const fakeToken = 'f'.repeat(64);
  const result = alpha.submitFeedback(userId, {
    feedbackType: 'bug', severity: 'critical',
    description: `I was logged in with token ${fakeToken} when this happened`,
  });
  const stored = db.get('SELECT description FROM feedback_submissions WHERE id = ?', [result.id]);
  assert.ok(!stored.description.includes(fakeToken));
  assert.match(stored.description, /\[REDACTED-TOKEN\]/);
});
