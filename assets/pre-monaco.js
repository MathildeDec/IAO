// assets/pre-monaco.js — chargé AVANT le loader AMD de Monaco
// (node_modules/monaco-editor/min/vs/loader.js), qui crée son propre require.
//
// Issue #4 : avec contextIsolation: true, window.require n'existe plus (le
// renderer n'a plus accès à Node). Ce script n'a plus besoin de sauvegarder
// window.__iaoNodeRequire. Monaco calcule son chemin absolu via
// window.iaoAPI.resolveMonacoBase() (exposé par preload.js).
//
// Laissé vide intentionnellement — conservé comme point d'extension futur
// (config Monaco globale, polyfills, etc.).
