'use strict';
/**
 * Alpha operations module. Source: Private Alpha prompt §2 (cohort tracking), §3 (invitations),
 * §7/§8 (feedback). Single-use, expiring, revocable invitations - same hashed-token pattern as
 * sessions and verification tokens (Stage 4 §6), reused here rather than reinvented.
 */
const crypto = require('node:crypto');
const { randomUUID } = crypto;
const { validateEmail, validateFeedback, ValidationError } = require('../../shared-kernel/validation');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days - alpha invitations are time-boxed by design

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

class AlphaService {
  constructor(db) {
    this.db = db;
  }

  /** §3: unique, expiring, hashed-at-rest invitation. Returns the raw token to the caller only -
   * same devOnly-field pattern as verification tokens applies here (no email infra in this sandbox). */
  inviteParticipant({ email, segment = null }) {
    const normalizedEmail = validateEmail(email);
    const token = crypto.randomBytes(24).toString('hex');
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO alpha_invitations (id, email, token_hash, segment, status, created_at, expires_at, accepted_at, user_id)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)
    `).run(id, normalizedEmail, hashToken(token), segment, now, now + INVITE_TTL_MS);
    return { id, email: normalizedEmail, token, expiresAt: now + INVITE_TTL_MS };
  }

  /** §3: single-use - the status flip and lookup happen together so a token can't be accepted twice. */
  acceptInvitation({ token, userId }) {
    const tokenHash = hashToken(token);
    const invite = this.db.prepare(`
      SELECT * FROM alpha_invitations WHERE token_hash = ? AND status = 'pending'
    `).get(tokenHash);
    if (!invite) throw new ValidationError('This invitation is invalid, already used, or has expired', null);
    if (invite.expires_at < Date.now()) {
      this.db.prepare(`UPDATE alpha_invitations SET status = 'expired' WHERE id = ?`).run(invite.id);
      throw new ValidationError('This invitation has expired', null);
    }
    this.db.prepare(`
      UPDATE alpha_invitations SET status = 'accepted', accepted_at = ?, user_id = ? WHERE id = ?
    `).run(Date.now(), userId, invite.id);
    return { accepted: true, segment: invite.segment };
  }

  /** §3: revocation - a pending invite can be revoked before it's ever accepted. */
  revokeInvitation(id) {
    const result = this.db.prepare(`
      UPDATE alpha_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'
    `).run(id);
    return result.changes > 0;
  }

  /** §2: cohort tracking - admin-facing, not user-facing. Access control to this method itself is
   * the caller's responsibility (an admin-only route, not built here since no admin auth exists
   * yet - see completion report "Known Limitations"). */
  listInvitations() {
    return this.db.prepare('SELECT * FROM alpha_invitations ORDER BY created_at DESC').all();
  }

  /** §8: feedback submission. userId is nullable (unauthenticated feedback isn't supported by any
   * route today, but the schema doesn't assume it will always be authenticated-only). */
  submitFeedback(userId, input) {
    const v = validateFeedback(input);
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO feedback_submissions (
        id, user_id, feedback_type, affected_feature, severity, description,
        expected_behavior, actual_behavior, route, device_type, browser, operating_system,
        reproduction_steps, frequency, contact_permission, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, v.feedbackType, v.affectedFeature, v.severity, v.description,
      v.expectedBehavior, v.actualBehavior, v.route, v.deviceType, v.browser, v.operatingSystem,
      v.reproductionSteps, v.frequency, v.contactPermission ? 1 : 0, now
    );
    return { id, submitted: true };
  }

  /** Ownership-scoped: a user can only see their own submitted feedback (§8 privacy). */
  listMyFeedback(userId) {
    return this.db.prepare('SELECT * FROM feedback_submissions WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  }
}

module.exports = { AlphaService };
