# 🥧 ESP32 Worldwide AI Forge on Raspberry Pi 4 Model B

Complete from-scratch implementation and deployment guide for self-hosting the **ESP32 Worldwide AI Forge & Remote Fleet Manager** on a **Raspberry Pi 4 Model B**.

---

## 🌟 Why Raspberry Pi 4 is 10x Better Than Cloud Free Tiers (Render/Heroku)

| Feature | Render Free Tier | Raspberry Pi 4 Model B |
| :--- | :--- | :--- |
| **RAM** | 512 MB (Frequent OOM Crashes) | **2 GB / 4 GB / 8 GB** (Zero OOM Risk) |
| **CPU** | 0.1 vCPU (Throttled, 100s Timeouts) | **Quad-Core 64-bit ARM Cortex-A72 @ 1.8GHz** |
| **Build Cache** | Ephemeral (Lost on restart) | **Permanent Local SSD/SD Cache (3s Compiles)** |
| **Request Timeout** | 100-Second Hard Timeout (502/504) | **Unlimited (No Proxy Timeouts)** |
| **Cost** | Free with limits, $7/mo paid | **Free & Self-Owned (Uses ~3W Power)** |
| **Hardware Access** | Cloud only | **Can flash ESP32 via USB or OTA over Wi-Fi** |

---

## 🛠️ Prerequisites

1. **Raspberry Pi 4 Model B** (2GB, 4GB, or 8GB RAM).
2. **MicroSD Card** (16GB or larger, Class 10 / A1 or A2) with **Raspberry Pi OS (64-bit Bookworm recommended)**.
3. Power supply (Official 5V 3A USB-C).
4. Network connection (Wi-Fi or Ethernet connected to your home router).
5. A free **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).

---

## 🚀 Quick Start (Automated 1-Click Setup)

### Step 1: Transfer the Folder to Your Raspberry Pi

You can clone the repository directly on your Raspberry Pi:

```bash
cd ~
git clone https://github.com/madhavahs/esp32-ai-builder.git
cd esp32-ai-builder
```

*(Alternatively, if copying from Windows via SCP or USB drive, copy the `esp32_ai_builder` folder to `~/esp32-ai-builder` on your Pi).*

---

### Step 2: Run the Automated Installer

Run the installer script located in `raspberry_pi/`:

```bash
cd ~/esp32-ai-builder/raspberry_pi
chmod +x *.sh
bash install.sh
```

**What the installer does automatically:**
1. Installs system build tools (`python3-serial`, `curl`, `git`).
2. Installs Node.js 20 LTS.
3. Installs `arduino-cli` (official Linux ARM64 binary).
4. Installs ESP32 Arduino Core 3.1.1 and required libraries (`WebSockets`, `ArduinoJson`).
5. Installs npm packages in `server/`.
6. **Pre-warms the ESP32 compilation cache** on your Pi so subsequent sketch compiles take only **3 to 5 seconds**!

---

### Step 3: Add Your Gemini API Key

Open the `.env` file in the server directory:

```bash
nano ~/esp32-ai-builder/server/.env
```

Set your Gemini API key:
```env
PORT=3000
GEMINI_API_KEY="YOUR_ACTUAL_GEMINI_API_KEY"
GEMINI_MODEL=gemini-2.0-flash
DEVICE_AUTH_TOKEN=super_secret_device_token_12345
WORKSPACE_DIR=./workspace
```
Press `Ctrl + O` then `Enter` to save, and `Ctrl + X` to exit.

---

### Step 4: Start the Server

