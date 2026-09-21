'use strict';

// test/scheduler-completeness.test.js — Tests de la détection automatique
// de complétude (lot 18/09/2026, FEATURES.md P1).
// Teste _autoDetectCompleteness avec un mock de analyzeCompleteness.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { Scheduler } = require('../scheduler/index');
const core = require('../scheduler/core');

// --- Mock d'app Electron --------------------------------------------------

function createMockApp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iao-test-'));
  return {
    getPath: function(name) {
      if (name === 'userData') return tmpDir;
      return tmpDir;
    },
    _tmpDir: tmpDir
  };
}

function cleanup(scheduler) {
  try {
    var dir = scheduler.dir;
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

// Helper : crée un scheduler avec un mock de analyzeCompleteness
function createSchedulerWithMockAnalysis(analysisResult) {
  var app = createMockApp();
  var scheduler = new Scheduler(app, {});
  // Remplace analyzeCompleteness par un mock qui renvoie le résultat souhaité
  scheduler.analyzeCompleteness = function(jobId) {
    return analysisResult;
  };
  return scheduler;
}

// Helper : crée un job COMPLETED
function createCompletedJob(scheduler, projectId) {
  scheduler.jobSeq += 1;
  var job = core.buildJobRecord({
    id: core.nextJobId(scheduler.jobSeq),
    projectId: projectId || null,
    profile: 'profil_1',
    service: 'claude',
    status: 'COMPLETED',
    file_path: '/fake/path/zip.zip'
  });
  scheduler.jobs.push(job);
  scheduler._persistJobs();
  return job;
}

// --- Tests ----------------------------------------------------------------

test('_autoDetectCompleteness passe en DELIVERED si toutes les cases cochées', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 5, inProgress: 0, pending: 0, total: 5, complete: true },
    source: 'FEATURES.md'
  });
  var job = createCompletedJob(scheduler);

  scheduler._autoDetectCompleteness(job);

  assert.strictEqual(job.status, 'DELIVERED');
  assert.strictEqual(job.autoCompleted, true);
  cleanup(scheduler);
});

test('_autoDetectCompleteness passe en PROJECT_PENDING s\'il reste des cases', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 3, inProgress: 1, pending: 2, total: 6, complete: false },
    source: 'FEATURES.md'
  });
  var job = createCompletedJob(scheduler);

  scheduler._autoDetectCompleteness(job);

  assert.strictEqual(job.status, 'PROJECT_PENDING');
  assert.strictEqual(job.autoCompleted, undefined);
  assert.ok(job.completenessAnalysis);
  assert.strictEqual(job.completenessAnalysis.pending, 2);
  cleanup(scheduler);
});

test('_autoDetectCompleteness laisse en COMPLETED si pas de FEATURES.md', function() {
  var scheduler = createSchedulerWithMockAnalysis({ error: 'Aucun FEATURES.md trouvé.' });
  var job = createCompletedJob(scheduler);

  scheduler._autoDetectCompleteness(job);

  assert.strictEqual(job.status, 'COMPLETED');
  cleanup(scheduler);
});

test('_autoDetectCompleteness marque le projet comme terminé si complet', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 10, inProgress: 0, pending: 0, total: 10, complete: true },
    source: 'FEATURES.md'
  });

  // Créer un projet actif
  scheduler.createProject('Projet test', []);
  var project = scheduler.projects[0];
  var job = createCompletedJob(scheduler, project.id);

  scheduler._autoDetectCompleteness(job);

  assert.strictEqual(job.status, 'DELIVERED');
  assert.strictEqual(project.status, 'completed');
  cleanup(scheduler);
});

test('_autoDetectCompleteness ne marque pas le projet s\'il est déjà archivé', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 5, inProgress: 0, pending: 0, total: 5, complete: true },
    source: 'FEATURES.md'
  });

  scheduler.createProject('Projet archivé', []);
  var project = scheduler.projects[0];
  project.status = 'archived'; // déjà archivé
  var job = createCompletedJob(scheduler, project.id);

  scheduler._autoDetectCompleteness(job);

  assert.strictEqual(job.status, 'DELIVERED');
  assert.strictEqual(project.status, 'archived'); // inchangé
  cleanup(scheduler);
});

test('_autoDetectCompleteness stocke l\'analyse dans le job si incomplet', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 2, inProgress: 1, pending: 3, total: 6, complete: false },
    source: 'FEATURES.md'
  });
  var job = createCompletedJob(scheduler);

  scheduler._autoDetectCompleteness(job);

  assert.ok(job.completenessAnalysis);
  assert.strictEqual(job.completenessAnalysis.done, 2);
  assert.strictEqual(job.completenessAnalysis.inProgress, 1);
  assert.strictEqual(job.completenessAnalysis.pending, 3);
  assert.strictEqual(job.completenessAnalysis.total, 6);
  cleanup(scheduler);
});

test('_autoDetectCompleteness gère un job sans projectId', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 3, inProgress: 0, pending: 0, total: 3, complete: true },
    source: 'FEATURES.md'
  });
  var job = createCompletedJob(scheduler, null);

  scheduler._autoDetectCompleteness(job);

  assert.strictEqual(job.status, 'DELIVERED');
  assert.strictEqual(job.autoCompleted, true);
  cleanup(scheduler);
});

test('_autoDetectCompleteness journalise l\'activité', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 5, inProgress: 0, pending: 0, total: 5, complete: true },
    source: 'FEATURES.md'
  });
  var job = createCompletedJob(scheduler);

  scheduler._autoDetectCompleteness(job);

  // Vérifier que le journal contient des entrées de complétude
  var logText = scheduler.log.map(function(e) { return e.message || ''; }).join(' ');
  assert.ok(logText.indexOf('complétude') !== -1 || logText.indexOf('terminé') !== -1);
  cleanup(scheduler);
});

test('_autoDetectCompleteness passe en PROJECT_PENDING si cases en cours (~)', function() {
  var scheduler = createSchedulerWithMockAnalysis({
    analysis: { done: 3, inProgress: 2, pending: 0, total: 5, complete: false },
    source: 'FEATURES.md'
  });
  var job = createCompletedJob(scheduler);

  scheduler._autoDetectCompleteness(job);

  // isProjectComplete renvoie false si inProgress > 0
  assert.strictEqual(job.status, 'PROJECT_PENDING');
  cleanup(scheduler);
});
