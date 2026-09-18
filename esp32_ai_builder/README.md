# ⚡ ESP32 Worldwide AI Forge & Remote Fleet Manager

A production-grade, worldwide cloud-managed system enabling users to submit natural-language prompts or C++ code from any browser globally to dynamically replace the running firmware on an ESP32.

The system automatically identifies, installs, and prunes unused Arduino libraries, compiles firmware via a self-healing AI compiler loop, and delivers OTA updates over an outbound secure tunnel with zero-brick hardware rollback.

---

## 🎨 New Features & Enhancements

- **Minimalist White, Green & Black UI:** Clean editorial-style dashboard using crisp white surfaces (`#ffffff`), emerald green accents (`#059669`), and off-black typography (`#0f172a`).
- **Universal Custom Scrollbars:** Sleek 6px custom scrollbars across all tabs, C++ code editor, active libraries list, live console, pin grid, and hardware logs.
- **Full Mobile & Tablet Responsiveness:** Compact header, single-column responsive flow on mobile devices, touch-friendly pin toggles, and dedicated mobile sub-tabs (`[💻 C++ Editor] [📚 Libraries] [🖥️ Terminal Logs]`).
- **Clean Code Hot-Swap (Zero Disconnect):** Old sketch artifacts and stale binaries are purged automatically on compile. Firmware download actively services WebSocket loops and reconnects in 500ms with preserved NVS credentials. The dashboard displays a seamless hot-swap transition without dropping offline.
- **ESP32 Space Optimization:** Compiles with `-Os`, `-DCORE_DEBUG_LEVEL=0`, and linker dead-code elimination, saving 200–300 KB of Flash space. FreeRTOS task stack is halved to 4 KB, conserving precious ESP32 SRAM.

---

## 🏛️ System Architecture

```
                                ┌──────────────────────────────────────────────────────────┐
                                │                 GLOBAL CONTROL STUDIO                    │
                                │  - Minimalist White, Green & Black Theme (Desktop/Mobile)│
                                │  - Natural Language AI Prompt Studio (Gemini 2.0 Flash) │
                                │  - CodeMirror C++ Editor with Universal Custom Scrollbar │
                                │  - Real-Time Library Manager (Auto-install & Prune)      │
                                │  - Live Compilation Logs & Remote Serial Monitor         │
                                │  - Real-Time GPIO Matrix & 12-bit ADC Sensor Telemetry   │
                                └────────────────────────────┬─────────────────────────────┘
                                                             │ REST / WebSockets (/ws/ui)
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    HOSTING PLATFORM (Raspberry Pi 4 / Render.com Docker)                 │
│  - Node.js + Express REST API (Compile, Deploy, Library Sync, Hardware RPC)             │
│  - WebSocket Hub (/ws/device, /ws/ui) with Flashing Grace-Period State Continuity        │
│  - Automated `arduino-cli` ARM64 / x86_64 Engine with ESP32 Core 3.x                    │
│  - Self-Healing AI Compiler Loop (Auto-repairs compiler errors via Gemini)              │
│  - Size-Optimized Build Engine (-Os, -DCORE_DEBUG_LEVEL=0, dead-code removal)           │
│  - Guardian Agent Injector (Guarantees background tunnel in user sketches)              │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │ Outbound TLS / WS Tunnel (/ws/device)
                                            │ HTTP / HTTPS OTA Delivery (/firmware)
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        ESP32 DUAL-CORE HARDWARE RUNTIME                                 │
│  ┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐  │
│  │      CORE 0: IMMORTAL GUARDIAN         │ │         CORE 1: USER APPLICATION       │  │
│  │  - FreeRTOS Task (Optimized 4KB Stack) │ │  - Dynamically replaced C++ user code  │  │
│  │  - Persistent Outbound WebSocket Tunnel│ │  - Sensors, displays, actuators, etc.  │  │
│  │  - Dynamic WS/WSS Transport Auto-Detect│ │  - Zero Wi-Fi/OTA boilerplate needed   │  │
│  │  - Hardware Dual-OTA Flasher (2KB Buff)│ │  - Runs isolated & uninterrupted       │  │
│  │  - Fast 500ms Reconnect & NVS Backup   │ │  - Clean hot-swap on every flash       │  │
│  └────────────────────────────────────────┘ └────────────────────────────────────────┘  │
│                         Hardware Fail-Safe Rollback Partition Table                     │
│                    [Factory Partition | OTA_0 Partition | OTA_1 Partition]              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment Options

You can host the ESP32 AI Forge in two primary ways:

1. **Self-Hosted on Raspberry Pi 4 Model B (Recommended):** Zero monthly fees, permanent build cache (3-second compiles), no memory or timeout constraints, and access from anywhere via Cloudflare Tunnel.
2. **Automatic Cloud Deployment on Render.com:** Zero server hardware needed; automatically compiles Docker containers and deploys worldwide upon every `git push`.

---

## 🥧 Option 1: Self-Hosted on Raspberry Pi 4 Model B (Recommended)

Complete automated installation suite is provided in the `raspberry_pi/` directory.

### Step 1: Clone or Copy to Raspberry Pi
```bash
cd ~
git clone https://github.com/madhavahs/thor.git
cd thor/esp32_ai_builder
```

### Step 2: Run 1-Click Automated Installer
```bash
cd raspberry_pi
chmod +x *.sh
bash install.sh
```
*Installs Node.js 20, `arduino-cli` ARM64, ESP32 Core 3.1.1, system libraries, and pre-warms the compiler cache for 3–5 second builds.*

### Step 3: Configure Gemini API Key
```bash
nano ../server/.env
```
Set your `GEMINI_API_KEY`:
```env
PORT=3000
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL=gemini-2.0-flash
DEVICE_AUTH_TOKEN=super_secret_device_token_12345
WORKSPACE_DIR=./workspace
```

### Step 4: Run as a 24/7 Background System Service
```bash
sudo bash install_service.sh
```
Useful service commands:
```bash
sudo systemctl status esp32-forge.service    # Check status
sudo journalctl -u esp32-forge.service -f     # Live real-time server logs
sudo systemctl restart esp32-forge.service   # Restart service
```

### Step 5: Worldwide HTTPS/WSS Access via Cloudflare Tunnel
```bash
bash setup_cloudflare_tunnel.sh
```
Select **Option 1 (Quick Tunnel)** to generate an instant, free public HTTPS edge URL:
```text
https://your-custom-subdomain.trycloudflare.com
```

### Step 6: 1-Click Server Update (After Git Push)
Whenever updates are pushed to GitHub, run on your Pi:
```bash
bash raspberry_pi/update.sh
```

---

## ☁️ Option 2: Automatic Deployment to Render.com

Every push to your GitHub repository triggers an automatic build and deployment to Render via the included production [`Dockerfile`](file:///D:/antigravity/Project1/esp32_ai_builder/Dockerfile) and [`render.yaml`](file:///D:/antigravity/Project1/render.yaml).

### How Render Auto-Deploy Works:

1. **Connect Repository to Render:**
   - Log into [Render.com](https://render.com).
   - Click **New +** ➔ **Blueprint** (or **Web Service**).
   - Select your GitHub repository (`madhavahs/thor`).
   - Render automatically detects the root [`render.yaml`](file:///D:/antigravity/Project1/render.yaml).
2. **Environment Configuration:**
   - In the Render Dashboard, set your environment variable:
     - `GEMINI_API_KEY` = `your_google_gemini_api_key`
3. **Automatic Continuous Deployment:**
   - Render has `autoDeploy: true` enabled.
   - **Every time you run `git push origin main`**, Render automatically pulls the latest commit, builds the optimized Docker container, pre-warms the ESP32 build cache, and deploys the server globally with free automatic SSL (`https://esp32-ai-builder.onrender.com`).

