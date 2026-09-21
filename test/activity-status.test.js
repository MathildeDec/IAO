'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareAccountNames,
  getAccountActivityStatus,
  isTabIdle,
  isAccountAssignable,
  getAssignableAccounts
} = require('../lib/activity-status.js');

// --- compareAccountNames -----------------------------------------------

test('compareAccountNames trie "Compte 2" avant "Compte 10" (numérique, pas lexical)', () => {
  const names = ['Compte 10', 'Compte 2', 'Compte 1'];
  assert.deepEqual([...names].sort(compareAccountNames), ['Compte 1', 'Compte 2', 'Compte 10']);
});

test('compareAccountNames trie par ordre alphabétique simple', () => {
  const names = ['Zoé', 'Alice', 'Marc'];
  assert.deepEqual([...names].sort(compareAccountNames), ['Alice', 'Marc', 'Zoé']);
});

test('compareAccountNames ignore la casse (sensitivity: base)', () => {
  const names = ['bernard', 'Alice'];
  assert.deepEqual([...names].sort(compareAccountNames), ['Alice', 'bernard']);
});

test('compareAccountNames gère null/undefined sans planter', () => {
  assert.equal(compareAccountNames(null, undefined), 0);
  assert.equal(typeof compareAccountNames('Alice', null), 'number');
});

test('compareAccountNames est stable sur des noms identiques', () => {
  assert.equal(compareAccountNames('Compte perso', 'Compte perso'), 0);
});

// --- getAccountActivityStatus -------------------------------------------

test('getAccountActivityStatus renvoie "open" si un onglet est ouvert, peu importe lastUsedAt', () => {
  assert.equal(getAccountActivityStatus({ hasOpenTab: true, lastUsedAt: Date.now() }), 'open');
});

test('getAccountActivityStatus renvoie "idle" si jamais utilisé (lastUsedAt = 0)', () => {
  assert.equal(getAccountActivityStatus({ hasOpenTab: false, lastUsedAt: 0 }), 'idle');
});

test('getAccountActivityStatus renvoie "recent" sous le seuil de 5h', () => {
  const now = Date.now();
  const lastUsedAt = now - (4 * 60 * 60 * 1000); // 4h
  assert.equal(getAccountActivityStatus({ hasOpenTab: false, lastUsedAt, now }), 'recent');
});

test('getAccountActivityStatus renvoie "idle" au-delà du seuil de 5h', () => {
  const now = Date.now();
  const lastUsedAt = now - (6 * 60 * 60 * 1000); // 6h
  assert.equal(getAccountActivityStatus({ hasOpenTab: false, lastUsedAt, now }), 'idle');
});

test('getAccountActivityStatus respecte un thresholdHours personnalisé', () => {
  const now = Date.now();
  const lastUsedAt = now - (2 * 60 * 60 * 1000); // 2h
  assert.equal(getAccountActivityStatus({ hasOpenTab: false, lastUsedAt, now, thresholdHours: 1 }), 'idle');
  assert.equal(getAccountActivityStatus({ hasOpenTab: false, lastUsedAt, now, thresholdHours: 3 }), 'recent');
});

// --- isTabIdle -------------------------------------------------------------

test('isTabIdle renvoie false avant le seuil de 5 minutes', () => {
  const now = Date.now();
  assert.equal(isTabIdle(now - (2 * 60 * 1000), now), false);
});

test('isTabIdle renvoie true au-delà du seuil de 5 minutes', () => {
  const now = Date.now();
  assert.equal(isTabIdle(now - (6 * 60 * 1000), now), true);
});

test('isTabIdle renvoie false pour lastFocusAt = 0 (jamais focalisé)', () => {
  assert.equal(isTabIdle(0, Date.now()), false);
});

test('isTabIdle respecte un thresholdMinutes personnalisé', () => {
  const now = Date.now();
  const lastFocusAt = now - (90 * 1000); // 90s
  assert.equal(isTabIdle(lastFocusAt, now, 2), false);
  assert.equal(isTabIdle(lastFocusAt, now, 1), true);
});

