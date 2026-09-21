'use strict';

// lib/cooldown-notify.js — fonctions PURES pour la notification de fin de
// cooldown (FEATURES.md P2 « Notification quand un cooldown se termine »).
// Aucune dépendance à Electron ni au DOM -> testable par `node --test`
// (invariant 11, CLAUDE.md).
//
// Le principe : on compare la liste des cooldowns actifs au tick précédent
// avec ceux du tick courant. Tout cooldown qui passe de « actif » (timestamp
// futur) à « expiré » (timestamp <= now) déclenche une notification. On ne
// notifie JAMAIS deux fois le même cooldown : le suivi se fait côté renderer
// (index.html) via un Set des clés déjà notifiées.

// Clé unique pour un couple (compte, service) — utilisée pour le dédoublonnage.
function cooldownKey(accId, svcId) {
  return accId + '::' + svcId;
}

// Renvoie la liste des cooldowns qui viennent d'expirer entre le snap-shot
// précédent (previouslyActive : tableau de { accId, svcId, endsAt }) et
// l'instant courant (now). Un cooldown est considéré comme expiré si son
// endsAt était > 0 (donc actif) et est désormais <= now.
//
// `previouslyActive` est l'ensemble des cooldowns qui étaient actifs au tick
// précédent. `accounts` est la liste courante des comptes (source de vérité
// pour les cooldowns actuels). On ne renvoie que les cooldowns qui étaient
// dans previouslyActive ET dont le timestamp est maintenant <= now (donc
// viennent d'expirer), ce qui évite de notifier un cooldown déjà expiré à un
// tick précédent.
function getNewlyExpiredCooldowns(accounts, previouslyActive, now) {
  if (!Array.isArray(previouslyActive) || previouslyActive.length === 0) return [];
  const nowMs = Number(now) || Date.now();
  // Carte des endsAt actuels par clé, pour ne pas renotifier un cooldown
  // déjà expiré à un tick précédent mais toujours à 0 dans accounts.
  const currentEndsAt = new Map();
  if (Array.isArray(accounts)) {
    for (const acc of accounts) {
      if (!acc || !acc.cooldowns) continue;
      for (const svcId of Object.keys(acc.cooldowns)) {
        const cd = Number(acc.cooldowns[svcId]) || 0;
        if (cd > 0) currentEndsAt.set(cooldownKey(acc.id, svcId), cd);
      }
    }
  }
  const expired = [];
  for (const entry of previouslyActive) {
    if (!entry || !entry.accId || !entry.svcId) continue;
    const endsAt = Number(entry.endsAt) || 0;
    if (endsAt <= 0) continue; // n'était pas actif
    if (endsAt > nowMs) continue; // encore actif
    // Vérifie que le cooldown est bien à 0 (ou absent) dans l'état courant
    // des comptes : si le cooldown a été réactivé entre-temps (utilisateur a
    // re-cliqué « Épuiser »), on ne notifie pas l'expiration précédente.
    const key = cooldownKey(entry.accId, entry.svcId);
    if (currentEndsAt.has(key)) continue; // toujours actif, pas une expiration
    expired.push({ accId: entry.accId, svcId: entry.svcId, key });
  }
  return expired;
}

// Construit le snapshot des cooldowns actifs à partir de la liste des comptes,
// pour le tick suivant.
function snapshotActiveCooldowns(accounts) {
  const snap = [];
  if (!Array.isArray(accounts)) return snap;
  for (const acc of accounts) {
    if (!acc || !acc.cooldowns) continue;
    for (const svcId of Object.keys(acc.cooldowns)) {
      const cd = Number(acc.cooldowns[svcId]) || 0;
      if (cd > 0) snap.push({ accId: acc.id, svcId, endsAt: cd });
    }
  }
  return snap;
}

// Chargé à la fois via <script src="lib/cooldown-notify.js"> dans index.html
// et via require() depuis test/ (même pattern que lib/escape-html.js).
if (typeof window !== 'undefined') {
  window.cooldownKey = cooldownKey;
  window.getNewlyExpiredCooldowns = getNewlyExpiredCooldowns;
  window.snapshotActiveCooldowns = snapshotActiveCooldowns;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cooldownKey, getNewlyExpiredCooldowns, snapshotActiveCooldowns };
}
