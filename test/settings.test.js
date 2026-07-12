'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { AuthService } = require('../dist/src/modules/auth/service');
const { SettingsService } = require('../dist/src/modules/settings/service');
const { ShiftsService } = require('../dist/src/modules/shifts/service');
const { RecipesService } = require('../dist/src/modules/recipes/service');
const { ValidationError } = require('../dist/src/shared-kernel/validation');

function setup() {
  const db = createDb(':memory:');
  runMigrations(db);
  return {
    db,
    auth: new AuthService(db),
    settings: new SettingsService(db),
    shifts: new ShiftsService(db),
    recipes: new RecipesService(db),
  };
}

// ---------- Preferences ----------
test('settings: default preferences match schema defaults', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  const s = settings.getSettings(userId);
  assert.equal(s.unitPreference, 'oz');
  assert.equal(s.currencyPreference, 'USD');
  assert.equal(s.emailVerified, false);
});

test('settings: updating unit preference persists', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  settings.updateSettings(userId, { unitPreference: 'ml' });
  assert.equal(settings.getSettings(userId).unitPreference, 'ml');
});

test('settings: updating currency persists', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  settings.updateSettings(userId, { currencyPreference: 'EUR' });
  assert.equal(settings.getSettings(userId).currencyPreference, 'EUR');
});

test('settings: invalid unit preference is rejected', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  assert.throws(() => settings.updateSettings(userId, { unitPreference: 'gallons' }), ValidationError);
});

test('settings: invalid currency code is rejected', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  assert.throws(() => settings.updateSettings(userId, { currencyPreference: 'dollars' }), ValidationError);
});

test('settings: display name over 80 characters is rejected', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  assert.throws(() => settings.updateSettings(userId, { displayName: 'x'.repeat(81) }), ValidationError);
});

test('settings: partial update only changes the given fields', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  settings.updateSettings(userId, { currencyPreference: 'GBP' });
  const s = settings.updateSettings(userId, { unitPreference: 'ml' });
  assert.equal(s.currencyPreference, 'GBP'); // unaffected by the second update
  assert.equal(s.unitPreference, 'ml');
});

// ---------- Sessions ----------
test('sessions: listing marks the current session correctly', () => {
  const { auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  const { token } = auth.login({ email: 'a@example.com', password: 'password123' });
  const currentId = auth.getSessionId(token);
  const list = settings.listSessions(userId, currentId);
  const current = list.find((s) => s.id === currentId);
  assert.equal(current.current, true);
});

test('sessions: revoking a session invalidates it for auth purposes', () => {
  const { auth, settings } = setup();
  auth.register({ email: 'a@example.com', password: 'password123' });
  const { token, user } = auth.login({ email: 'a@example.com', password: 'password123' });
  const sessionId = auth.getSessionId(token);
  settings.revokeSession(user.id, sessionId);
  assert.equal(auth.verifySession(token), null);
});

test('OWNERSHIP: a user cannot revoke another user\'s session', () => {
  const { auth, settings } = setup();
  auth.register({ email: 'a@example.com', password: 'password123' });
  auth.register({ email: 'b@example.com', password: 'password123' });
  const sessionA = auth.login({ email: 'a@example.com', password: 'password123' });
  const userB = auth.login({ email: 'b@example.com', password: 'password123' });
  const sessionIdA = auth.getSessionId(sessionA.token);
  const revoked = settings.revokeSession(userB.user.id, sessionIdA);
  assert.equal(revoked, false);
  assert.ok(auth.verifySession(sessionA.token)); // still valid - untouched
});

test('sessions: revokeAllSessions can preserve the current session', () => {
  const { auth, settings } = setup();
  auth.register({ email: 'a@example.com', password: 'password123' });
  const s1 = auth.login({ email: 'a@example.com', password: 'password123', deviceLabel: 'phone' });
  const s2 = auth.login({ email: 'a@example.com', password: 'password123', deviceLabel: 'laptop' });
  const currentId = auth.getSessionId(s2.token);
  const count = settings.revokeAllSessions(s2.user.id, currentId);
  assert.equal(count, 1); // only s1 revoked
  assert.equal(auth.verifySession(s1.token), null);
  assert.ok(auth.verifySession(s2.token)); // current session survives
});

// ---------- Data export ----------
test('export: includes shifts, goal, recipes, and profile - never includes password_hash', () => {
  const { auth, settings, shifts, recipes } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  shifts.logShift(userId, { shift_date: '2026-07-12', cash_tips: 50, card_tips: 20 });
  shifts.setGoal(userId, { target_amount: 500 });
  recipes.createRecipe(userId, { name: 'Test', category: 'Classic', ingredients: [{ ingredient_name: 'Gin' }] });

  const dataExport = settings.exportData(userId);
  assert.equal(dataExport.shifts.length, 1);
  assert.ok(dataExport.goal);
  assert.equal(dataExport.recipes.length, 1);
  assert.equal(dataExport.profile.email, 'a@example.com');
  assert.ok(!('password_hash' in dataExport.profile));
  assert.ok(!JSON.stringify(dataExport).includes('password_hash'));
});

test('OWNERSHIP: export never includes another user\'s data', () => {
  const { auth, settings, shifts } = setup();
  const { id: userA } = auth.register({ email: 'a@example.com', password: 'password123' });
  const { id: userB } = auth.register({ email: 'b@example.com', password: 'password123' });
  shifts.logShift(userA, { shift_date: '2026-07-12', cash_tips: 999, card_tips: 0 });
  const exportB = settings.exportData(userB);
  assert.equal(exportB.shifts.length, 0);
});

test('export: writes an audit_log entry (Stage 4 §18, data_exported action)', () => {
  const { db, auth, settings } = setup();
  const { id: userId } = auth.register({ email: 'a@example.com', password: 'password123' });
  settings.exportData(userId);
  const entry = db.get("SELECT * FROM audit_log WHERE action = 'data_exported' AND resource_id = ?", [userId]);
  assert.ok(entry);
});
