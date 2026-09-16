#!/usr/bin/env bash
# ==============================================================================
# ESP32 Worldwide AI Forge - Automated Installer for Raspberry Pi 4 Model B
# OS: Raspberry Pi OS (Debian 12 Bookworm / Bullseye, 64-bit recommended)
# ==============================================================================

set -e

echo "================================================================="
echo "⚡ ESP32 AI Forge: Setting up Raspberry Pi 4 Server Environment"
echo "================================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$ROOT_DIR/server"
BIN_DIR="$ROOT_DIR/bin"

mkdir -p "$BIN_DIR"
mkdir -p "$SERVER_DIR/workspace/esp32-01/cache"
mkdir -p "$SERVER_DIR/workspace/esp32-01/bin"

# 1. Update system packages
echo "[1/6] Updating apt packages and installing system tools..."
sudo apt-get update
sudo apt-get install -y curl git python3 python3-pip python3-serial tar bzip2 xz-utils build-essential

# 2. Install Node.js 20 LTS if not present
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
    echo "[2/6] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

# 3. Install arduino-cli (ARM64 / ARMv7 compatible)
echo "[3/6] Installing Arduino CLI..."
if [ ! -f "$BIN_DIR/arduino-cli" ]; then
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR="$BIN_DIR" sh
fi
export PATH="$BIN_DIR:$PATH"
echo "Arduino CLI version: $($BIN_DIR/arduino-cli version)"

# 4. Configure ESP32 Core & Libraries
echo "[4/6] Installing ESP32 Board Core (3.1.1) and Libraries..."
$BIN_DIR/arduino-cli config init --overwrite
$BIN_DIR/arduino-cli config set board_manager.additional_urls "https://espressif.github.io/arduino-esp32/package_esp32_index.json"
$BIN_DIR/arduino-cli core update-index
$BIN_DIR/arduino-cli core install esp32:esp32@3.1.1
$BIN_DIR/arduino-cli lib install "WebSockets" "ArduinoJson"

# 5. Install Node Dependencies
echo "[5/6] Installing Node.js backend dependencies..."
cd "$SERVER_DIR"
npm install

# Create default .env if missing
if [ ! -f "$SERVER_DIR/.env" ]; then
    cp "$SERVER_DIR/.env.example" "$SERVER_DIR/.env" || true
    echo "Created $SERVER_DIR/.env from template."
fi

# 6. Pre-warm ESP32 Compilation Cache on Raspberry Pi 4
echo "[6/6] Pre-warming ESP32 compilation cache for instant 3-second builds..."
cp -r "$ROOT_DIR/firmware/include/"* "$SERVER_DIR/workspace/esp32-01/" 2>/dev/null || true
cat << 'EOF' > "$SERVER_DIR/workspace/esp32-01/esp32-01.ino"
#include "GuardianConfig.h"
#include "GuardianAgent.h"
void setup() {}
void loop() { vTaskDelay(pdMS_TO_TICKS(100)); }
EOF

# Multi-core compile using 2 jobs for optimal Pi 4 performance
$BIN_DIR/arduino-cli compile --fqbn esp32:esp32:esp32 \
    --build-path "$SERVER_DIR/workspace/esp32-01/cache" \
    --output-dir "$SERVER_DIR/workspace/esp32-01/bin" \
    --jobs 2 "$SERVER_DIR/workspace/esp32-01"

echo ""
echo "================================================================="
echo "✅ Installation Complete! Raspberry Pi 4 is ready to run AI Forge."
echo "================================================================="
echo "Next steps:"
echo " 1. Configure your Gemini API key in: $SERVER_DIR/.env"
echo " 2. Start server manually:           bash $SCRIPT_DIR/start.sh"
echo " 3. Enable 24/7 background service:  sudo bash $SCRIPT_DIR/install_service.sh"
echo " 4. Get worldwide HTTPS access:      bash $SCRIPT_DIR/setup_cloudflare_tunnel.sh"
echo "================================================================="
