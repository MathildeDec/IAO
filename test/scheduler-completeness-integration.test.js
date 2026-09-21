'use strict';

// test/scheduler-completeness-integration.test.js — Tests d'intégration de la
// détection automatique de complétude (lot 18/09/2026).
// Teste le flux complet : création d'un ZIP avec FEATURES.md → détection
// automatique → transition d'état.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const { Scheduler } = require('../scheduler/index');
const core = require('../scheduler/core');

// --- Helpers ---------------------------------------------------------------

function createMockApp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iao-test-'));
  return {
    getPath: function(name) {
      if (name === 'userData') return tmpDir;
      return tmpDir;
    }
  };
}

function cleanup(scheduler) {
  try {
    if (fs.existsSync(scheduler.dir)) {
      fs.rmSync(scheduler.dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

// Crée un ZIP contenant un FEATURES.md avec le contenu donné.
// Utilise la commande `zip` du système.
function createZipWithFeaturesMd(zipPath, featuresContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iao-zip-'));
  fs.writeFileSync(path.join(tmpDir, 'FEATURES.md'), featuresContent, 'utf-8');
  // Aussi quelques fichiers factices
  fs.writeFileSync(path.join(tmpDir, 'index.js'), '// test', 'utf-8');
  try {
    execSync(`zip -r "${zipPath}" .`, { cwd: tmpDir, stdio: 'pipe' });
  } catch (e) {
    // Fallback : créer un zip avec Node.js
    execSync(`cd "${tmpDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return zipPath;
}

// --- Tests -----------------------------------------------------------------

test('Intégration : _autoDetectCompleteness avec un vrai ZIP complet', () => {
  var app = createMockApp();
  var scheduler = new Scheduler(app, {});

  // Créer un ZIP avec un FEATURES.md complet (toutes cases cochées)
  var featuresContent = [
    '# FEATURES.md',
    '',
    '- [x] Feature A',
    '- [x] Feature B',
    '- [x] Feature C',
    '- [x] Feature D',
    ''
  ].join('\n');

  var zipPath = path.join(os.tmpdir(), 'test-complete-' + Date.now() + '.zip');
  createZipWithFeaturesMd(zipPath, featuresContent);

  // Créer un job COMPLETED avec ce ZIP
  scheduler.jobSeq = 1;
  var job = core.buildJobRecord({
    id: core.nextJobId(scheduler.jobSeq),
    profile: 'profil_1',
    service: 'claude',
    status: 'COMPLETED',
    file_path: zipPath
  });
  scheduler.jobs.push(job);
  scheduler._persistJobs();

  // Lancer la détection automatique
  scheduler._autoDetectCompleteness(job);

  // Le job devrait passer en DELIVERED
  assert.strictEqual(job.status, 'DELIVERED');
  assert.strictEqual(job.autoCompleted, true);

  // Nettoyer
  try { fs.unlinkSync(zipPath); } catch (_) {}
  cleanup(scheduler);
});

test('Intégration : _autoDetectCompleteness avec un ZIP incomplet', () => {
  var app = createMockApp();
  var scheduler = new Scheduler(app, {});

  var featuresContent = [
    '# FEATURES.md',
    '',
    '- [x] Feature A',
    '- [x] Feature B',
    '- [ ] Feature C (à faire)',
    '- [~] Feature D (en cours)',
    ''
  ].join('\n');

  var zipPath = path.join(os.tmpdir(), 'test-incomplete-' + Date.now() + '.zip');
  createZipWithFeaturesMd(zipPath, featuresContent);

  scheduler.jobSeq = 1;
  var job = core.buildJobRecord({
    id: core.nextJobId(scheduler.jobSeq),
    profile: 'profil_1',
    service: 'claude',
    status: 'COMPLETED',
    file_path: zipPath
  });
  scheduler.jobs.push(job);
  scheduler._persistJobs();

  scheduler._autoDetectCompleteness(job);

  // Le job devrait passer en PROJECT_PENDING (pas DELIVERED)
  assert.strictEqual(job.status, 'PROJECT_PENDING');
  assert.strictEqual(job.autoCompleted, undefined);
  assert.ok(job.completenessAnalysis);
  assert.strictEqual(job.completenessAnalysis.pending, 1);
  assert.strictEqual(job.completenessAnalysis.inProgress, 1);
  assert.strictEqual(job.completenessAnalysis.done, 2);

  try { fs.unlinkSync(zipPath); } catch (_) {}
  cleanup(scheduler);
});

test('Intégration : _autoDetectCompleteness sans FEATURES.md dans le ZIP', () => {
  var app = createMockApp();
  var scheduler = new Scheduler(app, {});

  // Créer un ZIP sans FEATURES.md
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iao-nofeat-'));
  fs.writeFileSync(path.join(tmpDir, 'index.js'), '// test', 'utf-8');
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test', 'utf-8');
  var zipPath = path.join(os.tmpdir(), 'test-nofeatures-' + Date.now() + '.zip');
  try {
    execSync(`zip -r "${zipPath}" .`, { cwd: tmpDir, stdio: 'pipe' });
  } catch (e) {
    execSync(`cd "${tmpDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  scheduler.jobSeq = 1;
  var job = core.buildJobRecord({
    id: core.nextJobId(scheduler.jobSeq),
    profile: 'profil_1',
    service: 'claude',
    status: 'COMPLETED',
    file_path: zipPath
  });
  scheduler.jobs.push(job);
  scheduler._persistJobs();

  scheduler._autoDetectCompleteness(job);

  // Le job devrait rester en COMPLETED
  assert.strictEqual(job.status, 'COMPLETED');
  assert.strictEqual(job.autoCompleted, undefined);

  try { fs.unlinkSync(zipPath); } catch (_) {}
  cleanup(scheduler);
});

test('Intégration : _autoDetectCompleteness avec FEATURES.md dans sous-dossier', () => {
  var app = createMockApp();
  var scheduler = new Scheduler(app, {});

  var featuresContent = [
    '# FEATURES.md',
    '',
    '- [x] Tout est fait',
    ''
  ].join('\n');

  // Créer un ZIP avec FEATURES.md dans un sous-dossier
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iao-sub-'));
  var subDir = path.join(tmpDir, 'project');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'FEATURES.md'), featuresContent, 'utf-8');
  fs.writeFileSync(path.join(subDir, 'index.js'), '// test', 'utf-8');
  var zipPath = path.join(os.tmpdir(), 'test-subdir-' + Date.now() + '.zip');
  try {
    execSync(`zip -r "${zipPath}" .`, { cwd: tmpDir, stdio: 'pipe' });
  } catch (e) {
    execSync(`cd "${tmpDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  scheduler.jobSeq = 1;
  var job = core.buildJobRecord({
    id: core.nextJobId(scheduler.jobSeq),
    profile: 'profil_1',
    service: 'claude',
    status: 'COMPLETED',
    file_path: zipPath
  });
  scheduler.jobs.push(job);
  scheduler._persistJobs();

  scheduler._autoDetectCompleteness(job);

  // Le job devrait passer en DELIVERED même avec FEATURES.md dans un sous-dossier
  assert.strictEqual(job.status, 'DELIVERED');

  try { fs.unlinkSync(zipPath); } catch (_) {}
  cleanup(scheduler);
});

test('Intégration : _autoDetectCompleteness marque le projet associé', () => {
  var app = createMockApp();
  var scheduler = new Scheduler(app, {});

  // Créer un projet
  scheduler.createProject('Projet integration', []);
  var project = scheduler.projects[0];

  var featuresContent = [
    '# FEATURES.md',
    '',
    '- [x] Feature 1',
    '- [x] Feature 2',
    ''
  ].join('\n');

  var zipPath = path.join(os.tmpdir(), 'test-proj-' + Date.now() + '.zip');
  createZipWithFeaturesMd(zipPath, featuresContent);

  scheduler.jobSeq = 1;
  var job = core.buildJobRecord({
    id: core.nextJobId(scheduler.jobSeq),
    projectId: project.id,
    profile: 'profil_1',
    service: 'claude',
    status: 'COMPLETED',
    file_path: zipPath
  });
  scheduler.jobs.push(job);
  scheduler._persistJobs();

  scheduler._autoDetectCompleteness(job);

  assert.strictEqual(job.status, 'DELIVERED');
  assert.strictEqual(project.status, 'completed');

  try { fs.unlinkSync(zipPath); } catch (_) {}
  cleanup(scheduler);
});
