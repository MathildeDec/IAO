'use strict';

// test/claude-adapter.test.js — Tests des fonctions pures de lib/claude-adapter.js
// (lot 18/09/2026, points 7-8, 10-13). Invariant 11 : toute fonction pure va
// dans lib/ avec son test.

const test = require('node:test');
const assert = require('node:assert');
const claude = require('../lib/claude-adapter');

test('CLAUDE_SELECTORS contient tous les éléments requis (point 7)', () => {
  const required = [
    'continueButton', 'downloadButton', 'newChatButton',
    'chatInput', 'fileUpload', 'sendButton', 'assistantMessages'
  ];
  for (const key of required) {
    assert.ok(claude.CLAUDE_SELECTORS[key], 'Sélecteur manquant : ' + key);
    assert.ok(Array.isArray(claude.CLAUDE_SELECTORS[key]), key + ' doit être un tableau');
    assert.ok(claude.CLAUDE_SELECTORS[key].length > 0, key + ' doit avoir au moins un sélecteur candidat');
  }
});

test('detectQuotaMessage détecte le message de quota en français', () => {
  const text = 'Vous n\u2019avez plus de messages gratuits jusqu\u2019à 22:10. Revenez plus tard.';
  const result = claude.detectQuotaMessage(text);
  assert.ok(result.detected, 'Le message de quota doit être détecté');
  assert.strictEqual(result.time, '22:10');
});

test('detectQuotaMessage détecte le message de quota en anglais', () => {
  const text = "You've run out of free messages until 10:10 PM. Try again later.";
  const result = claude.detectQuotaMessage(text);
  assert.ok(result.detected, 'Le message de quota doit être détecté');
  assert.ok(result.time.includes('10:10'), 'L\'heure doit être extraite : ' + result.time);
});

test('detectQuotaMessage renvoie detected=false sans message de quota', () => {
  assert.deepStrictEqual(claude.detectQuotaMessage('Bonjour, comment ça va ?'), { detected: false, time: null });
  assert.deepStrictEqual(claude.detectQuotaMessage(''), { detected: false, time: null });
  assert.deepStrictEqual(claude.detectQuotaMessage(null), { detected: false, time: null });
  assert.deepStrictEqual(claude.detectQuotaMessage(undefined), { detected: false, time: null });
});

test('buildClaudeDetectionScript génère un script JS valide', () => {
  const script = claude.buildClaudeDetectionScript();
  assert.ok(typeof script === 'string', 'Le script doit être une chaîne');
  assert.ok(script.length > 100, 'Le script ne doit pas être vide');
  assert.ok(script.includes('selectors'), 'Le script doit référencer les sélecteurs');
  assert.ok(script.includes('quotaMessage'), 'Le script doit détecter le quota');
  assert.ok(script.includes('popups'), 'Le script doit détecter les popups');
  // Le script doit être auto-exécutable (IIFE)
  assert.ok(script.startsWith('(function'), 'Le script doit être une IIFE');
});

test('buildPromptInjectionScript génère un script avec le prompt échappé', () => {
  const prompt = 'Continue les features à faire.\nFait évoluer les fichiers.';
  const script = claude.buildPromptInjectionScript(prompt);
  assert.ok(typeof script === 'string');
  assert.ok(script.includes('promptText'), 'Le script doit contenir le prompt');
  assert.ok(script.includes('chatInput'), 'Le script doit chercher la zone de chat');
  assert.ok(script.includes('sendBtn'), 'Le script doit chercher le bouton d\'envoi');
  // Le prompt doit être échappé (les \n deviennent \\n)
  assert.ok(script.includes('\\n'), 'Les sauts de ligne doivent être échappés');
});

test('buildPromptInjectionScript gère un prompt vide sans planter', () => {
  const script = claude.buildPromptInjectionScript('');
  assert.ok(typeof script === 'string');
});

test('buildPromptInjectionScript gère un prompt avec apostrophes', () => {
  const script = claude.buildPromptInjectionScript("L'apostrophe d'un test");
  assert.ok(typeof script === 'string');
  assert.ok(!script.includes("'L'apostrophe"), 'Les apostrophes doivent être échappées');
});

test('buildFileUploadScript génère un script de localisation d\'input file', () => {
  const script = claude.buildFileUploadScript();
  assert.ok(typeof script === 'string');
  assert.ok(script.includes('fileInput'), 'Le script doit chercher l\'input file');
  assert.ok(script.includes('data-iao-upload-target'), 'Le script doit marquer l\'input pour le CDP');
});

test('parseClaudeResponse extrait le texte de la dernière réponse', () => {
  const html = '<div data-testid="assistant-message">Première réponse</div>' +
               '<div data-testid="assistant-message">Dernière réponse</div>';
  const result = claude.parseClaudeResponse(html);
  assert.ok(result, 'Une réponse doit être extraite');
  assert.ok(result.includes('Dernière réponse'), 'La dernière réponse doit être extraite');
});

