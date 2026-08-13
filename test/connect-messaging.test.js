'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { AuthService } = require('../dist/src/modules/auth/service');
const { ConnectService } = require('../dist/src/modules/connect/service');
const { ConnectMessagingService } = require('../dist/src/modules/connect/messaging');
const { ConnectUnsubscribeService } = require('../dist/src/modules/connect/unsubscribe');

function setup() {
  const db = createDb(':memory:');
  runMigrations(db);
  const auth = new AuthService(db);
  const connect = new ConnectService(db);
  const user = auth.register({ email: 'messaging-owner@example.com', password: 'password123' });
  const sent = [];
  const email = {
    async send(message) {
      sent.push(message);
      return { delivered: true, providerMessageId: `fake-${sent.length}` };
    },
  };
  const messaging = new ConnectMessagingService(db, email, 'https://srvd.example', true);
  return { db, connect, user, sent, messaging };
}

test('messaging: kill switch blocks sends when disabled', async () => {
  const { db, connect, user } = setup();
  const guest = connect.createGuest(user.id, { displayName: 'Jordan', email: 'jordan@example.com' });
  connect.setConsent(user.id, guest.id, { channel: 'email', status: 'granted', source: 'guest_signup' });
  const disabled = new ConnectMessagingService(db, { send: async () => ({ delivered: true, providerMessageId: null }) }, 'https://srvd.example', false);
  await assert.rejects(() => disabled.sendEmailCampaign(user.id, {
    subject: 'Tonight', body: 'Come see me', guestIds: [guest.id], confirmed: true,
  }), /disabled/);
});

test('messaging: requires explicit send confirmation', async () => {
  const { connect, user, messaging } = setup();
  const guest = connect.createGuest(user.id, { displayName: 'Jordan', email: 'jordan@example.com' });
  connect.setConsent(user.id, guest.id, { channel: 'email', status: 'granted', source: 'guest_signup' });
  await assert.rejects(() => messaging.sendEmailCampaign(user.id, {
    subject: 'Tonight', body: 'Come see me', guestIds: [guest.id], confirmed: false,
  }), /Confirm/);
});

test('messaging: sends only to consented guests and records excluded recipients as skipped', async () => {
  const { db, connect, user, sent, messaging } = setup();
  const allowed = connect.createGuest(user.id, { firstName: 'Jordan', displayName: 'Jordan Miles', email: 'jordan@example.com' });
  const blocked = connect.createGuest(user.id, { displayName: 'No Consent', email: 'blocked@example.com' });
  connect.setConsent(user.id, allowed.id, { channel: 'email', consentType: 'general_updates', status: 'granted', source: 'guest_signup' });
  const result = await messaging.sendEmailCampaign(user.id, {
    subject: 'Friday at the bar', body: 'Hey {{first_name}}, come see me Friday.', guestIds: [allowed.id, blocked.id], confirmed: true,
  });
  assert.equal(result.selected, 2);
  assert.equal(result.eligible, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.excluded, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].textBody, /Hey Jordan/);
  assert.match(sent[0].textBody, /\/connect\/unsubscribe\?token=/);
  const recipientRows = db.all('SELECT guest_id, eligibility_status, delivery_status FROM message_recipients WHERE campaign_id=? ORDER BY guest_id', [result.campaignId]);
  assert.equal(recipientRows.length, 2);
  const blockedRow = recipientRows.find((r) => r.guest_id === blocked.id);
  assert.equal(blockedRow.eligibility_status, 'no_consent');
  assert.equal(blockedRow.delivery_status, 'skipped');
});

test('messaging: never exposes multiple recipients in one email', async () => {
  const { connect, user, sent, messaging } = setup();
  const a = connect.createGuest(user.id, { displayName: 'A', email: 'a@example.com' });
  const b = connect.createGuest(user.id, { displayName: 'B', email: 'b@example.com' });
  connect.setConsent(user.id, a.id, { channel: 'email', status: 'granted', source: 'guest_signup' });
  connect.setConsent(user.id, b.id, { channel: 'email', status: 'granted', source: 'guest_signup' });
  await messaging.sendEmailCampaign(user.id, { subject: 'Hi', body: 'Hello', guestIds: [a.id, b.id], confirmed: true });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to, 'a@example.com');
  assert.equal(sent[1].to, 'b@example.com');
});

test('unsubscribe: one-click token revokes consent and suppresses future sends', async () => {
  const { db, connect, user, sent, messaging } = setup();
  const guest = connect.createGuest(user.id, { displayName: 'Jordan', email: 'jordan@example.com' });
  connect.setConsent(user.id, guest.id, { channel: 'email', status: 'granted', source: 'guest_signup' });
  await messaging.sendEmailCampaign(user.id, { subject: 'Hi', body: 'Hello', guestIds: [guest.id], confirmed: true });
  const token = sent[0].textBody.match(/token=([a-f0-9]+)/)[1];
  const unsubscribe = new ConnectUnsubscribeService(db);
  const result = unsubscribe.consume(token);
  assert.equal(result.unsubscribed, true);
  assert.equal(result.channel, 'email');
  assert.equal(connect.recipientEligibility(user.id, guest.id, 'email').status, 'suppressed');
  assert.deepEqual(unsubscribe.consume(token), { unsubscribed: false, channel: null });
});

test('messaging: beta recipient limit rejects more than 25 selected guests', async () => {
  const { user, messaging } = setup();
  const ids = Array.from({ length: 26 }, (_, i) => `guest-${i}`);
  await assert.rejects(() => messaging.sendEmailCampaign(user.id, {
    subject: 'Hi', body: 'Hello', guestIds: ids, confirmed: true,
  }), /25/);
});
