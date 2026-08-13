import { randomUUID } from 'node:crypto';
import type { Database } from '../../shared-kernel/data-access';
import { ValidationError } from '../../shared-kernel/validation';
import type { EmailService } from '../../shared-kernel/email';
import { ConnectService } from './service';
import { ConnectUnsubscribeService } from './unsubscribe';

export interface SendEmailCampaignInput {
  subject?: unknown;
  body?: unknown;
  guestIds?: unknown;
  confirmed?: unknown;
  consentType?: unknown;
  venueId?: unknown;
}

export interface SendEmailCampaignResult {
  campaignId: string;
  selected: number;
  eligible: number;
  sent: number;
  failed: number;
  excluded: number;
  status: 'sent' | 'failed';
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} is required`, field);
  const text = value.trim();
  if (text.length > max) throw new ValidationError(`${field} must be ${max} characters or fewer`, field);
  return text;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] as string));
}

function personalize(template: string, guest: { first_name: string | null; display_name: string }): string {
  const firstName = guest.first_name || guest.display_name;
  return template
    .replaceAll('{{first_name}}', firstName)
    .replaceAll('{{display_name}}', guest.display_name);
}

export class ConnectMessagingService {
  private readonly connect: ConnectService;
  private readonly unsubscribe: ConnectUnsubscribeService;

  constructor(
    private readonly db: Database,
    private readonly email: EmailService,
    private readonly appUrl: string,
    private readonly sendingEnabled: boolean
  ) {
    this.connect = new ConnectService(db);
    this.unsubscribe = new ConnectUnsubscribeService(db);
  }

  async sendEmailCampaign(userId: string, input: SendEmailCampaignInput): Promise<SendEmailCampaignResult> {
    if (!this.sendingEnabled) throw new ValidationError('Connect email sending is disabled for this environment', null);
    if (input.confirmed !== true) throw new ValidationError('Confirm the recipient preview before sending', 'confirmed');

    const subject = requiredText(input.subject, 'subject', 120);
    const body = requiredText(input.body, 'body', 2000);
    const consentType = typeof input.consentType === 'string' && input.consentType.trim()
      ? input.consentType.trim().slice(0, 120)
      : 'general_updates';
    const guestIds = Array.isArray(input.guestIds)
      ? [...new Set(input.guestIds.filter((v): v is string => typeof v === 'string'))]
      : [];

    if (guestIds.length === 0) throw new ValidationError('Select at least one guest', 'guestIds');
    if (guestIds.length > 25) throw new ValidationError('Beta campaigns are limited to 25 selected guests', 'guestIds');

    const since = Date.now() - 86400000;
    const recent = this.db.get<{ total: number }>(
      "SELECT COUNT(*) AS total FROM message_campaigns WHERE user_id=? AND channel='email' AND created_at>=? AND status IN ('sending','sent')",
      [userId, since]
    );
    if ((recent?.total ?? 0) >= 3) throw new ValidationError('Beta limit reached: maximum 3 email campaigns per 24 hours', null);

    const venueId = typeof input.venueId === 'string' && input.venueId ? input.venueId : null;
    if (venueId && !this.connect.getVenue(userId, venueId)) throw new ValidationError('Venue not found', 'venueId');

    const preview = this.connect.previewRecipients(userId, guestIds, 'email', consentType);
    const eligible = preview.filter((r) => r.eligible);
    if (eligible.length === 0) throw new ValidationError('No selected guests are eligible to receive this email', null);

    const campaignId = randomUUID();
    const now = Date.now();
    this.db.run(
      `INSERT INTO message_campaigns (id,user_id,venue_id,name,channel,body,status,scheduled_at,sent_at,created_at,updated_at)
       VALUES (?,?,?,?,? ,?,'sending',NULL,NULL,?,?)`,
      [campaignId, userId, venueId, subject, 'email', body, now, now]
    );

    for (const item of preview) {
      this.db.run(
        `INSERT INTO message_recipients (id,campaign_id,user_id,guest_id,eligibility_status,delivery_status,provider_message_id,failure_reason,created_at,updated_at)
         VALUES (?,?,?,?,?,'pending',NULL,NULL,?,?)`,
        [randomUUID(), campaignId, userId, item.guestId, item.status, now, now]
      );
    }
    this.db.run(
      "UPDATE message_recipients SET delivery_status='skipped',updated_at=? WHERE campaign_id=? AND user_id=? AND eligibility_status!='eligible'",
      [Date.now(), campaignId, userId]
    );

    let sent = 0;
    let failed = 0;

    for (const item of eligible) {
      const guest = this.connect.getGuest(userId, item.guestId);
      if (!guest?.email) continue;
      const unsubscribeToken = this.unsubscribe.issue(userId, guest.id, 'email');
      const unsubscribeUrl = `${this.appUrl}/connect/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
      const personalizedBody = personalize(body, guest);
      const result = await this.email.send({
        to: guest.email,
        subject: personalize(subject, guest),
        textBody: `${personalizedBody}\n\nStop emails from this bartender: ${unsubscribeUrl}`,
        htmlBody: `<p>${escapeHtml(personalizedBody).replaceAll('\n', '<br>')}</p><p style="font-size:12px;color:#666"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from this bartender</a></p>`,
      });

      if (result.delivered) {
        sent += 1;
        this.db.run(
          `UPDATE message_recipients SET delivery_status='sent',provider_message_id=?,updated_at=?
           WHERE campaign_id=? AND user_id=? AND guest_id=?`,
          [result.providerMessageId, Date.now(), campaignId, userId, guest.id]
        );
      } else {
        failed += 1;
        this.db.run(
          `UPDATE message_recipients SET delivery_status='failed',failure_reason='provider_send_failed',updated_at=?
           WHERE campaign_id=? AND user_id=? AND guest_id=?`,
          [Date.now(), campaignId, userId, guest.id]
        );
      }
    }

    const status: 'sent' | 'failed' = sent > 0 ? 'sent' : 'failed';
    this.db.run(
      'UPDATE message_campaigns SET status=?,sent_at=?,updated_at=? WHERE id=? AND user_id=?',
      [status, status === 'sent' ? Date.now() : null, Date.now(), campaignId, userId]
    );

    return {
      campaignId,
      selected: preview.length,
      eligible: eligible.length,
      sent,
      failed,
      excluded: preview.length - eligible.length,
      status,
    };
  }
}
