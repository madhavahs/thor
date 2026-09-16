# 🥧 Complete Zero-to-Hero Raspberry Pi 4 Setup & Deployment Guide
## ESP32 Worldwide AI Forge & Remote Fleet Manager

This guide covers **every single step from scratch**: from unboxing your Raspberry Pi, installing Git, setting up the AI compiler, running the 24/7 background service, setting up free worldwide HTTPS access, to flashing the ESP32.

---

## 📑 Table of Contents
1. [Prerequisites & Hardware Needed](#1-prerequisites--hardware-needed)
2. [Phase 1: First-Time Raspberry Pi Boot & Wi-Fi Setup](#phase-1-first-time-raspberry-pi-boot--wi-fi-setup)
3. [Phase 2: Updating the System & Installing Git](#phase-2-updating-the-system--installing-git)
4. [Phase 3: Cloning the Repository](#phase-3-cloning-the-repository)
5. [Phase 4: Automated 1-Click Installation](#phase-4-automated-1-click-installation)
   - *(Optional: Manual Step-by-Step Installation)*
6. [Phase 5: Configuring Your Gemini AI Key](#phase-5-configuring-your-gemini-ai-key)
7. [Phase 6: Testing the Server Locally](#phase-6-testing-the-server-locally)
8. [Phase 7: Running 24/7 as a Background Service (Auto-Start on Boot)](#phase-7-running-247-as-a-background-service-auto-start-on-boot)
9. [Phase 8: Worldwide Public HTTPS/WSS Access (Cloudflare Tunnel)](#phase-8-worldwide-public-httpswss-access-cloudflare-tunnel)
10. [Phase 9: Configuring & Flashing the ESP32](#phase-9-configuring--flashing-the-esp32)
11. [Phase 10: Using the Web Studio (AI, GPIOs, Sensors & OTA)](#phase-10-using-the-web-studio-ai-gpios-sensors--ota)
12. [Troubleshooting & Handy Commands](#troubleshooting--handy-commands)

---

## 1. Prerequisites & Hardware Needed

- **Raspberry Pi 4 Model B** (2GB, 4GB, or 8GB RAM).
- **MicroSD Card** (16GB or larger, Class 10 / A1 or A2).
- **USB-C Power Supply** (Official 5V 3A recommended).
- **ESP32 DevKit board** (ESP32-WROOM-32 or ESP32 Dev Module) + MicroUSB/Type-C cable.
- A free **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
- Laptop/PC with **Arduino IDE** installed.

---

## Phase 1: First-Time Raspberry Pi Boot & Wi-Fi Setup

1. Flash your MicroSD card using the official [Raspberry Pi Imager](https://www.raspberrypi.com/software/):
   - **Device**: Raspberry Pi 4.
   - **OS**: Raspberry Pi OS (64-bit) (Recommended: Bookworm).
   - In the gear icon (Settings): set your username (e.g. `pi`), password, your Wi-Fi SSID & password, and enable **SSH**.
2. Insert the MicroSD card into the Pi and plug in the power supply.
3. Find your Raspberry Pi's IP address:
   - On the Pi directly: open a terminal and run `hostname -I`.
   - Or from your PC: use your home router admin page or run `ping -4 raspberrypi.local` in Windows PowerShell.
4. Open PowerShell or Terminal on your PC and SSH into the Pi:
   ```bash
   ssh pi@raspberrypi.local
   # Or using IP:
   ssh pi@192.168.1.50
   ```
   *(Enter your password when prompted).*

---

## Phase 2: Updating the System & Installing Git

Ensure your package list is up-to-date, then install `git` and essential build packages:

```bash
# Update package repositories
sudo apt-get update && sudo apt-get upgrade -y

# Install git, curl, and python build prerequisites
sudo apt-get install -y git curl build-essential python3 python3-pip python3-serial
```

Verify Git is installed:
```bash
git --version
# Expected output: git version 2.39.x or higher
```

---

## Phase 3: Cloning the Repository

Clone the project directly into your Raspberry Pi user home directory:

```bash
cd ~
git clone https://github.com/madhavahs/esp32-ai-builder.git
cd esp32-ai-builder
```

---

## Phase 4: Automated 1-Click Installation

We have created an automated setup script that does everything in one command:

```bash
cd ~/esp32-ai-builder/raspberry_pi
chmod +x *.sh
bash install.sh
```

### ☕ What the script does automatically (Takes ~3–5 minutes):
1. Installs Node.js 20 LTS (NodeSource repository).
2. Downloads the official Linux ARM64 binary of `arduino-cli` into `~/esp32-ai-builder/bin/`.
3. Configures Arduino CLI with the official Espressif ESP32 package URL.
4. Installs the ESP32 Arduino Core 3.1.1.
5. Installs `WebSockets` and `ArduinoJson` libraries.
6. Installs Node.js npm packages in `server/`.
7. **Pre-warms the compilation cache on the Pi**: It compiles a baseline ESP32 sketch once during setup. This creates the compiled core cache (`core.a`), so all your future sketch compiles take only **3 to 5 seconds**!

---

### *(Optional Reference: Manual Commands)*
<details>
<summary>Click here if you prefer to run each step manually instead of running install.sh</summary>

```bash
# 1. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install arduino-cli ARM64
mkdir -p ~/esp32-ai-builder/bin
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR="$HOME/esp32-ai-builder/bin" sh

# 3. Configure ESP32 Core
export PATH="$HOME/esp32-ai-builder/bin:$PATH"
arduino-cli config init --overwrite
arduino-cli config set board_manager.additional_urls "https://espressif.github.io/arduino-esp32/package_esp32_index.json"
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.1.1
arduino-cli lib install "WebSockets" "ArduinoJson"

# 4. Install Server npm modules
cd ~/esp32-ai-builder/server
npm install
```
</details>

---

## Phase 5: Configuring Your Gemini AI Key

1. Copy the template `.env` file if not already created:
   ```bash
   cp ~/esp32-ai-builder/server/.env.example ~/esp32-ai-builder/server/.env
   ```
2. Open the file in the nano editor:
   ```bash
   nano ~/esp32-ai-builder/server/.env
   ```
3. Enter your values:
   ```env
   PORT=3000
   GEMINI_API_KEY="YOUR_ACTUAL_GEMINI_API_KEY"
   GEMINI_MODEL=gemini-2.0-flash
   DEVICE_AUTH_TOKEN=super_secret_device_token_12345
   WORKSPACE_DIR=./workspace
   ```
4. Save and exit: press `Ctrl + O`, hit `Enter`, then press `Ctrl + X`.

---

## Phase 6: Testing the Server Locally

Before setting up background daemons, let's run the server once interactively to verify it:

```bash
cd ~/esp32-ai-builder/raspberry_pi
bash start.sh
```

You should see:
```text
🚀 Starting ESP32 AI Forge Server on port 3000...
[ESP32 AI FORGE] Server listening worldwide on port 3000
```

Now open a browser on your PC, tablet, or phone (connected to the same Wi-Fi network) and navigate to:
```text
http://<RASPBERRY_PI_IP>:3000
```
*(Example: `http://192.168.1.50:3000`)*

The **ESP32 Worldwide AI Forge Studio** will load in your browser!
Press `Ctrl + C` in your terminal to stop the interactive test.

---

## Phase 7: Running 24/7 as a Background Service (Auto-Start on Boot)

To make your Raspberry Pi operate as a dedicated 24/7 IoT server that boots automatically when plugged in:

```bash
cd ~/esp32-ai-builder/raspberry_pi
sudo bash install_service.sh
```

### Useful Management Commands:
```bash
# Check if service is active and running
sudo systemctl status esp32-forge.service

# View live real-time server logs as devices connect or compile
sudo journalctl -u esp32-forge.service -f

# Restart service
sudo systemctl restart esp32-forge.service

# Stop service
sudo systemctl stop esp32-forge.service
```

---

## Phase 8: Worldwide Public HTTPS/WSS Access (Cloudflare Tunnel)

To access your Raspberry Pi from **anywhere in the world** (outside your home network) and allow your ESP32 to connect securely over HTTPS/WSS without opening router ports:

Run the automated Cloudflare helper:
```bash
cd ~/esp32-ai-builder/raspberry_pi
bash setup_cloudflare_tunnel.sh
```

1. Select **Option 1 (Quick Tunnel)**.
2. Cloudflare will start an encrypted outbound tunnel to port 3000 and give you a public URL:
   ```text
   https://xxxxxxxx-xxxx-xxxx.trycloudflare.com
   ```

*(You can also run it in the background using `nohup cloudflared tunnel --url http://localhost:3000 > /tmp/tunnel.log 2>&1 &`)*.

---

## Phase 9: Configuring & Flashing the ESP32

Now configure your ESP32 so it connects to your Raspberry Pi.

1. On your Windows PC, open **Arduino IDE**.
2. Open [`firmware/ESP32_Guardian_Firmware/ESP32_Guardian_Firmware.ino`](file:///D:/antigravity/Project1/esp32_ai_builder/firmware/ESP32_Guardian_Firmware/ESP32_Guardian_Firmware.ino).
3. Click on the **`GuardianConfig.h`** tab.
4. Set your configuration:

### Choice A: For Local Network (Home Wi-Fi only)
```cpp
#define GUARDIAN_WIFI_SSID    "YOUR_HOME_WIFI_NAME"
#define GUARDIAN_WIFI_PASS    "YOUR_WIFI_PASSWORD"
#define GUARDIAN_SERVER_HOST  "192.168.1.50"   // Your Raspberry Pi IP
#define GUARDIAN_SERVER_PORT  3000             // Direct Node port
```

### Choice B: For Worldwide Cloudflare Tunnel Access
```cpp
#define GUARDIAN_WIFI_SSID    "YOUR_WIFI_NAME"
#define GUARDIAN_WIFI_PASS    "YOUR_WIFI_PASSWORD"
#define GUARDIAN_SERVER_HOST  "your-id.trycloudflare.com" // Cloudflare host without https://
#define GUARDIAN_SERVER_PORT  443              // Standard WSS port
```

5. Connect your ESP32 via USB.
6. Select **Tools > Board: "ESP32 Dev Module"** and select your **COM Port**.
7. Click **Upload** (Arrow icon).

---

## Phase 10: Using the Web Studio (AI, GPIOs, Sensors & OTA)

1. Open your browser to `http://<PI_IP>:3000` (or your Cloudflare URL).
2. Look at the top right:
   - When the ESP32 boots and connects, the badge changes to:
     **`● ESP32 Online`**

### What You Can Do:

#### 1. 🎛️ Live GPIO & Sensors Tab:
- **Instant Digital Control**: Click `ON / OFF` on GPIO 2 (LED) or any other GPIO pin — it switches with **0 ms delay**.
- **PWM Speed & Brightness**: Drag the slider on any pin (0 to 255) to adjust motor speed or LED brightness in real-time.
- **⚡ Scan All Sensors & Actuators**: Click this master button to query all digital pins and 6 analog sensor channels (GPIO 32, 33, 34, 35, 36, 39) with a single command.
- **🤖 AI Hardware Commander**: Type in English:
  - *"Turn on LED on pin 2 and set pin 4 PWM to 180"*
  - *"Read analog sensor on pin 34"*
  - *"Turn off all outputs"*
  Gemini translates it into hardware actions and executes them in milliseconds.

#### 2. 💻 AI Firmware Forge Tab:
- Type a project prompt: *"Read DHT22 on pin 4 and blink LED every 500ms"*.
- Click **✨ Generate with AI**: Gemini generates complete, production-ready embedded C++.
- Click **🚀 Compile & Flash OTA**:
  - The Raspberry Pi compiles the sketch in **~3 to 5 seconds** using the local build cache.
  - The binary streams over WebSocket to the ESP32.
  - The ESP32 flashes in ~5 seconds and reboots into the new firmware!

---

## Troubleshooting & Handy Commands

### Checking Service Logs on Raspberry Pi:
```bash
sudo journalctl -u esp32-forge.service -f
```

### Restarting the Server:
```bash
sudo systemctl restart esp32-forge.service
```

### ESP32 Serial Monitor Debugging:
Open Serial Monitor at **115200 baud** in Arduino IDE:
- You should see:
  ```text
  [BOOT] Starting ESP32 AI Dynamic Runtime Factory Image...
  [GUARDIAN] Connecting to Wi-Fi...
  [GUARDIAN] Wi-Fi Connected! IP: 192.168.1.105
  [GUARDIAN] Connecting to Cloud Hub: ws://192.168.1.50:3000/ws/device
  [GUARDIAN] Connected to Global Cloud Hub!
  ```

### Finding Raspberry Pi IP:
```bash
hostname -I
```

### Testing Gemini API Key from Pi Terminal:
```bash
node -e "require('dotenv').config({path:'server/.env'}); require('./server/src/ai/geminiClient').callGemini('Output JSON: {\"status\":\"ok\"}', 'test').then(console.log).catch(console.error);"
```
