#!/usr/bin/env bash
#
# Installeur Linux de IAO.
#
# Installe l'application packagée (produite par `npm run dist:linux`) et
# l'intègre pleinement au menu des applications d'Ubuntu/GNOME :
#   - fichiers de l'app dans un préfixe (~/.local/opt ou /opt)
#   - icônes dans le thème hicolor (16 -> 512 px), donc menu + Dock + Alt+Tab
#   - entrée .desktop (recherche GNOME, épinglage au Dock, StartupWMClass)
#   - commande `iao` dans le PATH
#
# Usage :
#   ./install.sh                 # installation utilisateur (sans sudo)
#   sudo ./install.sh --system   # installation pour tous les comptes
#   ./install.sh --uninstall     # désinstallation (même portée)
#
set -euo pipefail

APP_ID="iao"
APP_NAME="IAO"
BIN_NAME="IAO"          # nom de l'exécutable produit par le packager
# Le script vit à la RACINE du projet (déplacé depuis installer/ le 16/09/2026).
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_TEMPLATE="$PROJECT_DIR/installer/$APP_ID.desktop.in"

MODE="user"
ACTION="install"

for arg in "$@"; do
  case "$arg" in
    --system)    MODE="system" ;;
    --user)      MODE="user" ;;
    --uninstall) ACTION="uninstall" ;;
    -h|--help)
      awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *)
      echo "Option inconnue : $arg (voir --help)" >&2
      exit 1 ;;
  esac
done

# --- Chemins cibles selon la portée d'installation ---------------------------
if [ "$MODE" = "system" ]; then
  [ "$(id -u)" -eq 0 ] || { echo "--system requiert les droits root : sudo $0 --system" >&2; exit 1; }
  PREFIX="/opt/$APP_ID"
  DESKTOP_DIR="/usr/share/applications"
  ICON_DIR="/usr/share/icons/hicolor"
  BIN_DIR="/usr/local/bin"
else
  [ "$(id -u)" -ne 0 ] || echo "Note : installation utilisateur lancée en root — les fichiers iront dans le HOME de root."
  PREFIX="$HOME/.local/opt/$APP_ID"
  DESKTOP_DIR="$HOME/.local/share/applications"
  ICON_DIR="$HOME/.local/share/icons/hicolor"
  BIN_DIR="$HOME/.local/bin"
fi

DESKTOP_FILE="$DESKTOP_DIR/$APP_ID.desktop"
LAUNCHER="$BIN_DIR/$APP_ID"
ICON_SIZES="16 24 32 48 64 128 256 512"

# --- Rafraîchit les caches freedesktop (icônes + base .desktop) --------------
refresh_caches() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  command -v gtk-update-icon-cache  >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$ICON_DIR" 2>/dev/null || true
}

# --- Désinstallation ---------------------------------------------------------
if [ "$ACTION" = "uninstall" ]; then
  echo "Désinstallation ($MODE)…"
  rm -rf "$PREFIX"
  rm -f  "$DESKTOP_FILE" "$LAUNCHER"
  for s in $ICON_SIZES; do rm -f "$ICON_DIR/${s}x${s}/apps/$APP_ID.png"; done
  refresh_caches
  echo "Terminé. Les comptes et sessions restent dans ~/.config/ai-manager"
  echo "(supprimez ce dossier manuellement si vous voulez tout effacer)."
  exit 0
fi

# --- Localisation du build ---------------------------------------------------
# electron-packager sort dans dist/<ProductName>-linux-<arch>/
BUILD_DIR="$(find "$PROJECT_DIR/dist" -maxdepth 1 -type d -name "$BIN_NAME-linux-*" 2>/dev/null | head -n1 || true)"

if [ -z "$BUILD_DIR" ]; then
  echo "Aucun build trouvé dans $PROJECT_DIR/dist/"

  # electron-packager vient des devDependencies : sans "npm install" préalable,
  # "npm run dist:linux" échoue avec un "electron-packager: not found" peu clair.
  if [ ! -x "$PROJECT_DIR/node_modules/.bin/electron-packager" ]; then
    if [ "$(id -u)" -eq 0 ]; then
      echo "Dépendances non installées (node_modules absent ou incomplet)." >&2
      echo "Ne lancez pas 'npm install' en root : cela laisse des fichiers appartenant" >&2
      echo "à root dans node_modules. Lancez plutôt, en utilisateur normal :" >&2
      echo "  cd \"$PROJECT_DIR\" && npm install && npm run dist:linux" >&2
      echo "puis relancez : sudo $0 --system" >&2
      exit 1
    fi
    echo "Dépendances non installées — installation (npm install)…"
    ( cd "$PROJECT_DIR" && npm install )
  fi

  echo "Construction en cours (npm run dist:linux)…"
  ( cd "$PROJECT_DIR" && npm run dist:linux )
  BUILD_DIR="$(find "$PROJECT_DIR/dist" -maxdepth 1 -type d -name "$BIN_NAME-linux-*" | head -n1 || true)"
