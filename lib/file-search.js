'use strict';

// lib/file-search.js — fonctions PURES pour la recherche dans l'explorateur
// de fichiers (FEATURES.md P2 « Recherche dans l'explorateur de fichiers et
// affichage récursif des sous-dossiers »). Aucune dépendance à Electron ni au
// DOM -> testable par `node --test` (invariant 11, CLAUDE.md).
//
// L'explorateur actuel n'affiche que les fichiers du dossier courant (IPC
// 'read-directory' dans main.js, non récursif). Ce lot ajoute :
//   - filterFiles(files, query) : filtre une liste plate de fichiers par nom
//     (insensible à la casse, correspondance partielle).
//   - flattenFileTree(entries) : transforme une arborescence (avec sous-dossiers)
//     en liste plate avec chemin relatif, prête à être rendue.
// Le rendu DOM et l'appel IPC restent dans index.html/main.js — seules les
// transformations de données sont extraites ici.

// Filtre une liste plate de fichiers par nom. Insensible à la casse, match
// partiel : "feat" matche "FEATURES.md" et "feature-flags.js". Ignore les
// requêtes vides (renvoie tout).
function filterFiles(files, query) {
  const list = Array.isArray(files) ? files : [];
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return list.slice();
  return list.filter(f => {
    if (!f || typeof f.name !== 'string') return false;
    return f.name.toLowerCase().includes(q);
  });
}

// Transforme une arborescence de fichiers (avec sous-dossiers) en une liste
// plate. Chaque entrée d'entrée peut être :
//   - un fichier : { name, path, relativePath? }
//   - un dossier : { name, path, children: [...] }
// Renvoie un tableau plat de fichiers avec un `relativePath` (chemin relatif
// au dossier racine) pour l'affichage. Les dossiers eux-mêmes ne sont pas
// inclus dans le résultat (on ne rend que des fichiers cliquables).
function flattenFileTree(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const result = [];
  function walk(items, prefix) {
    for (const item of list_of(items)) {
      if (!item || typeof item.name !== 'string') continue;
      const rel = prefix ? prefix + '/' + item.name : item.name;
      if (item.children) {
        // Dossier : on descend, on n'ajoute pas le dossier lui-même.
        walk(item.children, rel);
      } else {
        // Fichier : on ajoute avec son chemin relatif.
        result.push({
          name: item.name,
          path: item.path || rel,
          relativePath: rel
        });
      }
    }
  }
  walk(list, '');
  return result;
}

// Helper : accepte un tableau ou un non-tableau (retourne [] si non-tableau).
function list_of(x) { return Array.isArray(x) ? x : []; }

// Chargé à la fois via <script src="lib/file-search.js"> dans index.html
// et via require() depuis test/ (même pattern que lib/escape-html.js).
if (typeof window !== 'undefined') {
  window.filterFiles = filterFiles;
  window.flattenFileTree = flattenFileTree;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { filterFiles, flattenFileTree };
}
