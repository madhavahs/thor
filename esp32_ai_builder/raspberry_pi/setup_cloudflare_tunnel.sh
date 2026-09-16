#!/usr/bin/env bash
# ==============================================================================
# Cloudflare Tunnel Setup for Raspberry Pi 4 (Worldwide Public HTTPS / WSS)
# Zero Port Forwarding | Works behind CGNAT / Home Wi-Fi | 100% Free
# ==============================================================================

set -e

echo "================================================================="
echo "🌐 Cloudflare Tunnel Setup: Exposing AI Forge to the Worldwide Web"
echo "================================================================="

# 1. Download and install cloudflared for ARM64 (Raspberry Pi 4)
if ! command -v cloudflared &> /dev/null; then
    echo "Downloading cloudflared for Raspberry Pi ARM64..."
    ARCH=$(dpkg --print-architecture)
    if [ "$ARCH" = "arm64" ]; then
        curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o /tmp/cloudflared.deb
    else
        curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm.deb -o /tmp/cloudflared.deb
    fi
    sudo dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
fi

echo "cloudflared version: $(cloudflared --version)"

echo ""
echo "Choose tunnel mode:"
echo " 1) Quick Tunnel (Free, instant, no Cloudflare account required, gives a *.trycloudflare.com HTTPS URL)"
echo " 2) Persistent Tunnel (Requires free Cloudflare account & domain for permanent custom URL)"
read -p "Enter choice [1 or 2, default 1]: " CHOICE
CHOICE="${CHOICE:-1}"

if [ "$CHOICE" = "1" ]; then
    echo ""
    echo "Starting Quick Cloudflare Tunnel for http://localhost:3000..."
    echo "Look for the URL ending with '.trycloudflare.com' below:"
    echo "================================================================="
    cloudflared tunnel --url http://localhost:3000
else
    echo ""
    echo "To set up a permanent tunnel with your custom domain:"
    echo " 1. Run: cloudflared tunnel login"
    echo " 2. Run: cloudflared tunnel create esp32-forge"
    echo " 3. Route your domain: cloudflared tunnel route dns esp32-forge yourdomain.com"
    echo " 4. Run: cloudflared tunnel run esp32-forge"
fi
