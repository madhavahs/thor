#!/usr/bin/env bash
# ==============================================================================
# ⚡ ESP32 Worldwide AI Forge - Master 1-Click Setup for Raspberry Pi 4
#
# Usage (run this single line on your Raspberry Pi):
#   curl -fsSL https://raw.githubusercontent.com/madhavahs/thor/main/esp32_ai_builder/raspberry_pi/setup.sh | bash
#
# Or with API key directly:
#   GEMINI_API_KEY="your_api_key" curl -fsSL https://raw.githubusercontent.com/madhavahs/thor/main/esp32_ai_builder/raspberry_pi/setup.sh | bash
# ==============================================================================

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${GREEN}${BOLD}"
cat << "EOF"
  _____ ____  ____ _____ ____      _    ___   _____ ___  ____   ____ _____ 
 | ____/ ___||  _ \___ /|___ \    / \  |_ _| |  ___/ _ \|  _ \ / ___| ____|
 |  _| \___ \| |_) ||_ \  __) |  / _ \  | |  | |_ | | | | |_) | |  _|  _|  
 | |___ ___) |  __/___) |/ __/  / ___ \ | |  |  _|| |_| |  _ <| |_| | |___ 
 |_____|____/|_|  |____/|_____|/_/   \_\___| |_|   \___/|_| \_\\____|_____|
EOF
echo -e "${CYAN}⚡ ESP32 Worldwide AI Forge: Complete 1-Click Raspberry Pi Setup${NC}"
echo -e "${CYAN}===================================================================${NC}\n"

# 1. Determine Working Directory
REPO_URL="https://github.com/madhavahs/thor.git"

if [ -f "./server/server.js" ] && [ -d "./raspberry_pi" ]; then
  # Already in esp32_ai_builder directory
  APP_DIR="$(pwd)"
elif [ -d "./esp32_ai_builder/server" ]; then
  # In root repo directory
  APP_DIR="$(pwd)/esp32_ai_builder"
else
  # Running from curl on fresh Raspberry Pi
  TARGET_DIR="$HOME/esp32-ai-forge"
  echo -e "${CYAN}[Step 1/5] Cloning repository into $TARGET_DIR...${NC}"
  if [ -d "$TARGET_DIR" ]; then
    echo -e "${YELLOW}Existing directory found at $TARGET_DIR. Updating...${NC}"
    cd "$TARGET_DIR"
    git pull origin main || true
  else
    sudo apt-get update -qq
    sudo apt-get install -y -qq git curl
    git clone "$REPO_URL" "$TARGET_DIR"
  fi
  APP_DIR="$TARGET_DIR/esp32_ai_builder"
fi

cd "$APP_DIR"
echo -e "${GREEN}✓ Application directory: $APP_DIR${NC}\n"

# 2. Run Automated Toolchain & Node Installer
echo -e "${CYAN}[Step 2/5] Installing Node.js, Arduino CLI, ESP32 Core & Dependencies...${NC}"
chmod +x raspberry_pi/*.sh
bash raspberry_pi/install.sh

# 3. Configure Gemini API Key
echo -e "\n${CYAN}[Step 3/5] Configuring Environment Variables...${NC}"
ENV_FILE="$APP_DIR/server/.env"
mkdir -p "$(dirname "$ENV_FILE")"

if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/server/.env.example" "$ENV_FILE" || true
fi

# Check if GEMINI_API_KEY was passed as env variable or exists
EXISTING_KEY=$(grep -E '^GEMINI_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)

if [ -n "$GEMINI_API_KEY" ]; then
  sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=\"$GEMINI_API_KEY\"|" "$ENV_FILE"
  echo -e "${GREEN}✓ Set GEMINI_API_KEY from environment.${NC}"
elif [ -z "$EXISTING_KEY" ] || [ "$EXISTING_KEY" = "your_google_gemini_api_key_here" ]; then
  if [ -t 0 ]; then
    echo -e "${YELLOW}Please enter your Google Gemini API Key (or press ENTER to configure later):${NC}"
    read -r USER_KEY
    if [ -n "$USER_KEY" ]; then
      sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=\"$USER_KEY\"|" "$ENV_FILE"
      echo -e "${GREEN}✓ Gemini API key saved to server/.env${NC}"
    else
      echo -e "${YELLOW}ℹ Key skipped. Remember to edit $ENV_FILE before using AI generation.${NC}"
    fi
  else
    echo -e "${YELLOW}ℹ Running non-interactively. Set GEMINI_API_KEY in $ENV_FILE.${NC}"
  fi
else
  echo -e "${GREEN}✓ Existing GEMINI_API_KEY preserved in server/.env.${NC}"
fi

# 4. Install and Enable 24/7 Systemd Background Service
echo -e "\n${CYAN}[Step 4/5] Installing 24/7 Background Systemd Service (esp32-forge.service)...${NC}"
sudo bash raspberry_pi/install_service.sh

# 5. Detect Local IP Address
PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

echo -e "\n${GREEN}${BOLD}===================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 SUCCESS! ESP32 Worldwide AI Forge is now running 24/7 on your Pi!${NC}"
echo -e "${GREEN}${BOLD}===================================================================${NC}\n"

echo -e "${BOLD}🌐 Open the Minimalist Web Studio in any browser on your Wi-Fi:${NC}"
echo -e "   ${CYAN}${BOLD}http://${PI_IP}:3000${NC}\n"

echo -e "${BOLD}📱 Connect your ESP32 in ${CYAN}firmware/include/GuardianConfig.h${NC}:${BOLD}${NC}"
echo -e "   #define GUARDIAN_SERVER_HOST  \"${PI_IP}\""
echo -e "   #define GUARDIAN_SERVER_PORT  3000\n"

echo -e "${BOLD}🌍 Enable Free Worldwide Access (Cloudflare HTTPS/WSS Tunnel):${NC}"
echo -e "   ${CYAN}cd $APP_DIR && bash raspberry_pi/setup_cloudflare_tunnel.sh${NC}\n"

echo -e "${BOLD}🔄 1-Click Update from GitHub (after new commits):${NC}"
echo -e "   ${CYAN}cd $APP_DIR && bash raspberry_pi/update.sh${NC}\n"

echo -e "${BOLD}📊 Service Monitoring:${NC}"
echo -e "   Status: ${CYAN}sudo systemctl status esp32-forge.service${NC}"
echo -e "   Logs:   ${CYAN}sudo journalctl -u esp32-forge.service -f${NC}\n"
echo -e "${GREEN}===================================================================${NC}"
