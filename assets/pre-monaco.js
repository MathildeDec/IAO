// assets/pre-monaco.js — doit être chargé AVANT le loader AMD de Monaco
// (node_modules/monaco-editor/min/vs/loader.js), qui remplace window.require.
// On sauvegarde le require d'Electron sur window : assets/app.js (script
// classique distinct) le relit à son chargement.
window.__iaoNodeRequire = window.require;
