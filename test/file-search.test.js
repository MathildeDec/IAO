'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { filterFiles, flattenFileTree } = require('../lib/file-search.js');

// --- filterFiles -----------------------------------------------------------

test('filterFiles filtre par nom, insensible à la casse', () => {
  const files = [
    { name: 'FEATURES.md', path: '/p/FEATURES.md' },
    { name: 'app.js', path: '/p/app.js' },
    { name: 'feature-flags.js', path: '/p/feature-flags.js' }
  ];
  const r = filterFiles(files, 'feat');
  assert.equal(r.length, 2);
  assert.ok(r.some(f => f.name === 'FEATURES.md'));
  assert.ok(r.some(f => f.name === 'feature-flags.js'));
});

test('filterFiles renvoie tout quand la requête est vide', () => {
  const files = [
    { name: 'a.js', path: '/p/a.js' },
    { name: 'b.js', path: '/p/b.js' }
  ];
  assert.equal(filterFiles(files, '').length, 2);
  assert.equal(filterFiles(files, null).length, 2);
  assert.equal(filterFiles(files, '   ').length, 2);
});

test('filterFiles renvoie un tableau vide si rien ne matche', () => {
  const files = [{ name: 'a.js', path: '/p/a.js' }];
  assert.equal(filterFiles(files, 'xyz').length, 0);
});

test('filterFiles gère une liste vide ou absente', () => {
  assert.deepEqual(filterFiles([], 'test'), []);
  assert.deepEqual(filterFiles(null, 'test'), []);
  assert.deepEqual(filterFiles(undefined, 'test'), []);
});

test('filterFiles ignore les entrées invalides', () => {
  const files = [null, undefined, { name: 'valid.js', path: '/p/valid.js' }, { path: '/p/no-name' }];
  const r = filterFiles(files, 'valid');
  assert.equal(r.length, 1);
});

// --- flattenFileTree -------------------------------------------------------

test('flattenFileTree transforme une arborescence en liste plate', () => {
  const tree = [
    { name: 'a.js', path: '/p/a.js' },
    {
      name: 'sub',
      path: '/p/sub',
      children: [
        { name: 'b.js', path: '/p/sub/b.js' },
        {
          name: 'deep',
          path: '/p/sub/deep',
          children: [
            { name: 'c.js', path: '/p/sub/deep/c.js' }
          ]
        }
      ]
    },
    { name: 'd.js', path: '/p/d.js' }
  ];
  const flat = flattenFileTree(tree);
  assert.equal(flat.length, 4); // a.js, b.js, c.js, d.js (les dossiers sont exclus)
  assert.ok(flat.some(f => f.name === 'c.js' && f.relativePath === 'sub/deep/c.js'));
  assert.ok(flat.some(f => f.name === 'a.js' && f.relativePath === 'a.js'));
});

test('flattenFileTree gère une liste vide ou absente', () => {
  assert.deepEqual(flattenFileTree([]), []);
  assert.deepEqual(flattenFileTree(null), []);
});

test('flattenFileTree ignore les entrées invalides', () => {
  const tree = [null, undefined, { name: 'valid.js', path: '/p/valid.js' }];
  const flat = flattenFileTree(tree);
  assert.equal(flat.length, 1);
});
