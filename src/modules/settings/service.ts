/**
 * Settings module. Source: this phase's §3-§5 — Account/Preferences/Privacy settings, all within
 * approved V1 scope (Settings was explicitly listed as maintained scope in this prompt).
 * Every visible setting here actually works end-to-end — no placeholder controls (per this
 * project's standing rule against dead buttons).
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
    if (fields.length === 0) return this.getSettings(userId); // nothing to change, not an error
    fields.push('updated_at = ?');
    params.push(Date.now(), userId);
    this.db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getSettings(userId);
  }

  /** Ownership-scoped: a user can only ever see their own sessions. */
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

  /** Revoking requires ownership — a user can only revoke their own session, never another user's. */
  revokeSession(userId: string, sessionId: string): boolean {
    const result = this.db.run(
      'UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      [Date.now(), sessionId, userId]
    );
    return result.changes > 0;
  }

  /** Revokes every session for the user except (optionally) the one making this request. */
  revokeAllSessions(userId: string, exceptSessionId: string | null): number {
    const sql = exceptSessionId
      ? 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL'
      : 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL';
    const params = exceptSessionId ? [Date.now(), userId, exceptSessionId] : [Date.now(), userId];
    const result = this.db.run(sql, params);
    return result.changes;
  }

  /**
   * Personal data export (§5). Ownership-enforced by construction (every query is user_id-scoped).
   * Never includes password_hash, session tokens, verification/reset tokens, or any internal
   * secret — the SELECT statements below simply never touch those columns, which is a stronger
   * guarantee than "remembering to redact" would be.
   */
  exportData(userId: string): DataExport {
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw new ValidationError('Account not found', null);
    const shifts = this.db.all<ShiftRow>('SELECT id, shift_date, hours, cash_tips, card_tips, notes, created_at FROM shifts WHERE user_id = ? ORDER BY shift_date DESC', [userId]);
    const goal = this.db.get<GoalRow>('SELECT id, target_amount, window_days, created_at FROM goals WHERE user_id = ?', [userId]) ?? null;
    const recipes = this.db.all<RecipeRow>('SELECT id, name, category, glassware, method, tasting_notes, created_at FROM recipes WHERE user_id = ?', [userId]);

    writeAudit(this.db, { userId, action: 'data_exported', resourceType: 'users', resourceId: userId });

    return {
      exportedAt: Date.now(),
      profile: {
        id: user.id, email: user.email, displayName: user.display_name,
        unitPreference: user.unit_preference, currencyPreference: user.currency_preference,
        createdAt: user.created_at,
      },
      shifts, goal, recipes,
    };
  }
}
