'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { AuthService } = require('../dist/src/modules/auth/service');
const { ConnectService } = require('../dist/src/modules/connect/service');

function setup() {
  const db = createDb(':memory:');
  runMigrations(db);
  const auth = new AuthService(db);
  const connect = new ConnectService(db);
  const userA = auth.register({ email: 'connect-a@example.com', password: 'password123' });
  const userB = auth.register({ email: 'connect-b@example.com', password: 'password123' });
  return { db, connect, userA, userB };
}

test('connect: creates venue and guest for owner', () => {
  const { connect, userA } = setup();
  const venue = connect.createVenue(userA.id, { name: 'Marora Lounge', city: 'Houston' });
  const guest = connect.createGuest(userA.id, { firstName: 'Jordan', lastName: 'Miles', firstMetVenueId: venue.id, isRegular: true });
  assert.equal(venue.name, 'Marora Lounge');
  assert.equal(guest.display_name, 'Jordan Miles');
  assert.equal(guest.is_regular, 1);
});

test('OWNERSHIP: another bartender cannot read a guest', () => {
  const { connect, userA, userB } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Private Regular' });
  assert.equal(connect.getGuest(userB.id, guest.id), null);
});

test('OWNERSHIP: another bartender cannot attach owner guest to list', () => {
  const { connect, userA, userB } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Private Regular' });
  const list = connect.createList(userB.id, { name: 'Favorites' });
  assert.equal(connect.addGuestToList(userB.id, list.id, guest.id), false);
  assert.equal(connect.listGuestsInList(userB.id, list.id).length, 0);
});

test('connect: logs visit and returns relationship timeline data', () => {
  const { connect, userA } = setup();
  const venue = connect.createVenue(userA.id, { name: 'Velvet Room' });
  const guest = connect.createGuest(userA.id, { displayName: 'Chris', isFavorite: true });
  const visit = connect.logVisit(userA.id, guest.id, { venueId: venue.id, drinks: 'Old Fashioned', occasion: 'Promotion' });
  const visits = connect.listVisits(userA.id, guest.id);
  assert.equal(visit.drinks, 'Old Fashioned');
  assert.equal(visits.length, 1);
  assert.equal(visits[0].occasion, 'Promotion');
});

test('connect: manual lists support Favorites-style grouping', () => {
  const { connect, userA } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Taylor', isFavorite: true });
  const list = connect.createList(userA.id, { name: 'Favorites' });
  assert.equal(connect.addGuestToList(userA.id, list.id, guest.id), true);
  assert.equal(connect.listGuestsInList(userA.id, list.id)[0].id, guest.id);
});

test('connect: smart favorites list updates from guest state', () => {
  const { connect, userA } = setup();
  const favorite = connect.createGuest(userA.id, { displayName: 'Favorite', isFavorite: true });
  connect.createGuest(userA.id, { displayName: 'Other' });
  const list = connect.createList(userA.id, { name: 'Smart Favorites', listType: 'smart', ruleJson: JSON.stringify({ type: 'favorites' }) });
  const guests = connect.listGuestsInList(userA.id, list.id);
  assert.deepEqual(guests.map((g) => g.id), [favorite.id]);
});

test('CONSENT: email recipient is not eligible without explicit consent', () => {
  const { connect, userA } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Morgan', email: 'morgan@example.com' });
  const eligibility = connect.recipientEligibility(userA.id, guest.id, 'email');
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.status, 'no_consent');
});

test('CONSENT: explicit grant makes recipient eligible', () => {
  const { connect, userA } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Morgan', email: 'morgan@example.com' });
  connect.setConsent(userA.id, guest.id, { channel: 'email', consentType: 'general_updates', status: 'granted', source: 'guest_signup' });
  const eligibility = connect.recipientEligibility(userA.id, guest.id, 'email');
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.status, 'eligible');
});

test('SUPPRESSION: revoked consent suppresses future sends', () => {
  const { connect, userA } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Morgan', email: 'morgan@example.com' });
  connect.setConsent(userA.id, guest.id, { channel: 'email', consentType: 'general_updates', status: 'granted', source: 'guest_signup' });
  connect.setConsent(userA.id, guest.id, { channel: 'email', consentType: 'general_updates', status: 'revoked', source: 'guest_unsubscribe' });
  const eligibility = connect.recipientEligibility(userA.id, guest.id, 'email');
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.status, 'suppressed');
});

test('SUPPRESSION: suppression cannot be bypassed by granting consent again', () => {
  const { connect, userA } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Morgan', phone: '+17135550000' });
  connect.setConsent(userA.id, guest.id, { channel: 'sms', consentType: 'general_updates', status: 'granted', source: 'guest_signup' });
  connect.suppress(userA.id, guest.id, 'sms', 'STOP');
  connect.setConsent(userA.id, guest.id, { channel: 'sms', consentType: 'general_updates', status: 'granted', source: 'manual_attempt' });
  const eligibility = connect.recipientEligibility(userA.id, guest.id, 'sms');
  assert.equal(eligibility.status, 'suppressed');
});

test('connect: archived guest cannot receive messages', () => {
  const { connect, userA } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Archived', email: 'archived@example.com' });
  connect.setConsent(userA.id, guest.id, { channel: 'email', status: 'granted', source: 'guest_signup' });
  assert.equal(connect.archiveGuest(userA.id, guest.id), true);
  assert.equal(connect.recipientEligibility(userA.id, guest.id, 'email').status, 'invalid_contact');
});

test('connect: preview deduplicates recipients and caps input', () => {
  const { connect, userA } = setup();
  const guest = connect.createGuest(userA.id, { displayName: 'Morgan', email: 'morgan@example.com' });
  connect.setConsent(userA.id, guest.id, { channel: 'email', status: 'granted', source: 'guest_signup' });
  const preview = connect.previewRecipients(userA.id, [guest.id, guest.id], 'email');
  assert.equal(preview.length, 1);
  assert.equal(preview[0].eligible, true);
});
