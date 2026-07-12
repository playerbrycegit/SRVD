/**
 * Alpha operations module, converted to strict TypeScript. Source: Private Alpha prompt §2/§3/§7/§8.
 */
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { validateEmail, validateFeedback, ValidationError } from '../../shared-kernel/validation';
import type { Database } from '../../shared-kernel/data-access';
import type { AlphaInvitationRow, FeedbackSubmissionRow, FeedbackInput } from '../../shared-kernel/types';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface InviteParticipantInput {
  email: string;
  segment?: string | null;
}

export interface InviteResult {
  id: string;
  email: string;
  token: string;
  expiresAt: number;
}

export interface AcceptInvitationInput {
  token: string;
  userId: string;
}

export class AlphaService {
  constructor(private readonly db: Database) {}

  inviteParticipant({ email, segment = null }: InviteParticipantInput): InviteResult {
    const normalizedEmail = validateEmail(email);
    const token = crypto.randomBytes(24).toString('hex');
    const id = randomUUID();
    const now = Date.now();
    this.db.run(
      `INSERT INTO alpha_invitations (id, email, token_hash, segment, status, created_at, expires_at, accepted_at, user_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)`,
      [id, normalizedEmail, hashToken(token), segment, now, now + INVITE_TTL_MS]
    );
    return { id, email: normalizedEmail, token, expiresAt: now + INVITE_TTL_MS };
  }

  acceptInvitation({ token, userId }: AcceptInvitationInput): { accepted: true; segment: string | null } {
    const tokenHash = hashToken(token);
    const invite = this.db.get<AlphaInvitationRow>(
      "SELECT * FROM alpha_invitations WHERE token_hash = ? AND status = 'pending'",
      [tokenHash]
    );
    if (!invite) throw new ValidationError('This invitation is invalid, already used, or has expired', null);
    if (invite.expires_at < Date.now()) {
      this.db.run("UPDATE alpha_invitations SET status = 'expired' WHERE id = ?", [invite.id]);
      throw new ValidationError('This invitation has expired', null);
    }
    this.db.run(
      "UPDATE alpha_invitations SET status = 'accepted', accepted_at = ?, user_id = ? WHERE id = ?",
      [Date.now(), userId, invite.id]
    );
    return { accepted: true, segment: invite.segment };
  }

  revokeInvitation(id: string): boolean {
    const result = this.db.run("UPDATE alpha_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'", [id]);
    return result.changes > 0;
  }

  listInvitations(): AlphaInvitationRow[] {
    return this.db.all<AlphaInvitationRow>('SELECT * FROM alpha_invitations ORDER BY created_at DESC');
  }

  submitFeedback(userId: string | null, input: Partial<FeedbackInput>): { id: string; submitted: true } {
    const v = validateFeedback(input);
    const id = randomUUID();
    const now = Date.now();
    this.db.run(
      `INSERT INTO feedback_submissions (
        id, user_id, feedback_type, affected_feature, severity, description,
        expected_behavior, actual_behavior, route, device_type, browser, operating_system,
        reproduction_steps, frequency, contact_permission, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, userId, v.feedbackType, v.affectedFeature, v.severity, v.description,
        v.expectedBehavior, v.actualBehavior, v.route, v.deviceType, v.browser, v.operatingSystem,
        v.reproductionSteps, v.frequency, v.contactPermission ? 1 : 0, now,
      ]
    );
    return { id, submitted: true };
  }

  listMyFeedback(userId: string): FeedbackSubmissionRow[] {
    return this.db.all<FeedbackSubmissionRow>('SELECT * FROM feedback_submissions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }
}
