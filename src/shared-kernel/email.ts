/**
 * Email service abstraction. Source: this phase's §1.
 *
 * HONESTY NOTE: this sandbox has no network access, so no real transactional email provider
 * (SendGrid/Postmark/SES/etc.) can be integrated or tested here. What follows is a real,
 * fully-typed interface plus a real, working `ConsoleEmailService` implementation suitable for
 * local development — and a documented, unexecuted `ProviderEmailService` shape for whoever wires
 * in a real provider in a networked environment. This mirrors the exact honesty pattern already
 * used for PostgreSQL (data-access.postgres.reference.ts) — a real seam, not a fabricated
 * integration.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<{ delivered: boolean; providerMessageId: string | null }>;
}

/**
 * Development implementation: logs the email instead of sending it. Never prints the raw
 * verification/reset token itself unless `allowDevTokenExposure` is true (env.ts) — this keeps
 * the "no token exposure in production" guarantee consistent even for this dev-only email path,
 * not just the API's devOnly field.
 */
export class ConsoleEmailService implements EmailService {
  constructor(private readonly allowDevTokenExposure: boolean) {}

  async send(message: EmailMessage): Promise<{ delivered: boolean; providerMessageId: string | null }> {
    const body = this.allowDevTokenExposure ? message.textBody : '[body redacted - allowDevTokenExposure is false]';
    // eslint-disable-next-line no-console
    console.log(`[email:dev] to=${message.to} subject="${message.subject}"\n${body}`);
    return Promise.resolve({ delivered: true, providerMessageId: null });
  }
}

/** Builds the verification email content. Plain-language, matches Stage 5 §19's content standards
 * (states what happened, states what to do, no marketing tone). */
export function buildVerificationEmail(toEmail: string, verificationUrl: string): EmailMessage {
  return {
    to: toEmail,
    subject: 'Verify your STATION account',
    textBody: `Verify your email to start using STATION: ${verificationUrl}\n\nThis link expires in 24 hours. If you didn't create this account, you can ignore this email.`,
    htmlBody: `<p>Verify your email to start using STATION.</p><p><a href="${verificationUrl}">Verify Email</a></p><p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>`,
  };
}

export function buildPasswordResetEmail(toEmail: string, resetUrl: string): EmailMessage {
  return {
    to: toEmail,
    subject: 'Reset your STATION password',
    textBody: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email — your password hasn't changed.`,
    htmlBody: `<p>Reset your password.</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email — your password hasn't changed.</p>`,
  };
}

/** §1: "security notification after password reset, where appropriate." Sent to confirm the
 * change happened, distinct from the reset email itself — lets the real owner notice if they
 * didn't request it. */
export function buildPasswordChangedEmail(toEmail: string): EmailMessage {
  return {
    to: toEmail,
    subject: 'Your STATION password was changed',
    textBody: 'Your password was just changed. If this was you, no action is needed. If you did not make this change, reset your password immediately and contact support.',
    htmlBody: '<p>Your password was just changed. If this was you, no action is needed. If you did not make this change, reset your password immediately and contact support.</p>',
  };
}

/**
 * ============================================================================
 * REFERENCE ONLY — not wired into the server, never executed. To complete: implement this class
 * against a real provider's SDK/HTTP API (needs network access this sandbox does not have), read
 * the API key from AppConfig (never hardcode it, never log it — env.ts already redacts config
 * logging), and swap ConsoleEmailService for this in scripts/dev-server.ts's production branch.
 * ============================================================================
 */
export class ProviderEmailService implements EmailService {
  constructor(_apiKey: string, _senderAddress: string) {
    throw new Error('ProviderEmailService is a reference stub - no email provider is integrated in this sandbox (no network access). See file header.');
  }
  send(_message: EmailMessage): Promise<{ delivered: boolean; providerMessageId: string | null }> {
    throw new Error('Not implemented - see class constructor.');
  }
}