// --- isAccountAssignable (lot 18/09/2026, point 6) -----------------------
// Les tâches ne peuvent être confiées qu'aux comptes verts (plus de 5h
// d'inactivité, pas d'onglet ouvert).

test('isAccountAssignable renvoie true pour un compte vert (plus de 5h, pas d\'onglet)', () => {
  const now = Date.now();
  const lastUsedAt = now - (6 * 60 * 60 * 1000); // 6h
  assert.equal(isAccountAssignable({ hasOpenTab: false, lastUsedAt }, now), true);
});

test('isAccountAssignable renvoie true pour un compte jamais utilisé (lastUsedAt = 0)', () => {
  assert.equal(isAccountAssignable({ hasOpenTab: false, lastUsedAt: 0 }, Date.now()), true);
});

test('isAccountAssignable renvoie false pour un compte avec onglet ouvert', () => {
  const now = Date.now();
  const lastUsedAt = now - (10 * 60 * 60 * 1000); // 10h
  assert.equal(isAccountAssignable({ hasOpenTab: true, lastUsedAt }, now), false);
});

test('isAccountAssignable renvoie false pour un compte rouge (moins de 5h)', () => {
  const now = Date.now();
  const lastUsedAt = now - (3 * 60 * 60 * 1000); // 3h
  assert.equal(isAccountAssignable({ hasOpenTab: false, lastUsedAt }, now), false);
});

test('isAccountAssignable renvoie true au seuil exact de 5h (limite inclusive)', () => {
  const now = Date.now();
  const lastUsedAt = now - (5 * 60 * 60 * 1000); // exactement 5h
  // À 5h exactement, le statut est "idle" (limite >= inclusive), donc assignable
  assert.equal(isAccountAssignable({ hasOpenTab: false, lastUsedAt }, now), true);
});

test('isAccountAssignable respecte un thresholdHours personnalisé', () => {
  const now = Date.now();
  const lastUsedAt = now - (2 * 60 * 60 * 1000); // 2h
  assert.equal(isAccountAssignable({ hasOpenTab: false, lastUsedAt, now, thresholdHours: 1 }), true);
  assert.equal(isAccountAssignable({ hasOpenTab: false, lastUsedAt, now, thresholdHours: 3 }), false);
});

test('isAccountAssignable gère null/undefined sans planter', () => {
  assert.equal(isAccountAssignable(null, Date.now()), false);
  assert.equal(isAccountAssignable(undefined, Date.now()), false);
});

// --- getAssignableAccounts (lot 18/09/2026, point 6) ---------------------

test('getAssignableAccounts filtre les comptes verts uniquement', () => {
  const now = Date.now();
  const accounts = [
    { id: 'a1', name: 'Compte vert', automation: { lastUsedAt: now - (6 * 60 * 60 * 1000) } },
    { id: 'a2', name: 'Compte récent', automation: { lastUsedAt: now - (2 * 60 * 60 * 1000) } },
    { id: 'a3', name: 'Compte jamais utilisé', automation: { lastUsedAt: 0 } }
  ];
  const openAccountIds = new Set(['a2']); // a2 a un onglet ouvert
  const assignable = getAssignableAccounts(accounts, openAccountIds, 5, now);
  assert.equal(assignable.length, 2, 'Deux comptes doivent être assignables (verts)');
  assert.deepEqual(assignable.map(a => a.id), ['a1', 'a3']);
});

test('getAssignableAccounts renvoie un tableau vide si aucun compte vert', () => {
  const now = Date.now();
  const accounts = [
    { id: 'a1', name: 'Récent', automation: { lastUsedAt: now - (1 * 60 * 60 * 1000) } }
  ];
  const openAccountIds = new Set();
  assert.equal(getAssignableAccounts(accounts, openAccountIds, 5, now).length, 0);
});

test('getAssignableAccounts gère un tableau vide', () => {
  assert.deepEqual(getAssignableAccounts([], new Set(), 5, Date.now()), []);
});
