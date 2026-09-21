'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cooldownKey,
  getNewlyExpiredCooldowns,
  snapshotActiveCooldowns
} = require('../lib/cooldown-notify.js');

// --- cooldownKey -----------------------------------------------------------

test('cooldownKey produit une clé unique par couple compte/service', () => {
  assert.equal(cooldownKey('acc_1', 'claude'), 'acc_1::claude');
  assert.notEqual(cooldownKey('acc_1', 'claude'), cooldownKey('acc_1', 'chatgpt'));
  assert.notEqual(cooldownKey('acc_1', 'claude'), cooldownKey('acc_2', 'claude'));
});

// --- snapshotActiveCooldowns -----------------------------------------------

test('snapshotActiveCooldowns ne capture que les cooldowns actifs (> 0)', () => {
  const accounts = [
    { id: 'acc_1', cooldowns: { claude: Date.now() + 3600000, chatgpt: 0, gemini: Date.now() + 7200000 } },
    { id: 'acc_2', cooldowns: { claude: 0, grok: Date.now() + 1800000 } }
  ];
  const snap = snapshotActiveCooldowns(accounts);
  assert.equal(snap.length, 3); // claude+gemini (acc_1) + grok (acc_2)
  const keys = snap.map(e => e.key || cooldownKey(e.accId, e.svcId));
  // (le snapshot ne met pas `key`, on la calcule pour le test)
  assert.ok(snap.some(e => e.accId === 'acc_1' && e.svcId === 'claude'));
  assert.ok(snap.some(e => e.accId === 'acc_1' && e.svcId === 'gemini'));
  assert.ok(snap.some(e => e.accId === 'acc_2' && e.svcId === 'grok'));
});

test('snapshotActiveCooldowns renvoie un tableau vide sans comptes', () => {
  assert.deepEqual(snapshotActiveCooldowns([]), []);
  assert.deepEqual(snapshotActiveCooldowns(null), []);
});

// --- getNewlyExpiredCooldowns ----------------------------------------------

test('getNewlyExpiredCooldowns détecte un cooldown qui vient d expirer', () => {
  const now = Date.now();
  const previouslyActive = [
    { accId: 'acc_1', svcId: 'claude', endsAt: now - 1000 } // expiré il y a 1s
  ];
  // accounts : le cooldown est maintenant à 0 (le tick l'a effacé)
  const accounts = [{ id: 'acc_1', cooldowns: { claude: 0 } }];
  const expired = getNewlyExpiredCooldowns(accounts, previouslyActive, now);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].accId, 'acc_1');
  assert.equal(expired[0].svcId, 'claude');
});

test('getNewlyExpiredCooldowns ne notifie pas un cooldown encore actif', () => {
  const now = Date.now();
  const previouslyActive = [
    { accId: 'acc_1', svcId: 'claude', endsAt: now + 3600000 } // encore 1h
  ];
  const accounts = [{ id: 'acc_1', cooldowns: { claude: now + 3600000 } }];
  const expired = getNewlyExpiredCooldowns(accounts, previouslyActive, now);
  assert.equal(expired.length, 0);
});

test('getNewlyExpiredCooldowns ne renotifie pas un cooldown réactivé', () => {
  const now = Date.now();
  const previouslyActive = [
    { accId: 'acc_1', svcId: 'claude', endsAt: now - 1000 } // était expiré
  ];
  // Mais l'utilisateur a re-cliqué « Épuiser » : cooldown réactivé
  const accounts = [{ id: 'acc_1', cooldowns: { claude: now + 3600000 } }];
  const expired = getNewlyExpiredCooldowns(accounts, previouslyActive, now);
  assert.equal(expired.length, 0); // pas notifié : toujours actif
});

test('getNewlyExpiredCooldowns gère un snapshot précédent vide', () => {
  const accounts = [{ id: 'acc_1', cooldowns: { claude: 0 } }];
  assert.deepEqual(getNewlyExpiredCooldowns(accounts, [], Date.now()), []);
  assert.deepEqual(getNewlyExpiredCooldowns(accounts, null, Date.now()), []);
});

test('getNewlyExpiredCooldowns gère plusieurs expirations simultanées', () => {
  const now = Date.now();
  const previouslyActive = [
    { accId: 'acc_1', svcId: 'claude', endsAt: now - 500 },
    { accId: 'acc_1', svcId: 'gemini', endsAt: now - 200 },
    { accId: 'acc_2', svcId: 'grok', endsAt: now + 10000 } // encore actif
  ];
  const accounts = [
    { id: 'acc_1', cooldowns: { claude: 0, gemini: 0 } },
    { id: 'acc_2', cooldowns: { grok: now + 10000 } }
  ];
  const expired = getNewlyExpiredCooldowns(accounts, previouslyActive, now);
  assert.equal(expired.length, 2);
  assert.ok(expired.some(e => e.svcId === 'claude'));
  assert.ok(expired.some(e => e.svcId === 'gemini'));
});
