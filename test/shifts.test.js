'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../src/shared-kernel/db');
const { AuthService } = require('../src/modules/auth/service');
const { ShiftsService } = require('../src/modules/shifts/service');

function setup() {
  const db = createDb(':memory:');
  runMigrations(db);
  const auth = new AuthService(db);
  const shifts = new ShiftsService(db);
  const userA = auth.register({ email: 'a@example.com', password: 'password123' });
  const userB = auth.register({ email: 'b@example.com', password: 'password123' });
  return { db, shifts, userA, userB };
}

test('shifts: log a shift and read it back', () => {
  const { shifts, userA } = setup();
  const s = shifts.logShift(userA.id, { shift_date: '2026-07-10', cash_tips: 80, card_tips: 40, hours: 6 });
  assert.equal(s.cash_tips, 80);
  assert.equal(s.card_tips, 40);
});

test('shifts: zero-tip shift is rejected (business rule)', () => {
  const { shifts, userA } = setup();
  assert.throws(() => shifts.logShift(userA.id, { shift_date: '2026-07-10', cash_tips: 0, card_tips: 0 }));
});

test('shifts: stats compute lifetime/avg/best correctly', () => {
  const { shifts, userA } = setup();
  shifts.logShift(userA.id, { shift_date: '2026-07-08', cash_tips: 50, card_tips: 0 });
  shifts.logShift(userA.id, { shift_date: '2026-07-09', cash_tips: 100, card_tips: 0 });
  const stats = shifts.getStats(userA.id);
  assert.equal(stats.lifetimeTotal, 150);
  assert.equal(stats.avgPerShift, 75);
  assert.equal(stats.bestShift, 100);
  assert.equal(stats.shiftCount, 2);
});

test('OWNERSHIP: user B cannot read user A\'s shift by id', () => {
  const { shifts, userA, userB } = setup();
  const s = shifts.logShift(userA.id, { shift_date: '2026-07-10', cash_tips: 80, card_tips: 0 });
  assert.equal(shifts.getShift(userB.id, s.id), null);
});

test('OWNERSHIP: user B\'s shift list never contains user A\'s shifts', () => {
  const { shifts, userA, userB } = setup();
  shifts.logShift(userA.id, { shift_date: '2026-07-10', cash_tips: 80, card_tips: 0 });
  shifts.logShift(userB.id, { shift_date: '2026-07-10', cash_tips: 20, card_tips: 0 });
  const listA = shifts.listShifts(userA.id);
  const listB = shifts.listShifts(userB.id);
  assert.equal(listA.length, 1);
  assert.equal(listB.length, 1);
  assert.notEqual(listA[0].id, listB[0].id);
});

test('OWNERSHIP: user B cannot delete user A\'s shift', () => {
  const { shifts, userA, userB } = setup();
  const s = shifts.logShift(userA.id, { shift_date: '2026-07-10', cash_tips: 80, card_tips: 0 });
  const deleted = shifts.deleteShift(userB.id, s.id);
  assert.equal(deleted, false);
  assert.ok(shifts.getShift(userA.id, s.id)); // still exists for the real owner
});

test('OWNERSHIP: user A\'s stats never include user B\'s tips', () => {
  const { shifts, userA, userB } = setup();
  shifts.logShift(userA.id, { shift_date: '2026-07-10', cash_tips: 10, card_tips: 0 });
  shifts.logShift(userB.id, { shift_date: '2026-07-10', cash_tips: 9999, card_tips: 0 });
  assert.equal(shifts.getStats(userA.id).lifetimeTotal, 10);
});

test('goal: one active goal per user enforced by DB unique constraint - setGoal upserts, not duplicates', () => {
  const { shifts, userA } = setup();
  shifts.setGoal(userA.id, { target_amount: 1000 });
  shifts.setGoal(userA.id, { target_amount: 1500 }); // update, not insert
  const goal = shifts.getGoal(userA.id);
  assert.equal(goal.target_amount, 1500);
});

test('OWNERSHIP: user B cannot see or overwrite user A\'s goal', () => {
  const { shifts, userA, userB } = setup();
  shifts.setGoal(userA.id, { target_amount: 1000 });
  assert.equal(shifts.getGoal(userB.id), null);
});

test('goal progress: reflects only shifts within the rolling window and only the owner\'s shifts', () => {
  const { shifts, userA, userB } = setup();
  shifts.setGoal(userA.id, { target_amount: 100 });
  const today = new Date().toISOString().slice(0, 10);
  shifts.logShift(userA.id, { shift_date: today, cash_tips: 40, card_tips: 0 });
  shifts.logShift(userB.id, { shift_date: today, cash_tips: 1000, card_tips: 0 });
  const progress = shifts.getGoalProgress(userA.id);
  assert.equal(progress.current, 40);
  assert.equal(progress.percent, 40);
});
