#!/usr/bin/env bash
# Start script for ESP32 AI Forge on Raspberry Pi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$ROOT_DIR/server"
BIN_DIR="$ROOT_DIR/bin"

export PATH="$BIN_DIR:$PATH"
export ARDUINO_CLI_PATH="$BIN_DIR/arduino-cli"
export PORT="${PORT:-3000}"

cd "$SERVER_DIR"
echo "🚀 Starting ESP32 AI Forge Server on port $PORT..."
node server.js
