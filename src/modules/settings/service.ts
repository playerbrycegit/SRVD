/**
 * Settings module. Account/preferences/privacy operations remain ownership-scoped.
 */
import { validateSettingsUpdate, ValidationError } from '../../shared-kernel/validation';
import { writeAudit } from '../../shared-kernel/audit';
import type { Database } from '../../shared-kernel/data-access';
import type { UserRow, SessionRow, ShiftRow, GoalRow, RecipeRow } from '../../shared-kernel/types';
import type { UserSettings, UpdateSettingsInput, SessionSummary, DataExport } from '../../shared-kernel/settings-types';

export class SettingsService {
  constructor(private readonly db: Database) {}

  getSettings(userId: string): UserSettings {
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw new ValidationError('Account not found', null);
    return {
      displayName: user.display_name,
      email: user.email,
      unitPreference: user.unit_preference,
      currencyPreference: user.currency_preference,
      emailVerified: Boolean(user.email_verified_at),
    };
  }

  updateSettings(userId: string, input: Partial<UpdateSettingsInput>): UserSettings {
    const v = validateSettingsUpdate(input);
    const fields: string[] = [];
    const params: unknown[] = [];
    if (v.displayName !== undefined) { fields.push('display_name = ?'); params.push(v.displayName); }
    if (v.unitPreference !== undefined) { fields.push('unit_preference = ?'); params.push(v.unitPreference); }
    if (v.currencyPreference !== undefined) { fields.push('currency_preference = ?'); params.push(v.currencyPreference); }
    if (fields.length === 0) return this.getSettings(userId);
    fields.push('updated_at = ?');
    params.push(Date.now(), userId);
    this.db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getSettings(userId);
  }

  listSessions(userId: string, currentSessionId: string | null): SessionSummary[] {
    const rows = this.db.all<SessionRow>(
      'SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((s) => ({
      id: s.id,
      deviceLabel: s.device_label,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      current: s.id === currentSessionId,
    }));
  }

  revokeSession(userId: string, sessionId: string): boolean {
    const result = this.db.run(
      'UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      [Date.now(), sessionId, userId]
    );
    return result.changes > 0;
  }

  revokeAllSessions(userId: string, exceptSessionId: string | null): number {
    const sql = exceptSessionId
      ? 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL'
      : 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL';
    const params = exceptSessionId ? [Date.now(), userId, exceptSessionId] : [Date.now(), userId];
    const result = this.db.run(sql, params);
    return result.changes;
  }

  /**
   * Personal data export. Every SELECT is scoped to the authenticated user and deliberately avoids
   * password hashes, session tokens, verification/reset tokens, provider secrets, and internal
   * abuse/risk metadata.
   */
  exportData(userId: string): DataExport {
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw new ValidationError('Account not found', null);
    const shifts = this.db.all<ShiftRow>('SELECT id, shift_date, hours, cash_tips, card_tips, notes, created_at FROM shifts WHERE user_id = ? ORDER BY shift_date DESC', [userId]);
    const goal = this.db.get<GoalRow>('SELECT id, target_amount, window_days, created_at FROM goals WHERE user_id = ?', [userId]) ?? null;
    const recipes = this.db.all<RecipeRow>('SELECT id, name, category, glassware, method, tasting_notes, created_at FROM recipes WHERE user_id = ?', [userId]);

    const venues = this.db.all('SELECT id, name, address, city, venue_type, employment_status, start_date, end_date, is_current, typical_schedule, notes, created_at FROM venues WHERE user_id = ? ORDER BY created_at', [userId]);
    const guests = this.db.all('SELECT id, first_name, last_name, display_name, phone, email, social_handle, birthday, anniversary, city, occupation, notes, first_met_at, first_met_venue_id, is_favorite, is_regular, is_vip, archived_at, created_at FROM guests WHERE user_id = ? ORDER BY created_at', [userId]);
    const visits = this.db.all('SELECT id, guest_id, venue_id, shift_id, visited_at, departure_at, seat_section, drinks, food, approximate_spend, approximate_tip, occasion, companions, notes, follow_up_at, created_at FROM visits WHERE user_id = ? ORDER BY visited_at', [userId]);
    const lists = this.db.all('SELECT id, name, description, list_type, rule_json, archived_at, created_at FROM guest_lists WHERE user_id = ? ORDER BY created_at', [userId]);
    const listMemberships = this.db.all('SELECT list_id, guest_id, created_at FROM guest_list_memberships WHERE user_id = ? ORDER BY created_at', [userId]);
    const consents = this.db.all('SELECT id, guest_id, consent_type, channel, status, source, language_version, granted_at, revoked_at, created_at FROM guest_consents WHERE user_id = ? ORDER BY created_at', [userId]);
    const followers = this.db.all('SELECT id, guest_id, followed_at, unfollowed_at, created_at FROM followers WHERE user_id = ? ORDER BY created_at', [userId]);
    const messageCampaigns = this.db.all('SELECT id, venue_id, name, channel, body, status, scheduled_at, sent_at, created_at FROM message_campaigns WHERE user_id = ? ORDER BY created_at', [userId]);
    const messageRecipients = this.db.all('SELECT campaign_id, guest_id, eligibility_status, delivery_status, failure_reason, created_at FROM message_recipients WHERE user_id = ? ORDER BY created_at', [userId]);

    writeAudit(this.db, { userId, action: 'data_exported', resourceType: 'users', resourceId: userId });

    return {
      exportedAt: Date.now(),
      profile: {
        id: user.id, email: user.email, displayName: user.display_name,
        unitPreference: user.unit_preference, currencyPreference: user.currency_preference,
        createdAt: user.created_at,
      },
      shifts, goal, recipes,
      connect: { venues, guests, visits, lists, listMemberships, consents, followers, messageCampaigns, messageRecipients },
    };
  }
}
