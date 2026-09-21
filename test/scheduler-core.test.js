'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../scheduler/core.js');

// --- Machine à états ---------------------------------------------------------

test('canTransition accepte le chemin nominal complet', () => {
  const path = ['DOWNLOADING', 'COMPLETED', 'PROJECT_PENDING', 'RESUME_REQUIRED', 'RUNNING', 'DELIVERED'];
  for (let i = 0; i < path.length - 1; i++) {
    assert.equal(core.canTransition(path[i], path[i + 1]), true, path[i] + ' -> ' + path[i + 1]);
  }
});

test('canTransition refuse de sauter des étapes', () => {
  assert.equal(core.canTransition('DOWNLOADING', 'RUNNING'), false);
  assert.equal(core.canTransition('DOWNLOADING', 'DELIVERED'), false);
});

test('nextJobState lève une erreur explicite sur transition invalide', () => {
  assert.throws(() => core.nextJobState('DELIVERED', 'RUNNING'), /invalide/);
});

test('nextJobState renvoie l\'état cible sur transition valide', () => {
  assert.equal(core.nextJobState('DOWNLOADING', 'COMPLETED'), 'COMPLETED');
});

test('DELIVERED est un état terminal (aucune transition sortante)', () => {
  assert.deepEqual(core.ALLOWED_TRANSITIONS.DELIVERED, []);
});

test('ERROR peut être relancé manuellement vers RESUME_REQUIRED', () => {
  assert.equal(core.canTransition('ERROR', 'RESUME_REQUIRED'), true);
});

// --- ZIP / horodatage --------------------------------------------------------

test('isZipFilename ne dépend pas de la casse', () => {
  assert.equal(core.isZipFilename('projet.ZIP'), true);
  assert.equal(core.isZipFilename('projet.zip'), true);
  assert.equal(core.isZipFilename('projet.tar.gz'), false);
});

test('isTimestampedZipName exige le format YYYYMMDD-HHMMSS', () => {
  assert.equal(core.isTimestampedZipName('20260915-193145-projet.zip', '20260915-193145'), true);
  assert.equal(core.isTimestampedZipName('projet.zip', '2026-09-15'), false);
  assert.equal(core.isTimestampedZipName('20260915-193145-projet.zip', '20260916-000000'), false);
});

test('formatTimestamp produit YYYYMMDD-HHMMSS avec zéros de tête', () => {
  const d = new Date(2026, 8, 15, 9, 3, 7); // 15 sept. 2026, 09:03:07 (mois 0-indexé)
  assert.equal(core.formatTimestamp(d), '20260915-090307');
});

test('buildDeliveryPrompt reprend exactement le prompt générique attendu', () => {
  const prompt = core.buildDeliveryPrompt('20260915-193145');
  assert.equal(
    prompt,
    'Continue les features à faire.\n' +
    'Fait évoluer les fichiers de suivi, de tests et de documentation.\n' +
    'Livraison du zip horodaté 20260915-193145 sans passer à la suite.'
  );
});

test('buildDeliveryPrompt refuse un horodatage mal formé', () => {
  assert.throws(() => core.buildDeliveryPrompt('15-09-2026'), /invalide/);
});

// --- Sélection de profil (ordo, point 4) -------------------------------------

function acc(profile, lastAutomationAt, enabled = true) {
  return { id: profile, profile, automation: { enabled, lastAutomationAt, lastUsedAt: 0 } };
}

test('selectOldestEligibleProfile choisit le lastAutomationAt le plus ancien', () => {
  const now = Date.now();
  const accounts = [
    acc('profil_1', now - 6 * 3600000),
    acc('profil_2', now - 8 * 3600000), // le plus ancien
    acc('profil_3', now - 5.5 * 3600000)
  ];
  const chosen = core.selectOldestEligibleProfile(accounts, 5, now);
  assert.equal(chosen.profile, 'profil_2');
});

test('selectOldestEligibleProfile ignore les profils trop récents (< seuil)', () => {
  const now = Date.now();
  const accounts = [acc('profil_1', now - 1 * 3600000)];
  assert.equal(core.selectOldestEligibleProfile(accounts, 5, now), null);
});

test('selectOldestEligibleProfile ignore les profils désactivés', () => {
  const now = Date.now();
  const accounts = [acc('profil_1', 0, false)];
  assert.equal(core.selectOldestEligibleProfile(accounts, 5, now), null);
});

test('selectOldestEligibleProfile priorise un profil jamais utilisé (lastAutomationAt=0)', () => {
  const now = Date.now();
  const accounts = [acc('profil_1', now - 100 * 3600000), acc('profil_2', 0)];
  const chosen = core.selectOldestEligibleProfile(accounts, 5, now);
  assert.equal(chosen.profile, 'profil_2');
});

test('selectOldestEligibleProfile renvoie null sans compte', () => {
  assert.equal(core.selectOldestEligibleProfile([], 5), null);
  assert.equal(core.selectOldestEligibleProfile(null, 5), null);
});

// --- CSV / enregistrement de job ---------------------------------------------

test('buildJobRecord pose des valeurs par défaut sûres', () => {
  const job = core.buildJobRecord({ id: 'job_001' });
  assert.equal(job.id, 'job_001');
  assert.equal(job.status, 'DOWNLOADING');
  assert.equal(job.attempts, 0);
  assert.equal(job.outputZip, null);
});

test('buildJobRecord exige un id', () => {
  assert.throws(() => core.buildJobRecord({}), /id de job manquant/);
});

test('nextJobId formate avec des zéros de tête', () => {
  assert.equal(core.nextJobId(1), 'job_001');
  assert.equal(core.nextJobId(42), 'job_042');
});

test('jobsToCSV produit un en-tête + une ligne par job', () => {
  const jobs = [core.buildJobRecord({ id: 'job_001', profile: 'profil_1', service: 'claude' })];
  const csv = core.jobsToCSV(jobs);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], core.CSV_COLUMNS.join(','));
  assert.match(lines[1], /^job_001,/);
});

test('jobsToCSV échappe les valeurs contenant une virgule ou des guillemets', () => {
  const jobs = [core.buildJobRecord({ id: 'job_001', file_path: 'C:\\dl\\projet, v2".zip' })];
  const csv = core.jobsToCSV(jobs);
  assert.match(csv, /"C:\\dl\\projet, v2""\.zip"/);
});

test('jobsToCSV sur une liste vide renvoie juste l\'en-tête', () => {
  assert.equal(core.jobsToCSV([]), core.CSV_COLUMNS.join(',') + '\n');
});

// --- Détection du service depuis un nom d'hôte -------------------------------

test('serviceFromHost reconnaît les 9 services (domaine exact ou sous-domaine)', () => {
  assert.equal(core.serviceFromHost('claude.ai'), 'claude');
  assert.equal(core.serviceFromHost('chatgpt.com'), 'chatgpt');
  assert.equal(core.serviceFromHost('gemini.google.com'), 'gemini');
  assert.equal(core.serviceFromHost('chat.z.ai'), 'zeta');
  assert.equal(core.serviceFromHost('www.perplexity.ai'), 'perplexity');
  assert.equal(core.serviceFromHost('grok.com'), 'grok');
  assert.equal(core.serviceFromHost('app.leonardo.ai'), 'leonardo');
  assert.equal(core.serviceFromHost('suno.com'), 'suno');
  assert.equal(core.serviceFromHost('www.meshy.ai'), 'meshy');
});

test('serviceFromHost renvoie null pour un hôte inconnu', () => {
  assert.equal(core.serviceFromHost('example.com'), null);
  assert.equal(core.serviceFromHost(null), null);
});
