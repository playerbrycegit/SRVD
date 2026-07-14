/**
 * Shifts module, converted to strict TypeScript. Source: Stage 4 §4/§9, Stage 9 §2/§6.
 * Every query is scoped by user_id — the structural ownership guarantee, not a convention.
 */
import { randomUUID } from 'node:crypto';
import { validateShift, validateGoal } from '../../shared-kernel/validation';
import { writeAudit } from '../../shared-kernel/audit';
import type { Database } from '../../shared-kernel/data-access';
import type { ShiftRow, ShiftInput, ShiftStats, GoalRow, GoalInput, GoalProgress } from '../../shared-kernel/types';

export class ShiftsService {
  constructor(private readonly db: Database) {}

  logShift(userId: string, input: Partial<ShiftInput>): ShiftRow {
    const v = validateShift(input);
    const id = randomUUID();
    const now = Date.now();
    this.db.run(
      `INSERT INTO shifts (id, user_id, shift_date, hours, cash_tips, card_tips, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, v.shift_date, v.hours, v.cash_tips, v.card_tips, input.notes ?? null, now, now]
    );
    const shift = this.getShift(userId, id);
    if (!shift) throw new Error('Shift insert succeeded but could not be read back — this should never happen');
    return shift;
  }

  /**
   * V1.1 Must-Have (approved decision package §10, "Edit Shift"). Reuses `validateShift` exactly
   * as-is — confirmed during Phase 1 review that it already operates correctly on a full
   * replacement of the editable fields, so no new validation logic was needed, matching the
   * decision package's stated assumption.
   */
  updateShift(userId: string, shiftId: string, input: Partial<ShiftInput>): ShiftRow | null {
    const existing = this.getShift(userId, shiftId);
    if (!existing) return null; // ownership-scoped: not found for this user, whether it exists for another user or not at all
    const v = validateShift(input);
    this.db.run(
      `UPDATE shifts SET shift_date = ?, hours = ?, cash_tips = ?, card_tips = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [v.shift_date, v.hours, v.cash_tips, v.card_tips, input.notes ?? existing.notes, Date.now(), shiftId, userId]
    );
    return this.getShift(userId, shiftId);
  }

  /** Ownership-scoped by construction: user_id is always part of the WHERE clause. */
  getShift(userId: string, shiftId: string): ShiftRow | null {
    return this.db.get<ShiftRow>('SELECT * FROM shifts WHERE id = ? AND user_id = ?', [shiftId, userId]) ?? null;
  }

  listShifts(userId: string): ShiftRow[] {
    return this.db.all<ShiftRow>('SELECT * FROM shifts WHERE user_id = ? ORDER BY shift_date DESC, created_at DESC', [userId]);
  }

  deleteShift(userId: string, shiftId: string): boolean {
    const result = this.db.run('DELETE FROM shifts WHERE id = ? AND user_id = ?', [shiftId, userId]);
    if (result.changes > 0) {
      writeAudit(this.db, { userId, action: 'shift_deleted', resourceType: 'shifts', resourceId: shiftId });
    }
    return result.changes > 0;
  }

  getStats(userId: string): ShiftStats {
    const shifts = this.listShifts(userId);
    const total = shifts.reduce((a, s) => a + s.cash_tips + s.card_tips, 0);
    const best = shifts.reduce((m, s) => Math.max(m, s.cash_tips + s.card_tips), 0);
    return {
      lifetimeTotal: total,
      avgPerShift: shifts.length ? total / shifts.length : 0,
      bestShift: best,
      shiftCount: shifts.length,
    };
  }

  setGoal(userId: string, input: Partial<GoalInput>): GoalRow {
    const v = validateGoal(input);
    const now = Date.now();
    const existing = this.db.get<{ id: string }>('SELECT id FROM goals WHERE user_id = ?', [userId]);
    if (existing) {
      this.db.run('UPDATE goals SET target_amount = ?, updated_at = ? WHERE user_id = ?', [v.target_amount, now, userId]);
    } else {
      this.db.run(
        `INSERT INTO goals (id, user_id, target_amount, window_days, created_at, updated_at)
         VALUES (?, ?, ?, 7, ?, ?)`,
        [randomUUID(), userId, v.target_amount, now, now]
      );
    }
    const goal = this.getGoal(userId);
    if (!goal) throw new Error('Goal upsert succeeded but could not be read back — this should never happen');
    return goal;
  }

  getGoal(userId: string): GoalRow | null {
    return this.db.get<GoalRow>('SELECT * FROM goals WHERE user_id = ?', [userId]) ?? null;
  }

  /** 7-day rolling goal progress (Stage 3 §3). */
  getGoalProgress(userId: string): GoalProgress | null {
    const goal = this.getGoal(userId);
    if (!goal) return null;
    const windowStart = new Date(Date.now() - goal.window_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = this.db.get<{ total: number }>(
      'SELECT COALESCE(SUM(cash_tips + card_tips), 0) as total FROM shifts WHERE user_id = ? AND shift_date >= ?',
      [userId, windowStart]
    );
    const total = row?.total ?? 0;
    return { target: goal.target_amount, current: total, percent: Math.min(100, (total / goal.target_amount) * 100) };
  }
}