test('parseClaudeResponse gère du texte simple', () => {
  const result = claude.parseClaudeResponse('Texte simple sans HTML');
  assert.ok(result);
  assert.ok(result.includes('Texte simple'));
});

test('parseClaudeResponse renvoie null pour une entrée vide', () => {
  assert.strictEqual(claude.parseClaudeResponse(''), null);
  assert.strictEqual(claude.parseClaudeResponse(null), null);
  assert.strictEqual(claude.parseClaudeResponse(undefined), null);
});

test('parseClaudeResponse limite la taille à 5000 caractères', () => {
  const longText = 'A'.repeat(6000);
  const result = claude.parseClaudeResponse(longText);
  assert.ok(result);
  assert.strictEqual(result.length, 5000);
});

test('buildResponseCollectionScript génère un script de collecte', () => {
  const script = claude.buildResponseCollectionScript();
  assert.ok(typeof script === 'string');
  assert.ok(script.includes('assistantMessages'), 'Le script doit chercher les messages assistant');
  assert.ok(script.includes('response'), 'Le script doit renvoyer la réponse');
});

// --- Tests des sélecteurs validés (lot 18/09/2026) -------------------------
// Sources : dev.to, deepwiki.com, greasyfork.org, recurate.ai (2025-2026).

test('CLAUDE_SELECTORS.chatInput inclut ProseMirror contenteditable', () => {
  const selectors = claude.CLAUDE_SELECTORS.chatInput;
  assert.ok(
    selectors.some(s => s.includes('ProseMirror')),
    'chatInput doit inclure un sélecteur ProseMirror (Claude utilise ProseMirror)'
  );
  assert.ok(
    selectors.some(s => s.includes('contenteditable')),
    'chatInput doit inclure un sélecteur contenteditable'
  );
});

test('CLAUDE_SELECTORS.chatInput n\'utilise pas textarea comme primaire', () => {
  // Claude utilise un contenteditable div, pas un textarea.
  // Le sélecteur textarea ne doit pas être en première position.
  const selectors = claude.CLAUDE_SELECTORS.chatInput;
  assert.ok(!selectors[0].includes('textarea'), 'Le premier sélecteur ne doit pas être textarea');
});

test('CLAUDE_SELECTORS.sendButton inclut data-testid send-button', () => {
  const selectors = claude.CLAUDE_SELECTORS.sendButton;
  assert.ok(
    selectors.some(s => s.includes('data-testid') && s.includes('send-button')),
    'sendButton doit inclure button[data-testid="send-button"]'
  );
});

test('CLAUDE_SELECTORS.sendButton inclut Send Message avec M majuscule', () => {
  const selectors = claude.CLAUDE_SELECTORS.sendButton;
  assert.ok(
    selectors.some(s => s.includes('Send Message')),
    'sendButton doit inclure button[aria-label="Send Message"] (M majuscule)'
  );
});

test('CLAUDE_SELECTORS.assistantMessages inclut data-is-streaming', () => {
  const selectors = claude.CLAUDE_SELECTORS.assistantMessages;
  assert.ok(
    selectors.some(s => s.includes('data-is-streaming')),
    'assistantMessages doit inclure [data-is-streaming] (stabilité HIGH)'
  );
});

test('CLAUDE_SELECTORS.assistantMessages inclut font-claude-response', () => {
  const selectors = claude.CLAUDE_SELECTORS.assistantMessages;
  assert.ok(
    selectors.some(s => s.includes('font-claude-response')),
    'assistantMessages doit inclure .font-claude-response (stabilité MEDIUM)'
  );
});

test('CLAUDE_SELECTORS.newChatButton inclut a[href="/new"]', () => {
  const selectors = claude.CLAUDE_SELECTORS.newChatButton;
  assert.ok(
    selectors.some(s => s === 'a[href="/new"]'),
    'newChatButton doit inclure a[href="/new"]'
  );
});

// --- Tests parseClaudeResponse avec nouveaux patterns ----------------------

test('parseClaudeResponse extrait depuis data-is-streaming', () => {
  const html = '<div data-is-streaming="false"><p>Réponse via streaming</p></div>';
  const result = claude.parseClaudeResponse(html);
  assert.ok(result, 'Une réponse doit être extraite depuis data-is-streaming');
  assert.ok(result.includes('Réponse via streaming'));
});

test('parseClaudeResponse extrait depuis font-claude-response', () => {
  const html = '<div class="font-claude-response"><div class="standard-markdown">Texte de Claude</div></div>';
  const result = claude.parseClaudeResponse(html);
  assert.ok(result, 'Une réponse doit être extraite depuis font-claude-response');
  assert.ok(result.includes('Texte de Claude'));
});

test('parseClaudeResponse priorise data-is-streaming sur assistant-message', () => {
  const html = '<div data-testid="assistant-message">Ancien pattern</div>' +
               '<div data-is-streaming="false">Nouveau pattern</div>';
  const result = claude.parseClaudeResponse(html);
  assert.ok(result);
  // data-is-streaming est testé en premier (priorité HIGH)
  assert.ok(result.includes('Nouveau pattern'));
});