---

## 🔌 Connecting Your ESP32

1. Open [`firmware/include/GuardianConfig.h`](file:///D:/antigravity/Project1/esp32_ai_builder/firmware/include/GuardianConfig.h):

   **For Local Raspberry Pi Hosting (LAN):**
   ```cpp
   #define GUARDIAN_WIFI_SSID    "YOUR_WIFI_SSID"
   #define GUARDIAN_WIFI_PASS    "YOUR_WIFI_PASSWORD"
   #define GUARDIAN_SERVER_HOST  "192.168.1.50"   // Your Raspberry Pi's local IP
   #define GUARDIAN_SERVER_PORT  3000             // Direct Node port (plain WS)
   ```

   **For Cloudflare Tunnel or Render.com Hosting (Worldwide Access):**
   ```cpp
   #define GUARDIAN_WIFI_SSID    "YOUR_WIFI_SSID"
   #define GUARDIAN_WIFI_PASS    "YOUR_WIFI_PASSWORD"
   #define GUARDIAN_SERVER_HOST  "your-app.onrender.com" // or trycloudflare.com host
   #define GUARDIAN_SERVER_PORT  443                     // HTTPS / WSS port
   ```

2. Flash [`firmware/ESP32_Guardian_Firmware.ino`](file:///D:/antigravity/Project1/esp32_ai_builder/firmware/ESP32_Guardian_Firmware.ino) to your ESP32 via USB once.
3. Open the web dashboard. The device will connect and display as **● ESP32 Online**.
4. **All future code updates, library installs, AI builds, and pin controls are now 100% wireless and remote.**

---

## 🛠️ Testing & Verification

Run the automated test suite:
```bash
cd server
npm test
```

Suite covers:
- `cliRunner.test.js`: Verifies `arduino-cli` spawn execution.
- `libraryManager.test.js`: Header detection, library listing, and pruning protection.
- `codeInjector.test.js`: Guardian agent injection and code sanitization.
- `buildEngine.test.js`: End-to-end sketch compilation with `-Os` space optimization.
- `server.test.js`: WebSocket device registry, telemetry, and hot-swap grace periods.
