'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { escapeHtml } = require('../lib/escape-html.js');
const { isAllowedPopup, ALLOWED_POPUP_HOSTS } = require('../lib/popup-guard.js');

// --- escapeHtml (chantier A) ------------------------------------------------

test('escapeHtml échappe les 5 caractères dangereux', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="a('b')">`),
    '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;'
  );
});

test('escapeHtml gère null/undefined sans planter', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml convertit les nombres/objets en chaîne', () => {
  assert.equal(escapeHtml(42), '42');
});

test('escapeHtml échappe le & en premier (pas de double échappement)', () => {
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});

test('escapeHtml laisse intact un texte sans caractère spécial', () => {
  assert.equal(escapeHtml('Compte perso'), 'Compte perso');
});

// --- isAllowedPopup (chantier B) --------------------------------------------

test('isAllowedPopup accepte un domaine exact de la liste', () => {
  assert.equal(isAllowedPopup('https://claude.ai/login'), true);
});

test('isAllowedPopup accepte un sous-domaine', () => {
  assert.equal(isAllowedPopup('https://accounts.google.com/o/oauth2'), true);
});

test('isAllowedPopup refuse un domaine hors liste', () => {
  assert.equal(isAllowedPopup('https://evil.example.com'), false);
});

test('isAllowedPopup refuse un domaine qui ne fait que CONTENIR un hôte autorisé', () => {
  // Piège classique : "claude.ai.evil.com" ne doit PAS matcher "claude.ai".
  assert.equal(isAllowedPopup('https://claude.ai.evil.com'), false);
});

test('isAllowedPopup refuse une URL non parsable', () => {
  assert.equal(isAllowedPopup('not a url'), false);
  assert.equal(isAllowedPopup('javascript:alert(1)'), false);
});

test('ALLOWED_POPUP_HOSTS couvre bien les 9 services', () => {
  const services = [
    'claude.ai', 'chatgpt.com', 'gemini.google.com', 'z.ai', 'perplexity.ai',
    'grok.com', 'leonardo.ai', 'suno.com', 'meshy.ai'
  ];
  services.forEach(host => assert.ok(ALLOWED_POPUP_HOSTS.includes(host), host + ' manquant'));
});