fi

[ -n "$BUILD_DIR" ] && [ -x "$BUILD_DIR/$BIN_NAME" ] || {
  echo "Build introuvable ou exécutable manquant ($BIN_NAME)." >&2
  echo "Lancez d'abord : npm install && npm run dist:linux" >&2
  exit 1
}

echo "Build   : $BUILD_DIR"
echo "Cible   : $PREFIX  ($MODE)"

# --- Copie de l'application --------------------------------------------------
rm -rf "$PREFIX"
mkdir -p "$PREFIX"
cp -a "$BUILD_DIR"/. "$PREFIX"/

# --- Sandbox Chromium --------------------------------------------------------
# Le bac à sable d'Electron exige que chrome-sandbox appartienne à root avec le
# bit setuid. C'est possible en installation système uniquement ; en mode
# utilisateur, le lanceur retombe automatiquement sur --no-sandbox (voir plus bas).
SANDBOX_OK=0
if [ "$MODE" = "system" ] && [ -f "$PREFIX/chrome-sandbox" ]; then
  chown root:root "$PREFIX/chrome-sandbox"
  chmod 4755 "$PREFIX/chrome-sandbox"
  SANDBOX_OK=1
fi

# --- Icônes dans le thème hicolor -------------------------------------------
# Une icône par taille : GNOME choisit la bonne pour le menu, le Dock, Alt+Tab.
for s in $ICON_SIZES; do
  src="$PROJECT_DIR/build/icon-$s.png"
  [ -f "$src" ] || src="$PROJECT_DIR/build/icon.png"
  [ -f "$src" ] || continue
  mkdir -p "$ICON_DIR/${s}x${s}/apps"
  cp -f "$src" "$ICON_DIR/${s}x${s}/apps/$APP_ID.png"
done

# --- Lanceur en ligne de commande -------------------------------------------
# Wrapper plutôt que lien symbolique : il gère le repli --no-sandbox quand le
# bit setuid n'a pas pu être posé (installation utilisateur, Ubuntu 24.04+).
mkdir -p "$BIN_DIR"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
# Lanceur de $APP_NAME (généré par install.sh)
APP="$PREFIX/$BIN_NAME"
SANDBOX="$PREFIX/chrome-sandbox"
# Le sandbox Chromium n'est utilisable que si chrome-sandbox est setuid root.
if [ -u "\$SANDBOX" ] && [ -O "\$SANDBOX" -o "\$(stat -c %u "\$SANDBOX" 2>/dev/null)" = "0" ]; then
  exec "\$APP" "\$@"
else
  exec "\$APP" --no-sandbox "\$@"
fi
EOF
chmod 755 "$LAUNCHER"

# --- Entrée de menu ----------------------------------------------------------
mkdir -p "$DESKTOP_DIR"
[ -f "$DESKTOP_TEMPLATE" ] || { echo "Modèle .desktop introuvable : $DESKTOP_TEMPLATE" >&2; exit 1; }
sed -e "s|@EXEC@|$LAUNCHER|g" -e "s|@ICON@|$APP_ID|g" \
    "$DESKTOP_TEMPLATE" > "$DESKTOP_FILE"
chmod 644 "$DESKTOP_FILE"

refresh_caches

# --- Vérifications et conseils ----------------------------------------------
command -v desktop-file-validate >/dev/null 2>&1 && desktop-file-validate "$DESKTOP_FILE" || true

echo
echo "✅ $APP_NAME installé."
echo "   Menu       : cherchez « IAO » (Super puis tapez le nom)"
echo "   Terminal   : $APP_ID"
echo "   Données    : ~/.config/ai-manager (comptes et sessions IA)"
if [ "$SANDBOX_OK" -eq 1 ]; then
  echo "   Sandbox    : activé (chrome-sandbox setuid root)"
else
  echo "   Sandbox    : désactivé (--no-sandbox) — installation utilisateur."
  echo "                Pour l'activer : sudo $0 --system"
fi
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "   ⚠ $BIN_DIR n'est pas dans votre PATH (l'entrée de menu fonctionne quand même)." ;;
esac
if [ "$MODE" = "system" ]; then
  echo "   Désinstaller : sudo $PROJECT_DIR/install.sh --uninstall --system"
else
  echo "   Désinstaller : $PROJECT_DIR/install.sh --uninstall"
fi
