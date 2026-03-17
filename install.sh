#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HB Scrub – Install Script
# Installs HB Scrub as a standalone desktop + CLI application on Linux.
# Run with:  sudo ./install.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_NAME="hb-scrub"
APP_LABEL="HB Scrub"
INSTALL_DIR="/opt/hb-scrub"
BIN_LINK="/usr/local/bin/hb-scrub"
GUI_LINK="/usr/local/bin/hb-scrub-gui"
DESKTOP_FILE="/usr/share/applications/hb-scrub.desktop"
ICON_SIZES=(16 32 48 64 128 256 512)

# ─── Determine script and project directories ────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Require root ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "Error: This script must be run as root (use sudo)." >&2
  exit 1
fi

# ─── Detect architecture ─────────────────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64) ELECTRON_ARCH="arm64" ;;
  x86_64|amd64)  ELECTRON_ARCH="x64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

RELEASE_DIR="${SCRIPT_DIR}/release/HB Scrub-linux-${ELECTRON_ARCH}"

# ─── Verify build artifacts exist ────────────────────────────────────────────
if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "Error: Packaged app not found at: $RELEASE_DIR"
  echo "Run 'npm run build' and then package the app first."
  echo "  npx @electron/packager . 'HB Scrub' --platform=linux --arch=${ELECTRON_ARCH} --out=release --overwrite --asar"
  exit 1
fi

if [[ ! -f "${SCRIPT_DIR}/dist/hb-scrub.cli.js" ]]; then
  echo "Error: CLI build not found at: ${SCRIPT_DIR}/dist/hb-scrub.cli.js"
  echo "Run 'npm run build' first."
  exit 1
fi

# ─── Remove previous installation if present ─────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  echo "Removing previous installation at ${INSTALL_DIR}..."
  rm -rf "$INSTALL_DIR"
fi

# Remove old symlinks
for link in "$BIN_LINK" "$GUI_LINK"; do
  [[ -L "$link" || -f "$link" ]] && rm -f "$link"
done

echo "Installing ${APP_LABEL} to ${INSTALL_DIR}..."

# ─── Install the Electron GUI app ────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cp -a "$RELEASE_DIR"/. "$INSTALL_DIR/gui/"

# Rename the Electron binary for clarity
mv "$INSTALL_DIR/gui/HB Scrub" "$INSTALL_DIR/gui/hb-scrub-electron"

# ─── Install CLI components ──────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/cli/dist"
mkdir -p "$INSTALL_DIR/cli/node_modules"

# Copy all dist files (CLI needs the chunks and maps)
cp -a "${SCRIPT_DIR}/dist"/. "$INSTALL_DIR/cli/dist/"

# Copy package.json (needed for module resolution)
cp "${SCRIPT_DIR}/package.json" "$INSTALL_DIR/cli/"

# Copy node_modules (runtime dependencies only)
if [[ -d "${SCRIPT_DIR}/node_modules" ]]; then
  cp -a "${SCRIPT_DIR}/node_modules"/. "$INSTALL_DIR/cli/node_modules/"
fi

# ─── Create wrapper scripts ──────────────────────────────────────────────────

# CLI wrapper
cat > "$INSTALL_DIR/hb-scrub" << 'CLIWRAPPER'
#!/usr/bin/env bash
exec /usr/bin/env node /opt/hb-scrub/cli/dist/hb-scrub.cli.js "$@"
CLIWRAPPER
chmod 755 "$INSTALL_DIR/hb-scrub"

# GUI wrapper
cat > "$INSTALL_DIR/hb-scrub-gui" << 'GUIWRAPPER'
#!/usr/bin/env bash
# Launch HB Scrub GUI (Electron)
exec /opt/hb-scrub/gui/hb-scrub-electron --no-sandbox "$@"
GUIWRAPPER
chmod 755 "$INSTALL_DIR/hb-scrub-gui"

# ─── Create symlinks in PATH ─────────────────────────────────────────────────
ln -sf "$INSTALL_DIR/hb-scrub" "$BIN_LINK"
ln -sf "$INSTALL_DIR/hb-scrub-gui" "$GUI_LINK"

# ─── Install .desktop file ───────────────────────────────────────────────────
cp "${SCRIPT_DIR}/hb-scrub.desktop" "$DESKTOP_FILE"
chmod 644 "$DESKTOP_FILE"

# ─── Install icons ───────────────────────────────────────────────────────────
for size in "${ICON_SIZES[@]}"; do
  ICON_SRC="${SCRIPT_DIR}/electron/assets/icon_${size}x${size}.png"
  ICON_DEST="/usr/share/icons/hicolor/${size}x${size}/apps"
  if [[ -f "$ICON_SRC" ]]; then
    mkdir -p "$ICON_DEST"
    cp "$ICON_SRC" "$ICON_DEST/hb-scrub.png"
  fi
done

# Also install the SVG icon if available
if [[ -f "${SCRIPT_DIR}/electron/assets/icon.svg" ]]; then
  mkdir -p /usr/share/icons/hicolor/scalable/apps
  cp "${SCRIPT_DIR}/electron/assets/icon.svg" /usr/share/icons/hicolor/scalable/apps/hb-scrub.svg
fi

# ─── Update icon cache and desktop database ──────────────────────────────────
if command -v gtk-update-icon-cache &>/dev/null; then
  gtk-update-icon-cache -f /usr/share/icons/hicolor/ 2>/dev/null || true
fi
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database /usr/share/applications/ 2>/dev/null || true
fi

# ─── Print summary ───────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ${APP_LABEL} installed successfully!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  CLI:     hb-scrub --help"
echo "  GUI:     hb-scrub-gui"
echo "  Desktop: Look under Applications → Utility"
echo ""
echo "  Install dir:  ${INSTALL_DIR}"
echo "  CLI binary:   ${BIN_LINK}"
echo "  GUI binary:   ${GUI_LINK}"
echo ""
echo "  To uninstall: sudo ./uninstall.sh"
echo "════════════════════════════════════════════════════════════════"
