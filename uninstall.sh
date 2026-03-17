#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HB Scrub – Uninstall Script
# Removes HB Scrub from the system.
# Run with:  sudo ./uninstall.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_LABEL="HB Scrub"
INSTALL_DIR="/opt/hb-scrub"
BIN_LINK="/usr/local/bin/hb-scrub"
GUI_LINK="/usr/local/bin/hb-scrub-gui"
DESKTOP_FILE="/usr/share/applications/hb-scrub.desktop"
ICON_SIZES=(16 32 48 64 128 256 512)

# ─── Require root ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "Error: This script must be run as root (use sudo)." >&2
  exit 1
fi

echo "Uninstalling ${APP_LABEL}..."

# ─── Remove application directory ────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  echo "  Removed ${INSTALL_DIR}"
else
  echo "  ${INSTALL_DIR} not found (already removed?)"
fi

# ─── Remove symlinks ─────────────────────────────────────────────────────────
for link in "$BIN_LINK" "$GUI_LINK"; do
  if [[ -L "$link" || -f "$link" ]]; then
    rm -f "$link"
    echo "  Removed ${link}"
  fi
done

# ─── Remove .desktop file ────────────────────────────────────────────────────
if [[ -f "$DESKTOP_FILE" ]]; then
  rm -f "$DESKTOP_FILE"
  echo "  Removed ${DESKTOP_FILE}"
fi

# ─── Remove icons ────────────────────────────────────────────────────────────
for size in "${ICON_SIZES[@]}"; do
  ICON_PATH="/usr/share/icons/hicolor/${size}x${size}/apps/hb-scrub.png"
  if [[ -f "$ICON_PATH" ]]; then
    rm -f "$ICON_PATH"
    echo "  Removed ${ICON_PATH}"
  fi
done

# Remove SVG icon
SVG_ICON="/usr/share/icons/hicolor/scalable/apps/hb-scrub.svg"
if [[ -f "$SVG_ICON" ]]; then
  rm -f "$SVG_ICON"
  echo "  Removed ${SVG_ICON}"
fi

# ─── Update icon cache and desktop database ──────────────────────────────────
if command -v gtk-update-icon-cache &>/dev/null; then
  gtk-update-icon-cache -f /usr/share/icons/hicolor/ 2>/dev/null || true
fi
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database /usr/share/applications/ 2>/dev/null || true
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ${APP_LABEL} has been uninstalled."
echo "════════════════════════════════════════════════════════════════"