#### Option A: Interactive Test (Console Output)
```bash
cd ~/esp32-ai-builder/raspberry_pi
bash start.sh
```
Open your browser on any laptop or phone connected to the same Wi-Fi network:
```text
http://<YOUR_PI_IP_ADDRESS>:3000
```
*(Find your Pi's IP by running `hostname -I` on the Pi).*

---

#### Option B: 24/7 Background System Service (Auto-Start on Boot)
To run the server permanently in the background:

```bash
cd ~/esp32-ai-builder/raspberry_pi
sudo bash install_service.sh
```

Useful service management commands:
```bash
# Check status
sudo systemctl status esp32-forge.service

# View live real-time server logs
sudo journalctl -u esp32-forge.service -f

# Restart server
sudo systemctl restart esp32-forge.service

# Stop server
sudo systemctl stop esp32-forge.service
```

---

## 🌐 Worldwide Access: Exposing Your Pi to the Internet (Free HTTPS/WSS)

To access your Raspberry Pi studio from **anywhere in the world** and allow your ESP32 to connect across any network without router port forwarding, use **Cloudflare Tunnel**:

```bash
cd ~/esp32-ai-builder/raspberry_pi
bash setup_cloudflare_tunnel.sh
```

Select **Option 1 (Quick Tunnel)**. Cloudflare will instantly generate a free, secure public HTTPS URL:
```text
https://xxxxxxxx-xxxx-xxxx.trycloudflare.com
```

- **Zero Router Configuration**: Works through CGNAT, 4G/5G mobile hotspots, and double-NAT home routers.
- **Full WSS Support**: WebSocket tunnel for ESP32 and browser works worldwide.
- **Encrypted TLS**: Cloudflare provides free SSL certificates automatically.

---

## ⚡ Connecting Your ESP32 to Your Raspberry Pi

In [`firmware/ESP32_Guardian_Firmware/GuardianConfig.h`](file:///D:/antigravity/Project1/esp32_ai_builder/firmware/ESP32_Guardian_Firmware/GuardianConfig.h):

### For Local Home Network Access:
```cpp
#define GUARDIAN_WIFI_SSID    "YOUR_HOME_WIFI"
#define GUARDIAN_WIFI_PASS    "YOUR_WIFI_PASSWORD"
#define GUARDIAN_SERVER_HOST  "192.168.1.50"   // Your Raspberry Pi's local IP address
#define GUARDIAN_SERVER_PORT  3000             // Direct Node port
```

### For Worldwide Cloudflare Tunnel Access:
```cpp
#define GUARDIAN_WIFI_SSID    "YOUR_WIFI"
#define GUARDIAN_WIFI_PASS    "YOUR_PASSWORD"
#define GUARDIAN_SERVER_HOST  "your-tunnel-name.trycloudflare.com" // Your Cloudflare Tunnel host
#define GUARDIAN_SERVER_PORT  443              // Standard HTTPS/WSS port
```

Upload [`ESP32_Guardian_Firmware.ino`](file:///D:/antigravity/Project1/esp32_ai_builder/firmware/ESP32_Guardian_Firmware/ESP32_Guardian_Firmware.ino) to your ESP32 via USB.

> [!NOTE]
> **Automatic WS/WSS Transport Switch**:
> The firmware automatically inspects `GUARDIAN_SERVER_PORT`. Port `3000` (LAN) connects using plain WebSocket (`ws://`), while port `443` (Cloudflare Tunnel) connects using secure TLS (`wss://`). No manual code edits required!

---

## 🔄 How to Update the Server (After Git Commits)

Whenever new features or bug fixes are published, updating your Raspberry Pi takes just one command:

### 1-Click Update:
```bash
cd ~/esp32-ai-builder
bash raspberry_pi/update.sh
```

### Manual Terminal Update:
```bash
cd ~/esp32-ai-builder
git pull origin main
cd server && npm install --production
sudo systemctl restart esp32-forge.service
```

---

## 🎛️ Features Available on Your Raspberry Pi Hub

1. **💻 AI Firmware Studio**: Type natural language prompts to write embedded C++ code with Gemini, automatically inject Guardian background tasks, compile with local `arduino-cli`, and deploy via OTA.
2. **🎛️ Live GPIO Matrix**: Instant toggle for digital outputs, PWM sliders (0–255), and digital pin reads.
3. **📊 Real-time ADC Sensor Gauges**: Live 12-bit ADC reads (0–4095) with voltage calculation (0.00V–3.30V) for GPIO 32, 33, 34, 35, 36, 39.
4. **⚡ One-Click Master Scan (`SCAN_ALL_PINS`)**: Query every pin and sensor simultaneously with a single button.
5. **🤖 AI Hardware Commander**: Tell AI *"Turn on LED on pin 2 and read temperature sensor on pin 34"* to command hardware in real time!

---

## 🛠️ Quick Troubleshooting

- **ESP32 loops `Disconnected from Global Cloud Hub`**:
  Make sure you ran the update script (`bash raspberry_pi/update.sh`) and re-flashed the ESP32. In `GuardianConfig.h`, ensure `GUARDIAN_SERVER_PORT` is set to `3000` for local network IP, or `443` for Cloudflare Tunnel.
- **Check Server Logs**:
  `sudo journalctl -u esp32-forge.service -f`
- **Restart Server Service**:
  `sudo systemctl restart esp32-forge.service`
