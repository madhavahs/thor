# ⚡ ESP32 Worldwide AI Forge & Remote Fleet Manager

A production-grade, worldwide cloud-managed system enabling users to submit natural-language prompts or C++ code from any browser globally to dynamically replace the running firmware on an ESP32.

The system automatically identifies, installs, and prunes unused Arduino libraries, compiles firmware via a self-healing AI compiler loop, and delivers OTA updates over an outbound secure tunnel with zero-brick hardware rollback.

---

## 🏛️ System Architecture

```
                               ┌──────────────────────────────────────────────────────────┐
                               │                 GLOBAL CONTROL STUDIO                    │
                               │  - Natural Language AI Prompt Studio (Gemini 2.0 Flash) │
                               │  - CodeMirror 6 C++ Editor                               │
                               │  - Real-Time Library Manager (Install, Delete, Prune)    │
                               │  - Live Compilation Logs & Remote Serial Stream          │
                               └────────────────────────────┬─────────────────────────────┘
                                                            │ REST / WebSockets (/ws/ui)
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           CLOUD COMPILER & HUB BACKEND                                  │
│  - Node.js + Express REST API (Compile, Deploy, Library Sync)                           │
│  - WebSocket Hub (/ws/device, /ws/ui) for bi-directional streaming                      │
│  - Automated `arduino-cli` Process Engine with ESP32 Core 3.x                           │
│  - Self-Healing AI Compiler Loop (Auto-repairs syntax/API compiler errors)               │
│  - Guardian Agent Injector (Guarantees background tunnel in user sketches)              │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │ Outbound TLS WebSocket (/ws/device)
                                            │ HTTP OTA Binary Delivery (/firmware)
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        ESP32 DUAL-CORE HARDWARE RUNTIME                                 │
│  ┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐  │
│  │      CORE 0: IMMORTAL GUARDIAN         │ │         CORE 1: USER APPLICATION       │  │
│  │  - FreeRTOS Background Task            │ │  - Dynamically generated C++ sketch    │  │
│  │  - Persistent Outbound WebSocket       │ │  - Sensors, displays, actuators, etc.  │  │
│  │  - Hardware Dual-Partition OTA Flasher │ │  - Zero Wi-Fi/OTA boilerplate needed   │  │
│  │  - Remote Serial Monitor Log Streamer  │ │  - Runs isolated & uninterrupted       │  │
│  └────────────────────────────────────────┘ └────────────────────────────────────────┘  │
│                         Hardware Fail-Safe Rollback Partition Table                     │
│                    [Factory Partition | OTA_0 Partition | OTA_1 Partition]              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### 1. Toolchain Setup (Automated)

Run the automated setup script to install `arduino-cli` locally and configure the ESP32 board manager package (`esp32:esp32@3.1.1`):

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_toolchain.ps1
```

**Linux / macOS (Bash):**
```bash
chmod +x scripts/setup_toolchain.sh
./scripts/setup_toolchain.sh
```

### 2. Configure Environment

Copy the `.env.example` file and configure your credentials:

```bash
cd server
copy .env.example .env
```

Edit `server/.env`:
```env
PORT=3000
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
DEVICE_AUTH_TOKEN=super_secret_device_token_12345
ARDUINO_CLI_PATH=../bin/arduino-cli.exe
WORKSPACE_DIR=./workspace
```

### 3. Install Server Dependencies & Start

```bash
cd server
npm install
npm start
```

The Web Studio is now accessible at `http://localhost:3000`.

---

## 🔌 Initial ESP32 Setup (One-Time Flash)

1. Open `firmware/include/GuardianConfig.h` and configure your Wi-Fi credentials and Cloud Server URL:
   ```cpp
   #define GUARDIAN_WIFI_SSID "Your_WiFi_Name"
   #define GUARDIAN_WIFI_PASS "Your_WiFi_Password"
   #define GUARDIAN_SERVER_HOST "your-cloud-domain.com" // or local IP for LAN
   #define GUARDIAN_SERVER_PORT 3000
   #define GUARDIAN_DEVICE_ID "esp32-01"
   #define GUARDIAN_DEVICE_TOKEN "super_secret_device_token_12345"
   ```
2. Flash `firmware/ESP32_Guardian_Firmware.ino` using `arduino-cli`:
   ```bash
   arduino-cli compile --fqbn esp32:esp32:esp32 --upload -p COM3 firmware/ESP32_Guardian_Firmware.ino
   ```
3. Once booted, the ESP32 establishes an outbound connection to the cloud server and displays as **● ESP32 Online** on the Global Control Studio dashboard.
4. **All future updates are now 100% remote and wireless from any browser globally.**

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
- `codeInjector.test.js`: Guardian agent injection into user sketches.
- `buildEngine.test.js`: End-to-end sketch compilation and ESP32 `.bin` firmware creation.
- `server.test.js`: WebSocket device registry and real-time telemetry streaming.

---

## 🌐 Cloud Deployment (Render / Railway / VPS)

To deploy the hub server worldwide:
1. Deploy the repository to Render, Railway, or any Linux VPS with Node.js 20+.
2. Run `scripts/setup_toolchain.sh` in the build step to ensure `arduino-cli` and `esp32:esp32` core are installed.
3. Expose port `443` with SSL (WebSocket connections use `wss://`).
4. Update `GUARDIAN_SERVER_HOST` on your ESP32 devices to your public domain.
