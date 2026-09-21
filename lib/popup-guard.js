'use strict';

// popup-guard.js — extrait de main.js (chantier F, FEATURES.md P1 « Poser un
// filet de tests sur les fonctions pures ») pour être testable via
// `node --test` sans lancer Electron. Aucune dépendance à `electron` : ce
// fichier ne fait que du parsing d'URL (API `URL` native de Node).
//
// Origines de confiance autorisées à ouvrir une popup depuis une <webview>
// (durcissement navigation/popups, chantier B). On y met les 9 services +
// les fournisseurs d'identité courants pour que les connexions OAuth (Google
// pour Gemini, etc.) continuent de s'ouvrir.
// ⚠️ À VALIDER (FEATURES.md, P0) : cette liste blanche est volontairement
// explicite. Si un flux de connexion légitime d'un service ouvre une popup
// vers un domaine absent d'ici, elle sera refusée — il faudra alors ajouter
// ce domaine ci-dessous.
const ALLOWED_POPUP_HOSTS = [
  'claude.ai', 'anthropic.com',
  'chatgpt.com', 'openai.com',
  'gemini.google.com', 'google.com', 'gstatic.com',   // google.com couvre accounts.google.com
  'z.ai', 'chatglm.cn',
  'perplexity.ai',
  'grok.com', 'x.ai', 'x.com',
  'leonardo.ai',   // couvre app.leonardo.ai et auth.leonardo.ai (suffixe)
  'suno.com',      // couvre clerk.suno.com (auth Clerk : Google/Apple/Microsoft/Discord/tél.)
  'discord.com',   // login Discord proposé par Suno
  'meshy.ai',      // login Google (accounts.google.com déjà couvert) ou e-mail
  // Fournisseurs d'identité fréquents pour les connexions tierces (OAuth/SSO).
  'googleusercontent.com', 'microsoftonline.com', 'live.com', 'appleid.apple.com', 'github.com'
];

function isAllowedPopup(urlStr) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    // Autorise le domaine exact OU n'importe quel sous-domaine (ex. accounts.google.com).
    return ALLOWED_POPUP_HOSTS.some(d => host === d || host.endsWith('.' + d));
  } catch (_) {
    return false; // URL non parsable (about:blank, data:, javascript:) -> refusée
  }
}

module.exports = { ALLOWED_POPUP_HOSTS, isAllowedPopup };
