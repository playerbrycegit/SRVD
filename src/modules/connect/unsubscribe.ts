import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '../../shared-kernel/data-access';
import { ValidationError } from '../../shared-kernel/validation';
import type { MessageChannel } from './service';

interface UnsubscribeTokenRow {
  id: string;
  user_id: string;
  guest_id: string;
  channel: MessageChannel;
  token_hash: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class ConnectUnsubscribeService {
  constructor(private readonly db: Database) {}

  issue(userId: string, guestId: string, channel: MessageChannel, ttlDays = 90): string {
    const guest = this.db.get<{ id: string }>('SELECT id FROM guests WHERE id=? AND user_id=? AND archived_at IS NULL', [guestId, userId]);
    if (!guest) throw new ValidationError('Guest not found', 'guestId');
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    this.db.run(
      `INSERT INTO connect_unsubscribe_tokens (id,user_id,guest_id,channel,token_hash,created_at,expires_at,used_at)
       VALUES (?,?,?,?,?,?,?,NULL)`,
      [randomUUID(), userId, guestId, channel, hashToken(token), now, now + ttlDays * 86400000]
    );
    return token;
  }

  consume(rawToken: unknown): { unsubscribed: boolean; channel: MessageChannel | null } {
    if (typeof rawToken !== 'string' || rawToken.length < 32) throw new ValidationError('Invalid unsubscribe link', 'token');
    const now = Date.now();
    const row = this.db.get<UnsubscribeTokenRow>(
      'SELECT * FROM connect_unsubscribe_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?',
      [hashToken(rawToken), now]
    );
    if (!row) return { unsubscribed: false, channel: null };

    this.db.transaction(() => {
      this.db.run('UPDATE connect_unsubscribe_tokens SET used_at=? WHERE id=? AND used_at IS NULL', [now, row.id]);
      this.db.run(
        `UPDATE guest_consents SET status='revoked', revoked_at=?, updated_at=?
         WHERE user_id=? AND guest_id=? AND channel=? AND status='granted'`,
        [now, now, row.user_id, row.guest_id, row.channel]
      );
      const existing = this.db.get<{ id: string }>(
        'SELECT id FROM suppressions WHERE user_id=? AND guest_id=? AND channel=?',
        [row.user_id, row.guest_id, row.channel]
      );
      if (!existing) {
        this.db.run(
          'INSERT INTO suppressions (id,user_id,guest_id,channel,reason,created_at) VALUES (?,?,?,?,?,?)',
          [randomUUID(), row.user_id, row.guest_id, row.channel, 'guest_unsubscribe', now]
        );
      }
    });

    return { unsubscribed: true, channel: row.channel };
  }
}
