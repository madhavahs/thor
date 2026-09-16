#!/usr/bin/env bash
# ==============================================================================
# ESP32 Worldwide AI Forge - 1-Click Update Script for Raspberry Pi
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$ROOT_DIR/server"

echo "=========================================================="
echo "🔄 Updating ESP32 Worldwide AI Forge on Raspberry Pi"
echo "=========================================================="

cd "$ROOT_DIR"

echo "📥 Pulling latest code from GitHub..."
git pull origin main

echo "📦 Updating server dependencies (if any)..."
cd "$SERVER_DIR"
npm install --production

# Restart background systemd service if installed
if systemctl is-active --quiet esp32-forge.service 2>/dev/null; then
  echo "🔄 Restarting esp32-forge background service..."
  sudo systemctl restart esp32-forge.service
  echo "✅ Service restarted successfully!"
  echo "📊 Check status: sudo systemctl status esp32-forge.service"
else
  echo "ℹ️ esp32-forge.service is not currently active."
  echo "   If you run the server manually, start it with:"
  echo "   bash $SCRIPT_DIR/start.sh"
fi

echo "=========================================================="
echo "✨ Update complete! Latest commit:"
cd "$ROOT_DIR"
git log -1 --oneline
echo "=========================================================="
