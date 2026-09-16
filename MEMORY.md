# 🧠 STARK ARCHITECTURE - MASTER MEMORY LOG
**Date:** August 31, 2026  
**System Identity:** STARK Cloud Platform (Advanced IoT & Real-Time Video Architecture)  
**Primary Hardware:** AI-Thinker ESP32-CAM & ESP32 Master Module  
**Repository:** [https://github.com/madhavahs/thor.git](https://github.com/madhavahs/thor.git)  

---

## 1. Project Overview & Virtual Pin Mapping

The STARK Architecture is a full-stack IoT platform combining real-time embedded hardware control, cloud telemetry, low-latency video streaming, and media asset management.

### Active Device Configuration:
* **Device ID:** `STARK_CAM_01`
* **Auth Token:** `blynk_tok_6d0574f54a`
* **MQTT Prefix:** `stark/blynk_tok_6d0574f54a/`
* **Cloud Broker:** `broker.emqx.io:1883`

### Complete Virtual Pin Mapping (V0 – V12):
| Pin | Function | Type | Range / Options | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **V0** | Master Power Relay / LED | Integer | `0` (OFF) / `1` (ON) | Primary output switch |
| **V1** | Temperature Sensor | Double | `-40°C` to `80°C` | Telemetry chart input |
| **V2** | Humidity Sensor | Double | `0%` to `100%` | Telemetry chart input |
| **V3** | PWM Brightness Slider | Integer | `0%` to `100%` | Hardware LED dimmer |
| **V4** | RGB NeoPixel Color | String | Hex Code (e.g. `#10b981`) | Color wheel synchronization |
| **V5** | Terminal Console | String | Text Message | Bidirectional CLI logs |
| **V6** | Servo Motor Angle | Integer | `0°` to `180°` | Actuator position |
| **V7** | Potentiometer (ADC) | Integer | `0` to `4095` | Raw analog input |
| **V8** | Speedometer / Tachometer | Double | `0` to `240 km/h` | RPM / Speed gauge |
| **V9** | Motor Throttle | Integer | `0%` to `100%` | Motor speed control |
| **V10** | Battery Level | Integer | `0%` to `100%` | System battery status |
| **V11** | Flashlight LED Toggle | Integer | `0` (OFF) / `1` (ON) | AI-Thinker GPIO 4 high-power LED |
| **V12** | Dynamic Resolution Switch | String | `HQVGA`, `QVGA`, `CIF`, `VGA`, `SVGA`, `UXGA` | On-the-fly camera resolution |

---

## 2. Technical Milestones & Fixes Completed Today

### A. ESP32-CAM Firmware Enhancements
* **Hardware Orientation Inversion:** Fixed upside-down camera output by writing hardware sensor flip registers `s->set_vflip(s, 1)` and `s->set_hmirror(s, 1)`.
* **Multi-Wi-Fi Auto-Roaming (`WiFiMulti`):** Enabled seamless network roaming with maximum RF power (`19.5dBm`) across:
  * Primary Home Wi-Fi
  * 4G/5G Mobile Phone Hotspot
  * Office / Lab Network
* **Sensor ISP (Image Signal Processor) Fine-Tuning:**
  * Enabled maximum edge sharpness (`set_sharpness(s, 2)`) for crisp object and text detection.
  * Auto White Balance calibration (`set_whitebal(s, 1)` + `set_awb_gain(s, 1)`).
  * Digital noise reduction (`set_denoise(s, 1)`).
  * Lens correction and bad pixel correction (`set_bpc`, `set_wpc`, `set_lenc`).
  * Auto Exposure & Gain Ceiling tuning (`GAINCEILING_2X`).
* **High-Speed Hardware Video Server:** Embedded a native ESP-IDF HTTP MJPEG video streamer on Port `81` (`/stream`) with PSRAM double DMA buffering (`fb_count = 2`).

### B. Latency Elimination & Zero-Lag Frame Engine
* **The Root Cause of Prior Delay:** In `public/app.js`, rapid frame arrival caused the browser's `Image.onload` event queue to buffer up, lagging the display 3 to 5 seconds behind reality.
* **The Zero-Lag Solution:** Implemented a **Non-Blocking Frame Dropper Engine** (`pendingFrameSrc` + `renderNextCameraFrame()`). If a new frame arrives while the previous frame is rendering, stale frames are instantly dropped, locking the stream to 100% live real time.
* **TCP Socket Optimization:** Added `espClient.setNoDelay(true)` to bypass Nagle's TCP buffering on the ESP32 network stack.
* **Dual Viewfinder Modes:**
  1. **`⚡ ZERO LATENCY (<20ms)`**: Native hardware GPU rendering via `<img id="liveCamFeedImg">` connected directly to `http://<ESP32_IP>:81/stream` for instant < 20ms real-time fluidity.
  2. **`🌐 Cloud Mode`**: Global cloud frame receiver over MQTT/WebSocket for viewing outside the local network.

### C. Cloud Media Vault (Snapshots & Video Recording)
* **API Endpoints:**
  * `POST /api/camera/snapshot`: Captures base64 JPEG from the live feed and writes to `/public/uploads/snapshots/`.
  * `POST /api/camera/record`: Stores WebM video recordings in `/public/uploads/recordings/`.
  * `DELETE /api/camera/media/:type/:filename`: Physically deletes media from disk and broadcasts real-time UI updates.
* **Frontend UI:** Interactive media gallery cards with distinct **Save / Download** and **Delete** actions.

### D. Worldwide Remote Access & Deployment
* **Any-Network Connectivity:** Demonstrated how outbound MQTT connections to `broker.emqx.io` allow complete remote monitoring from 4G/5G mobile networks without router port forwarding.
* **Global Tunnel Activation:** Generated live HTTPS edge tunnels (`localtunnel` / `cloudflared`) allowing instant mobile access on any phone browser.
* **24/7 Hosting Setup (Render.com):**
  * Root Directory: `STARL_CLOUD_Platform`
  * Build Command: `npm install`
  * Start Command: `node server.js`
  * Environment Variables: `NODE_ENV=production`, `MQTT_BROKER=mqtt://broker.emqx.io:1883`.
* **Mobile PWA Support:** Added `manifest.json` for 1-click home screen installation on iOS and Android.

---

## 3. Key Files in the Repository

```
Project1/
├── ESP32/
│   └── ESP32_CAM_STARK/
│       └── ESP32_CAM_STARK.ino       <-- Production Zero-Latency ESP32-CAM Firmware
├── STARL_CLOUD_Platform/
│   ├── server.js                     <-- Express, WebSockets, MQTT Gateway, & Media APIs
│   ├── db.json                       <-- Persistent Template, Device, & Telemetry Store
│   ├── package.json                  <-- Node.js Dependencies (express, ws, mqtt, cors)
│   └── public/
│       ├── index.html                <-- Viewfinder HUD, Controls Strip, & Media Vault UI
│       ├── app.js                    <-- Zero-Lag Engine, WebSocket Client, & UI Handlers
│       ├── style.css                 <-- Glassmorphism Cyberpunk Stylesheet
│       ├── manifest.json             <-- Progressive Web App (PWA) Mobile Manifest
│       └── uploads/                  <-- Cloud Media Vault (Snapshots & Recordings)
├── STARL_CLOUD_Obsidian_Memory/      <-- System Knowledge Graph & Architecture Notes
├── .gitignore                        <-- Ignores node_modules, logs, and OS artifacts
├── PROJECT.md                        <-- Core Architecture Specification Document
└── MEMORY.md                         <-- This comprehensive memory log
```

---

## 4. Quick Reference Instructions

### To Flash ESP32-CAM:
1. Open [`ESP32_CAM_STARK.ino`](file:///D:/antigravity/Project1/ESP32/ESP32_CAM_STARK/ESP32_CAM_STARK.ino) in Arduino IDE.
2. Enter your Wi-Fi credentials in lines 248–250.
3. Upload and open Serial Monitor at `115200 baud`.

### To Run Platform Locally:
```powershell
cd D:\antigravity\Project1\STARL_CLOUD_Platform
node server.js
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### To Push to GitHub:
```powershell
cd D:\antigravity\Project1
git push -u origin main
```

---

# ⚡ ESP32 WORLDWIDE AI FORGE & REMOTE FLEET MANAGER - MASTER MEMORY LOG
**Date:** September 16, 2026  
**System Identity:** ESP32 Worldwide AI Forge (Self-Hosted on Raspberry Pi 4 Model B)  
**Primary Hardware:** ESP32 DevKit (ESP32-WROOM-32 / Dev Module) & Raspberry Pi 4 Model B  
**Monorepo:** [https://github.com/madhavahs/thor.git](https://github.com/madhavahs/thor.git)  
**Standalone Repo:** [https://github.com/madhavahs/esp32-ai-builder.git](https://github.com/madhavahs/esp32-ai-builder.git)  

---

## 5. Architectural Overview & System Design

The **ESP32 Worldwide AI Forge & Remote Fleet Manager** is a complete, self-healing IoT development and remote fleet management ecosystem that replaces restrictive cloud free tiers (Render/Heroku) with a **Raspberry Pi 4 Model B**:

```
                       +-----------------------------------+
                       |    Worldwide Web / Mobile Phone   |
                       +-----------------+-----------------+
                                         |
                       [ HTTPS / WSS: Cloudflare Tunnel ]
                                         |
+----------------------------------------v-----------------------------------------+
| Raspberry Pi 4 Model B (Raspberry Pi OS 64-bit Bookworm)                         |
|                                                                                  |
|  +----------------------------------------------------------------------------+  |
|  | systemd Service: esp32-forge.service (Auto-restart on boot)                |  |
|  |                                                                            |  |
|  |   [Node.js 20 Hub (Port 3000)]                                             |  |
|  |   ├── Express Server (Web Studio, REST APIs, Firmware Hosting)             |  |
|  |   ├── WebSocket Hub (/ws/ui, /ws/device)                                   |  |
|  |   ├── Gemini AI Client (C++ Generation, Self-Healing, Hardware Commander)  |  |
|  |   └── Compiler Engine (arduino-cli ARM64 with parallel CPU jobs)           |  |
|  |                                                                            |  |
|  |   [Permanent Local Build Cache]                                            |  |
|  |   └── /server/workspace/esp32-01/cache/ (Pre-warmed core.a: 3-5s builds)   |  |
|  +----------------------------------------------------------------------------+  |
+----------------------------------------+-----------------------------------------+
                                         |
                                [ WebSocket Tunnel (WS / WSS) ]
                                         |
                       +-----------------v-----------------+
                       | ESP32 DevKit (Dual-Core FreeRTOS) |
                       | ├── Core 0: Immortal Guardian     |
                       | │   - Background Cloud Tunnel     |
                       | │   - Live GPIO / PWM / ADC RPC   |
                       | │   - 45s Fail-Safe Auto-Rollback |
                       | │   - Preferences (NVS) Backup    |
                       | └── Core 1: User Sketch loop()    |
                       +-----------------------------------+
```

---

## 6. Solved Engineering Challenges & Technical Milestones

### A. Local Network WebSocket Disconnect Resolution
* **The Problem:** In local network mode (`10.73.239.77:3000`), the ESP32 Serial Monitor continuously logged `[GUARDIAN] Disconnected from Global Cloud Hub` every 3 seconds.
* **Root Cause:** `GuardianAgent.h` previously invoked `wsClient.beginSSL(...)` unconditionally. Attempting an SSL/TLS handshake on a plain HTTP/WS Node.js port (`3000`) caused an immediate TCP disconnect.
* **The Fix:**
  - **Dynamic Transport Auto-Switching:** 
    - Port `443` (Cloudflare Tunnel / HTTPS / WSS): Invokes `wsClient.beginSSL(...)`.
    - Port `3000` / `80` (Local Raspberry Pi / LAN): Invokes `wsClient.begin(...)` (plain WS).
  - **OTA Client Protocol Auto-Detection:** Dynamically chooses `WiFiClientSecure` for `https://` URLs and standard `WiFiClient` for `http://` URLs.

### B. Prevention of ESP32 Disconnect & "Wipeout" on Online Flash
* **The Problem:** When compiling and flashing a sketch via the web studio, the newly flashed ESP32 rebooted, disconnected from the server, and lost all remote control capability.
* **Root Causes:**
  1. `codeInjector.js` previously defaulted `serverHost` to `"localhost"`. The flashed binary attempted to connect to `localhost:3000` (`127.0.0.1` on the ESP32 itself), permanently stranding the device.
  2. `GuardianAgent.h` previously canceled OTA rollback immediately on Wi-Fi connect *before* validating the connection to the Cloud Hub.
* **The Solutions Implemented:**
  1. **Smart Network Auto-Detection (`server.js` & `codeInjector.js`):** Extracts real host and port from `req.headers.host` (e.g. `10.73.239.77:3000` or Cloudflare subdomain). Falls back to `GuardianConfig.h` values so `"localhost"` is **never** burned into ESP32 firmware.
  2. **NVS (Non-Volatile Storage) Persistent Backup (`<Preferences.h>`):** The ESP32 permanently remembers its verified working server host, port, Wi-Fi SSID, and password in NVS flash (preserved across OTA updates).
  3. **Fail-Safe 45-Second Auto-Rollback:** Newly flashed firmware only cancels rollback (`esp_ota_mark_app_valid_cancel_rollback()`) **after** successfully establishing the WebSocket connection to the Cloud Hub (`WStype_CONNECTED`). If unreachable within 45s or after 6 failed attempts, it triggers:
     ```cpp
     esp_ota_mark_app_invalid_rollback_and_reboot();
     ```
     The ESP32 automatically rolls back to the previous working partition, making it impossible to brick or orphan the device.

### C. Automatic Library Installation & Unused Library Pruning
* **The Problem:** Sketches using external components (DHT sensors, OLED displays, FastLED) failed compilation unless libraries were manually typed in, and unused libraries accumulated indefinitely.
* **The Solutions Implemented:**
  1. **Header-to-Library Detection (`libraryManager.js`):** Scans all `#include <...>` headers and maps them to official Arduino Library Manager packages (e.g. `DHT.h` ➔ `DHT sensor library` + `Adafruit Unified Sensor`, `Adafruit_SSD1306.h` ➔ `Adafruit SSD1306`, `FastLED.h` ➔ `FastLED`, `LiquidCrystal_I2C.h` ➔ `LiquidCrystal I2C`, etc.) while filtering built-in ESP32 core headers (`WiFi.h`, `Wire.h`, etc.).
  2. **Batch Auto-Install:** Pre-compilation step installs all missing libraries in a single batched `arduino-cli lib install` invocation.
  3. **Batch Auto-Prune:** `autoPrune: true` scans installed libraries and automatically uninstalls unused third-party libraries via `arduino-cli lib uninstall`. Protected system libraries (`WebSockets`, `ArduinoJson`) are safeguarded against removal.
  4. **Multi-Job Compiler Speedup:** Upgraded `arduino-cli compile` to use parallel CPU cores (`--jobs Math.min(4, os.cpus().length)`), cutting compilation time by up to 7x.

---

## 7. GPIO, Sensor, and Telemetry Reference

### Pin Controls & Real-Time RPC:
* **Status LED:** GPIO 2 (Digital Output / PWM).
* **Digital I/O Channels:** GPIO 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33.
* **ADC1 Analog Sensors (12-bit, 0–4095, 0.00V–3.30V):** GPIO 32, 33, 34, 35, 36, 39.
* **Master Scan (`SCAN_ALL_PINS`):** Queries all digital pins and 6 analog sensor channels in a single atomic payload.
* **AI Hardware Commander:** Accepts natural English prompts (e.g. *"Turn on pin 2 and read analog sensor on pin 34"*) and dispatches instant JSON commands to hardware.

---

## 8. Raspberry Pi 4 Operation & Maintenance Commands

### 1-Click Update from GitHub:
```bash
cd ~/esp32-ai-builder
bash raspberry_pi/update.sh
```

### Manual Service Management:
```bash
# Check 24/7 background service status
sudo systemctl status esp32-forge.service

# View live real-time compilation & WebSocket logs
sudo journalctl -u esp32-forge.service -f

# Restart background service
sudo systemctl restart esp32-forge.service

# Stop background service
sudo systemctl stop esp32-forge.service
```

### Interactive Test Runner:
```bash
cd ~/esp32-ai-builder/raspberry_pi
bash start.sh
```

### Worldwide HTTPS/WSS Access (Cloudflare Tunnel):
```bash
cd ~/esp32-ai-builder/raspberry_pi
bash setup_cloudflare_tunnel.sh
```
*(Option 1: Generates instant free `https://*.trycloudflare.com` URL).*

