'use strict';
/**
 * Shifts module. Source of truth: Stage 4 §4/§9, Stage 9 §2/§6.
 * Every query below is scoped by user_id — this is the structural ownership guarantee, not a
 * convention. No function in this file accepts a query that isn't scoped this way.
 */
const { randomUUID } = require('node:crypto');
const { validateShift, validateGoal } = require('../../shared-kernel/validation');
const { writeAudit } = require('../../shared-kernel/audit');

class ShiftsService {
  constructor(db) {
    this.db = db;
  }

  logShift(userId, input) {
    const v = validateShift(input);
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO shifts (id, user_id, shift_date, hours, cash_tips, card_tips, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, v.shift_date, v.hours, v.cash_tips, v.card_tips, input.notes || null, now, now);
    return this.getShift(userId, id);
  }

  /** Ownership-scoped by construction: user_id is always part of the WHERE clause. */
  getShift(userId, shiftId) {
    return this.db.prepare('SELECT * FROM shifts WHERE id = ? AND user_id = ?').get(shiftId, userId) || null;
  }

  listShifts(userId) {
    return this.db.prepare('SELECT * FROM shifts WHERE user_id = ? ORDER BY shift_date DESC, created_at DESC').all(userId);
  }

  deleteShift(userId, shiftId) {
    const result = this.db.prepare('DELETE FROM shifts WHERE id = ? AND user_id = ?').run(shiftId, userId);
    if (result.changes > 0) {
      writeAudit(this.db, { userId, action: 'shift_deleted', resourceType: 'shifts', resourceId: shiftId });
    }
    return result.changes > 0;
  }

  getStats(userId) {
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

  setGoal(userId, input) {
    const v = validateGoal(input);
    const now = Date.now();
    const existing = this.db.prepare('SELECT id FROM goals WHERE user_id = ?').get(userId);
    if (existing) {
      this.db.prepare('UPDATE goals SET target_amount = ?, updated_at = ? WHERE user_id = ?').run(v.target_amount, now, userId);
    } else {
      this.db.prepare(`
        INSERT INTO goals (id, user_id, target_amount, window_days, created_at, updated_at)
        VALUES (?, ?, ?, 7, ?, ?)
      `).run(randomUUID(), userId, v.target_amount, now, now);
    }
    return this.getGoal(userId);
  }

  getGoal(userId) {
    return this.db.prepare('SELECT * FROM goals WHERE user_id = ?').get(userId) || null;
  }

  /** 7-day rolling goal progress (Stage 3 §3). */
  getGoalProgress(userId) {
    const goal = this.getGoal(userId);
    if (!goal) return null;
    const windowStart = new Date(Date.now() - goal.window_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = this.db.prepare(
      'SELECT COALESCE(SUM(cash_tips + card_tips), 0) as total FROM shifts WHERE user_id = ? AND shift_date >= ?'
    ).get(userId, windowStart);
    return { target: goal.target_amount, current: rows.total, percent: Math.min(100, (rows.total / goal.target_amount) * 100) };
  }
}

module.exports = { ShiftsService };
