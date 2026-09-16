#!/usr/bin/env bash
# Install systemd service for 24/7 background operation on Raspberry Pi
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use: sudo bash install_service.sh)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ACTUAL_USER="${SUDO_USER:-$USER}"

SERVICE_FILE="/etc/systemd/system/esp32-forge.service"

echo "Creating systemd service at $SERVICE_FILE..."
cat << EOF > "$SERVICE_FILE"
[Unit]
Description=ESP32 Worldwide AI Forge & Fleet Manager
After=network.target

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$ROOT_DIR/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=PATH=$ROOT_DIR/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=ARDUINO_CLI_PATH=$ROOT_DIR/bin/arduino-cli
Environment=WORKSPACE_DIR=$ROOT_DIR/server/workspace

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable esp32-forge.service
systemctl restart esp32-forge.service

echo "✅ esp32-forge.service installed and started!"
echo "Check service status: sudo systemctl status esp32-forge.service"
echo "View live server logs: sudo journalctl -u esp32-forge.service -f"
