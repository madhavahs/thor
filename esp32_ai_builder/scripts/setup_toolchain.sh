#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$ROOT_DIR/bin"
mkdir -p "$BIN_DIR"

if ! command -v arduino-cli &> /dev/null && [ ! -f "$BIN_DIR/arduino-cli" ]; then
    echo "Downloading arduino-cli..."
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR="$BIN_DIR" sh
fi

export PATH="$BIN_DIR:$PATH"
CLI="arduino-cli"

echo "Configuring Arduino CLI with ESP32 board manager..."
$CLI config init --overwrite
$CLI config set board_manager.additional_urls "https://espressif.github.io/arduino-esp32/package_esp32_index.json"
$CLI core update-index
$CLI core install esp32:esp32@3.1.1
echo "Toolchain setup complete!"
$CLI version
