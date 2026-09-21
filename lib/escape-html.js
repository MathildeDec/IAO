'use strict';

// escapeHtml() — extrait d'index.html (chantier F, FEATURES.md P1 « Poser un
// filet de tests sur les fonctions pures ») pour être testable via
// `node --test` sans lancer l'application ni un navigateur.
//
// Échappe les caractères HTML dangereux. À utiliser PARTOUT où une donnée
// saisie par l'utilisateur (nom / email / profil de compte, nom de fichier)
// est injectée dans du HTML via innerHTML. Empêche l'exécution de HTML/JS
// injecté — critique ici car le renderer tourne en nodeIntegration:true (un
// simple nom de compte « <img onerror> » vaudrait sinon exécution de code).
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Chargé à la fois via <script src="lib/escape-html.js"> dans index.html
// (renderer Electron, nodeIntegration:true -> `window` ET `module` existent
// tous les deux : on teste `window` EN PREMIER pour ne jamais toucher au
// `module` global de la page) et via require() depuis les tests `node --test`
// (environnement Node pur, sans `window`).
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml };
}
