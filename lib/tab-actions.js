'use strict';

// lib/tab-actions.js — fonctions PURES pour le lot « Actions sur un onglet
// ouvert » (FEATURES.md, P1, 17/09/2026) : recharger l'onglet, revenir à
// l'accueil du service, se déconnecter du profil (purge de la partition
// Electron du compte). Aucune dépendance à Electron ni au DOM -> testable par
// `node --test` (invariant 11, CLAUDE.md). Le pilotage réel de la <webview>
// (webview.reload(), webview.loadURL(), l'appel IPC de purge de partition) et
// la modale de confirmation restent dans index.html/main.js — seules la
// sélection des onglets concernés et la formulation du message d'avertissement
// sont extraites ici.

// ---------------------------------------------------------------------------
// Onglets d'un compte donné, tous services confondus. Un profil (donc une
// déconnexion) est partagé par TOUS les onglets ouverts du compte, pas
// seulement celui d'où l'action a été déclenchée — voir invariant 4
// (unicité du profil par compte) : ça ne peut donc jamais toucher qu'un seul
// compte à la fois.
// ---------------------------------------------------------------------------
function tabsForAccount(tabs, accId) {
  return (Array.isArray(tabs) ? tabs : []).filter(t => t && t.accId === accId);
}

// ---------------------------------------------------------------------------
// Message de confirmation avant la déconnexion (destructive) d'un profil.
// Accorde correctement « onglet(s) » / « sera/seront rechargé(s) » selon le
// nombre d'onglets affectés, plutôt que d'écrire un pluriel figé dans
// index.html.
// ---------------------------------------------------------------------------
function buildDisconnectWarning(opts) {
  const o = opts || {};
  const accountName = String(o.accountName == null ? '' : o.accountName);
  const profile = String(o.profile == null ? '' : o.profile);
  const count = Number(o.affectedTabsCount) || 0;

  const tabsPhrase = count > 0
    ? `${count} onglet${count > 1 ? 's' : ''} ouvert${count > 1 ? 's' : ''} pour ce compte ${count > 1 ? 'seront rechargés' : 'sera rechargé'} et devront être reconnectés.`
    : `Aucun onglet de ce compte n'est actuellement ouvert.`;

  return `Ceci supprime les cookies et la session de connexion du profil « ${profile} » (compte « ${accountName} »). ${tabsPhrase}`;
}

// Chargé à la fois via <script src="lib/tab-actions.js"> dans index.html et
// via require() depuis test/ (même pattern que lib/escape-html.js).
if (typeof window !== 'undefined') {
  window.tabsForAccount = tabsForAccount;
  window.buildDisconnectWarning = buildDisconnectWarning;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tabsForAccount, buildDisconnectWarning };
}
