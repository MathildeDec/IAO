// Purge des locales Chromium inutilisées du build packagé (audit perf).
// L'app est en français ; Chromium n'utilise ces .pak que pour SES propres
// libellés (menus contextuels, etc.). On garde fr + en-US (fallback Chromium)
// + en-GB. Si la locale de l'OS manque, Chromium retombe sur en-US : sans risque.
// Lancé automatiquement par `npm run dist` APRÈS electron-packager.
const fs = require('fs');
const path = require('path');

const KEEP = new Set(['fr.pak', 'en-US.pak', 'en-GB.pak']);
const distRoot = path.join(__dirname, '..', 'dist');

// Auto-détection : on cherche, parmi les sous-dossiers de dist/ (peu importe le
// nom, qui varie selon la plateforme : win32-x64, linux-x64, darwin-arm64...),
// celui qui contient un dossier "locales". Évite un chemin codé en dur par OS.
function findLocalesDir(root) {
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, 'locales');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const dir = findLocalesDir(distRoot);

if (!dir) {
  console.error('[prune-locales] aucun dossier "locales" trouvé sous ' + distRoot);
  process.exit(1);
}

let removed = 0, freed = 0;
for (const f of fs.readdirSync(dir)) {
  if (KEEP.has(f)) continue;
  freed += fs.statSync(path.join(dir, f)).size;
  fs.unlinkSync(path.join(dir, f));
  removed++;
}
console.log('[prune-locales] ' + removed + ' locales supprimées, ' + (freed / 1048576).toFixed(1) + ' Mo libérés (gardées : ' + [...KEEP].join(', ') + ')');
