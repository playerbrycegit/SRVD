/**
 * Email service abstraction. Source: this phase's §1.
 *
 * HONESTY NOTE: this sandbox has no network access to actually send an email or verify delivery.
 * What follows is a real, fully-typed interface, a real working `ConsoleEmailService` for local
 * dev, and a code-complete `ProviderEmailService` (Resend's REST API, via native `fetch`, no SDK
 * needed) that has never been executed against a live network or a real API key. "Written
 * correctly" and "verified to work" remain different claims - see ProviderEmailService's own
 * comment for exactly which one applies.
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
    subject: 'Verify your SRVD account',
    textBody: `Verify your email to start using SRVD: ${verificationUrl}\n\nThis link expires in 24 hours. If you didn't create this account, you can ignore this email.`,
    htmlBody: `<p>Verify your email to start using SRVD.</p><p><a href="${verificationUrl}">Verify Email</a></p><p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>`,
  };
}

export function buildPasswordResetEmail(toEmail: string, resetUrl: string): EmailMessage {
  return {
    to: toEmail,
    subject: 'Reset your SRVD password',
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
    subject: 'Your SRVD password was changed',
    textBody: 'Your password was just changed. If this was you, no action is needed. If you did not make this change, reset your password immediately and contact support.',
    htmlBody: '<p>Your password was just changed. If this was you, no action is needed. If you did not make this change, reset your password immediately and contact support.</p>',
  };
}

/**
 * ============================================================================
 * Real provider implementation, using Resend's REST API as the concrete choice (simple API,
 * no SDK required - built entirely on Node's native `fetch`, available since Node 18, so this
 * needs zero npm install to exist in code). Postmark/SendGrid/SES are equally valid choices;
 * swapping providers means changing this one class's request shape, nothing else in the app.
 *
 * HONESTY NOTE: this code is complete and, to the best of this implementation's knowledge,
 * correctly shaped against Resend's documented API contract - but it has never been executed
 * against a real network or a real API key, because this sandbox has neither. "Written correctly"
 * and "verified to work" are different claims; only the first is true here. The first real send
 * attempt (with a real RESEND_API_KEY) is this class's first real test.
 * ============================================================================
 */
export class ProviderEmailService implements EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly senderAddress: string
  ) {
    if (!apiKey) throw new Error('ProviderEmailService requires an API key');
    if (!senderAddress) throw new Error('ProviderEmailService requires a sender address');
  }

  async send(message: EmailMessage): Promise<{ delivered: boolean; providerMessageId: string | null }> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.senderAddress,
        to: [message.to],
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      }),
    });

    if (!response.ok) {
      // Stage 9 §9: never leak provider error detail (which could include account/billing info)
      // up through the application; log it server-side only, never in a client-facing response.
      const detail = await response.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[email:provider] send failed, status=${response.status}`, detail.slice(0, 500));
      return { delivered: false, providerMessageId: null };
    }

    const body = (await response.json()) as { id?: string };
    return { delivered: true, providerMessageId: body.id ?? null };
  }
}
