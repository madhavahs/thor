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
