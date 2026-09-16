# ESP32 Worldwide AI Forge & Remote Fleet Manager - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the ESP32 project from scratch into a production-ready, worldwide cloud-managed system where users can submit natural-language tasks or C++ code from anywhere in the world to replace the running program on an ESP32. The system automatically identifies, installs, and prunes unused Arduino libraries, compiles firmware via a self-healing AI compiler loop, and delivers OTA updates over an outbound secure tunnel with zero-brick hardware rollback.

**Architecture:** 
- **Cloud Backend & Compiler Service (Node.js + Express + WebSocket + `arduino-cli`):** Serves the global web dashboard, connects to ESP32 over persistent WebSockets, interfaces with Google Gemini API, manages dynamic library installs/deletions, injects the background "Immortal Guardian" FreeRTOS agent, runs `arduino-cli` builds, and auto-fixes compilation errors.
- **ESP32 Immortal Guardian Firmware (Arduino-ESP32 Core 3.x + FreeRTOS):** Runs a permanent background FreeRTOS task on Core 0 maintaining outbound TLS WebSocket connection to the cloud, handles OTA flashing via `Update.h` with dual-partition hardware rollback, and relays `Serial` logs back to the web console. Core 1 runs the dynamically generated user project.
- **Global Control Studio (Web Dashboard):** Single-page web console accessible from any browser worldwide, featuring an AI prompt studio, interactive C++ code editor, real-time library manager (install/delete/prune), live compilation log viewer, and remote streaming serial monitor.

**Tech Stack:** 
- **Firmware:** C++ (Arduino-ESP32 Core 3.x), FreeRTOS, `Update.h`, `WiFiClientSecure`, `WebSocketsClient`, `ArduinoJson 7.x`, `esp_ota_ops.h`.
- **Backend:** Node.js (v24), Express, `ws` (WebSockets), `arduino-cli` v1.x, Google Gemini API (`@google/genai` / REST).
- **Frontend:** Responsive Web Dashboard (HTML5, Modern CSS, Vanilla JS, CodeMirror 6, Xterm.js).
- **Tooling:** PowerShell / Bash toolchain automation for `arduino-cli` setup and board package management.

**Spec:** High-level user requirements for global ESP32 code rewrite, autonomous library installation & cleanup, AI task translation, and fail-safe remote OTA deployment.

## Global Constraints
- Must use Arduino-ESP32 Core 3.x conventions (e.g. Core 3.x LEDC API).
- The ESP32 must never lose remote connectivity regardless of user code (Dual-Core FreeRTOS Guardian isolation).
- All communication must be outbound from ESP32 to Cloud (NAT and firewall traversal without port forwarding).
- Libraries must be dynamically tracked, installed upon demand, and pruned when no longer required.
- Compilation failures must be captured and automatically repaired by AI before aborting.
- No hardcoded secrets in version-controlled firmware templates; secrets managed via environment variables and configuration files.

---

### File Structure Map

```text
esp32_ai_builder/
├── plan.md                                # Implementation plan
├── bin/                                   # Local arduino-cli binaries & tools
├── scripts/
│   ├── setup_toolchain.ps1                # Installs arduino-cli & ESP32 core package
│   └── setup_toolchain.sh                 # Linux/macOS equivalent
├── firmware/
│   ├── partitions.csv                     # Custom dual-OTA partition table (factory, ota_0, ota_1)
│   ├── include/
│   │   ├── GuardianConfig.h               # Wi-Fi credentials & Cloud WebSocket URL config
│   │   └── GuardianAgent.h                # FreeRTOS background task: WSS tunnel, OTA flasher, Serial tap
│   └── ESP32_Guardian_Firmware.ino        # Factory baseline firmware
├── server/
│   ├── package.json                       # Dependencies (express, ws, dotenv, etc.)
│   ├── .env.example                       # Environment variables template
│   ├── server.js                          # Main Express & WebSocket server
│   ├── src/
│   │   ├── config.js                      # Environment & path configuration
│   │   ├── compiler/
│   │   │   ├── cliRunner.js               # Child-process wrapper for arduino-cli
│   │   │   ├── libraryManager.js          # Install, inspect, detect, and prune libraries
│   │   │   ├── codeInjector.js            # Injects GuardianAgent into user code
│   │   │   └── buildEngine.js             # Orchestrates build & self-healing compile loop
│   │   ├── ai/
│   │   │   ├── geminiClient.js            # Google Gemini API connector
│   │   │   └── promptTemplates.js         # Prompts for code generation & error fixing
│   │   └── tunnel/
│   │       └── deviceManager.js           # WebSocket device registry & real-time message router
│   └── workspace/                         # Build staging directories (isolated per device)
└── frontend/
    ├── index.html                         # Unified Web Studio UI
    ├── css/
    │   └── style.css                      # Modern dark theme dashboard styles
    └── js/
        ├── api.js                         # REST & WebSocket client
        ├── editor.js                      # Code editor integration
        └── app.js                         # UI state, event listeners & log stream handler
```

---

## Tasks

### Task 1: Toolchain Scaffolding & `arduino-cli` Automation

**Files:**
- Create: `scripts/setup_toolchain.ps1`
- Create: `scripts/setup_toolchain.sh`
- Create: `firmware/partitions.csv`

**Interfaces:**
- Consumes: PowerShell / Bash CLI environment.
- Produces: Installed and verified `arduino-cli` binary in `bin/` or PATH, ESP32 board core installed (`esp32:esp32`), and default libraries indexed.

- [ ] **Step 1: Create toolchain setup script for Windows (`scripts/setup_toolchain.ps1`)**

```powershell
# scripts/setup_toolchain.ps1
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BinDir = Join-Path $RootDir "bin"

if (!(Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }

$CliExe = Join-Path $BinDir "arduino-cli.exe"

if (!(Test-Path $CliExe) -and !(Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
    Write-Host "Downloading arduino-cli for Windows (64-bit)..." -ForegroundColor Cyan
    $Url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
    $ZipFile = Join-Path $BinDir "arduino-cli.zip"
    Invoke-WebRequest -Uri $Url -OutFile $ZipFile
    Expand-Archive -Path $ZipFile -DestinationPath $BinDir -Force
    Remove-Item $ZipFile -Force
    Write-Host "arduino-cli installed to $BinDir" -ForegroundColor Green
} else {
    Write-Host "arduino-cli already present." -ForegroundColor Green
}

$Env:PATH = "$BinDir;" + $Env:PATH
$cli = if (Get-Command arduino-cli -ErrorAction SilentlyContinue) { "arduino-cli" } else { $CliExe }

Write-Host "Initializing Arduino CLI config..." -ForegroundColor Cyan
& $cli config init --overwrite
& $cli config set board_manager.additional_urls "https://espressif.github.io/arduino-esp32/package_esp32_index.json"
& $cli core update-index

Write-Host "Installing ESP32 core package (this may take a few minutes)..." -ForegroundColor Cyan
& $cli core install esp32:esp32@3.1.1

Write-Host "Toolchain installation complete!" -ForegroundColor Green
& $cli version
& $cli core list
```

- [ ] **Step 2: Create cross-platform shell setup script (`scripts/setup_toolchain.sh`)**

```bash
#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$ROOT_DIR/bin"
mkdir -p "$BIN_DIR"

if ! command -v arduino-cli &> /dev/null && [ ! -f "$BIN_DIR/arduino-cli" ]; then
    echo "Downloading arduino-cli..."
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR="$BIN_DIR" sh
fi

export PATH="$BIN_DIR:$PATH"
CLI="arduino-cli"

echo "Configuring Arduino CLI with ESP32 board manager..."
$CLI config init --overwrite
$CLI config set board_manager.additional_urls "https://espressif.github.io/arduino-esp32/package_esp32_index.json"
$CLI core update-index
$CLI core install esp32:esp32@3.1.1
echo "Toolchain setup complete!"
$CLI version
```

- [ ] **Step 3: Create custom dual-OTA partition table (`firmware/partitions.csv`)**

```csv
# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     0x9000,  0x5000,
otadata,  data, ota,     0xe000,  0x2000,
app0,     app,  ota_0,   0x10000, 0x1E0000,
app1,     app,  ota_1,   0x1F0000,0x1E0000,
spiffs,   data, spiffs,  0x3D0000,0x30000,
```

- [ ] **Step 4: Execute setup script and verify `arduino-cli` operates**

Run: `powershell -ExecutionPolicy Bypass -File scripts/setup_toolchain.ps1`
Expected: `arduino-cli` binary downloaded to `bin/`, index updated, and ESP32 core recognized.

---

### Task 2: Backend Architecture & CLI Process Wrapper

**Files:**
- Create: `server/package.json`
- Create: `server/.env.example`
- Create: `server/src/config.js`
- Create: `server/src/compiler/cliRunner.js`
- Test: `server/test/cliRunner.test.js`

**Interfaces:**
- Consumes: Node.js runtime, environment variables.
- Produces: `runCli(args, options)` helper returning `{ success, stdout, stderr, code }`.

- [ ] **Step 1: Write `server/package.json`**

```json
{
  "name": "esp32-ai-builder-server",
  "version": "1.0.0",
  "description": "Worldwide ESP32 AI Compiler, Dependency Manager and OTA Hub",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node --test test/**/*.test.js"
  },
  "dependencies": {
    "express": "^4.21.2",
    "ws": "^8.18.0",
    "dotenv": "^16.4.7",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.1.9"
  }
}
```

- [ ] **Step 2: Write `server/.env.example` and `server/src/config.js`**

```text
# server/.env.example
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
DEVICE_AUTH_TOKEN=super_secret_device_token_12345
ARDUINO_CLI_PATH=../bin/arduino-cli.exe
WORKSPACE_DIR=./workspace
```

```javascript
// server/src/config.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

module.exports = {
  port: process.env.PORT || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  deviceAuthToken: process.env.DEVICE_AUTH_TOKEN || 'default_device_token_xyz',
  arduinoCliPath: process.env.ARDUINO_CLI_PATH 
    ? path.resolve(__dirname, '..', process.env.ARDUINO_CLI_PATH)
    : 'arduino-cli',
  workspaceDir: path.resolve(__dirname, '..', process.env.WORKSPACE_DIR || './workspace')
};
```

- [ ] **Step 3: Implement `server/src/compiler/cliRunner.js`**

```javascript
// server/src/compiler/cliRunner.js
const { spawn } = require('child_process');
const config = require('../config');

function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const cliPath = config.arduinoCliPath;
    const proc = spawn(cliPath, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (options.onStdout) options.onStdout(chunk);
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (options.onStderr) options.onStderr(chunk);
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        code: -1,
        stdout: '',
        stderr: err.message
      });
    });
  });
}

module.exports = { runCli };
```

- [ ] **Step 4: Create and run unit test `server/test/cliRunner.test.js`**

```javascript
// server/test/cliRunner.test.js
const test = require('node:test');
const assert = require('node:assert');
const { runCli } = require('../src/compiler/cliRunner');

test('runCli should return version from arduino-cli', async () => {
  const result = await runCli(['version']);
  assert.strictEqual(result.success, true);
  assert.match(result.stdout, /arduino-cli/i);
});
```

Run: `cd server && npm install && node --test test/cliRunner.test.js`
Expected: Test passes with exit code 0.

---

### Task 3: Dynamic Library Manager (Auto-Detect, Install, Prune)

**Files:**
- Create: `server/src/compiler/libraryManager.js`
- Test: `server/test/libraryManager.test.js`

**Interfaces:**
- Consumes: C++ sketch source code string, target library names.
- Produces:
  - `detectIncludedHeaders(code)` $\rightarrow$ `string[]`
  - `listInstalledLibraries()` $\rightarrow$ `Promise<Array<{ name, version }>>`
  - `installLibrary(libName)` $\rightarrow$ `Promise<{ success, message }>`
  - `uninstallLibrary(libName)` $\rightarrow$ `Promise<{ success, message }>`
  - `syncLibraries(requiredLibs, autoPrune)` $\rightarrow$ `Promise<{ installed: [], removed: [], retained: [] }>`

- [ ] **Step 1: Write failing test for `libraryManager`**

```javascript
// server/test/libraryManager.test.js
const test = require('node:test');
const assert = require('node:assert');
const { detectIncludedHeaders } = require('../src/compiler/libraryManager');

test('detectIncludedHeaders extracts quoted and angle-bracket headers', () => {
  const sampleCode = `
    #include <WiFi.h>
    #include "MyCustomHeader.h"
    #include <Adafruit_Sensor.h>
    // #include <CommentedOut.h>
    void setup() {}
  `;
  const headers = detectIncludedHeaders(sampleCode);
  assert.deepStrictEqual(headers, ['WiFi.h', 'MyCustomHeader.h', 'Adafruit_Sensor.h']);
});
```

- [ ] **Step 2: Implement `server/src/compiler/libraryManager.js`**

```javascript
// server/src/compiler/libraryManager.js
const { runCli } = require('./cliRunner');

function detectIncludedHeaders(code) {
  const lines = code.split('\n');
  const headers = [];
  const regex = /^\s*#include\s+[<"]([^>"]+)[>"]/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('//')) continue;
    const match = line.match(regex);
    if (match && match[1]) {
      headers.push(match[1]);
    }
  }
  return headers;
}

async function listInstalledLibraries() {
  const res = await runCli(['lib', 'list', '--format', 'json']);
  if (!res.success) {
    return [];
  }
  try {
    const data = JSON.parse(res.stdout);
    if (data.installed_libraries) {
      return data.installed_libraries.map(lib => ({
        name: lib.library.name,
        version: lib.library.version,
        installedLocation: lib.library.install_dir
      }));
    }
    return [];
  } catch (err) {
    return [];
  }
}

async function installLibrary(libName) {
  const res = await runCli(['lib', 'install', libName]);
  return {
    success: res.success,
    output: res.stdout || res.stderr
  };
}

async function uninstallLibrary(libName) {
  const res = await runCli(['lib', 'uninstall', libName]);
  return {
    success: res.success,
    output: res.stdout || res.stderr
  };
}

// System libraries bundled into ESP32 Core that must NEVER be uninstalled
const PROTECTED_SYSTEM_LIBRARIES = new Set([
  'WiFi', 'WebServer', 'HTTPClient', 'WiFiClientSecure',
  'SPIFFS', 'FS', 'Update', 'Wire', 'SPI', 'EEPROM', 'Preferences'
]);

async function syncLibraries(requiredLibNames = [], autoPrune = true) {
  const installed = await listInstalledLibraries();
  const installedNames = new Set(installed.map(l => l.name));
  const requiredNames = new Set(requiredLibNames);

  const report = { installed: [], removed: [], retained: [] };

  // 1. Install missing libraries
  for (const req of requiredNames) {
    if (PROTECTED_SYSTEM_LIBRARIES.has(req)) continue;
    if (!installedNames.has(req)) {
      const installRes = await installLibrary(req);
      if (installRes.success) {
        report.installed.push(req);
      }
    } else {
      report.retained.push(req);
    }
  }

  // 2. Prune obsolete libraries if requested
  if (autoPrune) {
    for (const inst of installedNames) {
      if (PROTECTED_SYSTEM_LIBRARIES.has(inst)) continue;
      if (!requiredNames.has(inst)) {
        const delRes = await uninstallLibrary(inst);
        if (delRes.success) {
          report.removed.push(inst);
        }
      }
    }
  }

  return report;
}

module.exports = {
  detectIncludedHeaders,
  listInstalledLibraries,
  installLibrary,
  uninstallLibrary,
  syncLibraries
};
```

- [ ] **Step 3: Run library manager tests**

Run: `node --test test/libraryManager.test.js`
Expected: All tests pass.

---

### Task 4: Immortal Guardian Injection & Code Preparation

**Files:**
- Create: `firmware/include/GuardianConfig.h`
- Create: `firmware/include/GuardianAgent.h`
- Create: `server/src/compiler/codeInjector.js`
- Test: `server/test/codeInjector.test.js`

**Interfaces:**
- Consumes: Raw user sketch source code string, device ID, token, server URL, Wi-Fi config.
- Produces: Injected C++ source code ready to compile, guaranteeing that Core 0 executes the Guardian Agent background task while Core 1 executes the user code.

- [ ] **Step 1: Write `firmware/include/GuardianConfig.h`**

```cpp
// firmware/include/GuardianConfig.h
#pragma once

#ifndef GUARDIAN_WIFI_SSID
#define GUARDIAN_WIFI_SSID "DEFAULT_SSID"
#endif

#ifndef GUARDIAN_WIFI_PASS
#define GUARDIAN_WIFI_PASS "DEFAULT_PASS"
#endif

#ifndef GUARDIAN_SERVER_HOST
#define GUARDIAN_SERVER_HOST "esp32-ai-builder.onrender.com"
#endif

#ifndef GUARDIAN_SERVER_PORT
#define GUARDIAN_SERVER_PORT 443
#endif

#ifndef GUARDIAN_DEVICE_ID
#define GUARDIAN_DEVICE_ID "esp32-01"
#endif

#ifndef GUARDIAN_DEVICE_TOKEN
#define GUARDIAN_DEVICE_TOKEN "default_secret_token"
#endif

#ifndef GUARDIAN_FIRMWARE_VER
#define GUARDIAN_FIRMWARE_VER "v1.0.0"
#endif
```

- [ ] **Step 2: Write `firmware/include/GuardianAgent.h`**

```cpp
// firmware/include/GuardianAgent.h
#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <esp_task_wdt.h>
#include "GuardianConfig.h"

class GuardianAgentClass {
public:
  WebSocketsClient wsClient;
  bool connected = false;
  unsigned long lastPing = 0;

  void begin() {
    Serial.println("[GUARDIAN] Initializing Immortal Guardian background task on Core 0...");
    xTaskCreatePinnedToCore(
      taskTrampoline,
      "GuardianTask",
      8192,
      this,
      1,
      NULL,
      0 // Pinned strictly to Core 0 so user code runs uninterrupted on Core 1
    );
  }

  void logRemote(const String& msg) {
    if (connected) {
      JsonDocument doc;
      doc["type"] = "SERIAL_LOG";
      doc["device_id"] = GUARDIAN_DEVICE_ID;
      doc["payload"] = msg;
      String out;
      serializeJson(doc, out);
      wsClient.sendTXT(out);
    }
  }

private:
  static void taskTrampoline(void* arg) {
    GuardianAgentClass* self = static_cast<GuardianAgentClass*>(arg);
    self->runTask();
  }

  void runTask() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(GUARDIAN_WIFI_SSID, GUARDIAN_WIFI_PASS);

    while (WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(500));
    }

    Serial.println("[GUARDIAN] WiFi Connected. IP: " + WiFi.localIP().toString());
    
    // Mark current firmware partition valid to cancel rollback
    esp_ota_mark_app_valid_cancel_rollback();

    // Setup WebSocket client
    wsClient.beginSSL(GUARDIAN_SERVER_HOST, GUARDIAN_SERVER_PORT, "/ws/device");
    wsClient.setExtraHeaders("Authorization: Bearer " GUARDIAN_DEVICE_TOKEN "\r\nX-Device-Id: " GUARDIAN_DEVICE_ID);
    wsClient.onEvent([this](WStype_t type, uint8_t* payload, size_t length) {
      this->handleWsEvent(type, payload, length);
    });
    wsClient.setReconnectInterval(3000);

    for (;;) {
      wsClient.loop();
      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }

  void handleWsEvent(WStype_t type, uint8_t* payload, size_t length) {
    if (type == WStype_CONNECTED) {
      connected = true;
      Serial.println("[GUARDIAN] Connected to Global Cloud Hub!");
      sendTelemetry();
    } else if (type == WStype_DISCONNECTED) {
      connected = false;
      Serial.println("[GUARDIAN] Disconnected from Global Cloud Hub");
    } else if (type == WStype_TEXT) {
      handleCommand(String((char*)payload));
    }
  }

  void sendTelemetry() {
    JsonDocument doc;
    doc["type"] = "DEVICE_HELLO";
    doc["device_id"] = GUARDIAN_DEVICE_ID;
    doc["firmware_ver"] = GUARDIAN_FIRMWARE_VER;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip"] = WiFi.localIP().toString();
    String out;
    serializeJson(doc, out);
    wsClient.sendTXT(out);
  }

  void handleCommand(const String& rawJson) {
    JsonDocument doc;
    if (deserializeJson(doc, rawJson)) return;
    String cmdType = doc["type"] | "";
    if (cmdType == "START_OTA") {
      String fwUrl = doc["url"] | "";
      performOTA(fwUrl);
    } else if (cmdType == "RESTART") {
      ESP.restart();
    }
  }

  void performOTA(const String& url) {
    Serial.println("[GUARDIAN] Commencing OTA download from: " + url);
    WiFiClientSecure secClient;
    secClient.setInsecure();
    HTTPClient http;
    if (!http.begin(secClient, url)) return;
    int code = http.GET();
    if (code != HTTP_CODE_OK) { http.end(); return; }
    int size = http.getSize();
    if (!Update.begin(size)) { http.end(); return; }
    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);
    if (written == (size_t)size && Update.end(true)) {
      Serial.println("[GUARDIAN] OTA Complete! Rebooting into new firmware...");
      vTaskDelay(pdMS_TO_TICKS(500));
      ESP.restart();
    } else {
      Serial.println("[GUARDIAN] OTA update failed.");
      Update.abort();
    }
    http.end();
  }
};

extern GuardianAgentClass Guardian;
```

- [ ] **Step 3: Implement `server/src/compiler/codeInjector.js`**

```javascript
// server/src/compiler/codeInjector.js
function injectGuardian(userCode, options = {}) {
  const {
    deviceId = 'esp32-01',
    deviceToken = 'token_secret',
    wifiSsid = 'wifi',
    wifiPass = '123456789',
    serverHost = 'localhost',
    serverPort = 3000,
    firmwareVersion = 'v1.0.0'
  } = options;

  const headerDefines = `
// --- AUTOMATICALLY INJECTED IMMORTAL GUARDIAN AGENT ---
#define GUARDIAN_DEVICE_ID "${deviceId}"
#define GUARDIAN_DEVICE_TOKEN "${deviceToken}"
#define GUARDIAN_WIFI_SSID "${wifiSsid}"
#define GUARDIAN_WIFI_PASS "${wifiPass}"
#define GUARDIAN_SERVER_HOST "${serverHost}"
#define GUARDIAN_SERVER_PORT ${serverPort}
#define GUARDIAN_FIRMWARE_VER "${firmwareVersion}"

#include "GuardianAgent.h"
GuardianAgentClass Guardian;
// ----------------------------------------------------
`;

  // Search for setup() function to inject Guardian.begin()
  const setupRegex = /(void\s+setup\s*\(\s*\)\s*\{)/;
  let modifiedCode = userCode;

  if (setupRegex.test(userCode)) {
    modifiedCode = userCode.replace(
      setupRegex,
      `$1\n  Guardian.begin();`
    );
  } else {
    // If no setup found, append one
    modifiedCode += `\nvoid setup() {\n  Guardian.begin();\n}\n`;
  }

  return headerDefines + modifiedCode;
}

module.exports = { injectGuardian };
```

- [ ] **Step 4: Create and run test `server/test/codeInjector.test.js`**

```javascript
// server/test/codeInjector.test.js
const test = require('node:test');
const assert = require('node:assert');
const { injectGuardian } = require('../src/compiler/codeInjector');

test('injectGuardian injects configuration and Guardian.begin() call', () => {
  const rawCode = `
    void setup() {
      Serial.begin(115200);
    }
    void loop() {}
  `;

  const injected = injectGuardian(rawCode, {
    deviceId: 'esp32-unit-99',
    wifiSsid: 'MyHomeWiFi'
  });

  assert.match(injected, /GUARDIAN_DEVICE_ID "esp32-unit-99"/);
  assert.match(injected, /GUARDIAN_WIFI_SSID "MyHomeWiFi"/);
  assert.match(injected, /Guardian\.begin\(\);/);
});
```

Run: `node --test test/codeInjector.test.js`
Expected: Test passes.

---

### Task 5: AI Engine & Self-Healing Build Pipeline

**Files:**
- Create: `server/src/ai/geminiClient.js`
- Create: `server/src/ai/promptTemplates.js`
- Create: `server/src/compiler/buildEngine.js`
- Test: `server/test/buildEngine.test.js`

**Interfaces:**
- Consumes: User task description or raw code, list of current libraries.
- Produces: `generateProject(prompt)` and `compileWithHealing(sketchCode, options)`.

- [ ] **Step 1: Implement `server/src/ai/geminiClient.js`**

```javascript
// server/src/ai/geminiClient.js
const config = require('../config');

async function callGemini(systemPrompt, userPrompt) {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server/.env');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt + '\n\n' + userPrompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(rawText);
}

module.exports = { callGemini };
```

- [ ] **Step 2: Implement `server/src/ai/promptTemplates.js`**

```javascript
// server/src/ai/promptTemplates.js
const CODE_GENERATION_PROMPT = `
You are the world's leading Embedded C++ & ESP32 firmware architect.
Translate the user's natural language request into a self-contained, production-grade Arduino C++ sketch for ESP32 DevKit / ESP32-WROOM-32 (Core 3.x).

RULES:
1. Write clean, complete C++ code with setup() and loop(). Never leave placeholders or comments like '// implement here'.
2. Use modern Arduino-ESP32 3.x conventions (e.g. for PWM use ledcAttach / ledcWrite).
3. Do NOT include Wi-Fi connection logic or OTA logic in the user code; the Guardian background task handles Wi-Fi and Cloud OTA on Core 0 automatically.
4. Output JSON matching this schema:
{
  "project_name": "string",
  "description": "string",
  "required_libraries": ["exact Arduino library manager name with version, e.g. Adafruit BME280 Library"],
  "sketch_code": "complete C++ sketch content"
}
`;

const CODE_HEALING_PROMPT = `
You are an expert C++ embedded compiler debugging assistant.
The following Arduino C++ sketch for ESP32 failed to compile.
Analyze the compiler error messages, identify the bug (missing header, type mismatch, outdated library API), and output the corrected, full C++ sketch.

Output JSON matching this schema:
{
  "explanation": "concise description of the fix",
  "required_libraries": ["updated list of required libraries"],
  "sketch_code": "complete fixed C++ sketch content"
}
`;

module.exports = { CODE_GENERATION_PROMPT, CODE_HEALING_PROMPT };
```

- [ ] **Step 3: Implement `server/src/compiler/buildEngine.js`**

```javascript
// server/src/compiler/buildEngine.js
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { runCli } = require('./cliRunner');
const { syncLibraries } = require('./libraryManager');
const { injectGuardian } = require('./codeInjector');
const { callGemini } = require('../ai/geminiClient');
const { CODE_HEALING_PROMPT } = require('../ai/promptTemplates');

async function compileProject(sketchCode, options = {}) {
  const {
    deviceId = 'esp32-01',
    autoPrune = true,
    requiredLibs = [],
    onLog = () => {}
  } = options;

  const buildDir = path.join(config.workspaceDir, deviceId);
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  // 1. Sync libraries
  onLog('[BUILD] Synchronizing libraries...');
  const libReport = await syncLibraries(requiredLibs, autoPrune);
  if (libReport.installed.length) onLog(`[BUILD] Installed: ${libReport.installed.join(', ')}`);
  if (libReport.removed.length) onLog(`[BUILD] Pruned unused: ${libReport.removed.join(', ')}`);

  // 2. Inject Guardian background agent
  const finalCode = injectGuardian(sketchCode, options);
  const sketchPath = path.join(buildDir, `${deviceId}.ino`);
  fs.writeFileSync(sketchPath, finalCode, 'utf8');

  // Copy Guardian headers into build directory
  const includeSrc = path.resolve(__dirname, '../../../firmware/include');
  if (fs.existsSync(includeSrc)) {
    fs.readdirSync(includeSrc).forEach(file => {
      fs.copyFileSync(path.join(includeSrc, file), path.join(buildDir, file));
    });
  }

  // 3. Compile with arduino-cli
  onLog('[BUILD] Invoking arduino-cli compile...');
  const fqbn = 'esp32:esp32:esp32';
  const outBinDir = path.join(buildDir, 'bin');
  if (!fs.existsSync(outBinDir)) fs.mkdirSync(outBinDir, { recursive: true });

  const buildArgs = [
    'compile',
    '--fqbn', fqbn,
    '--output-dir', outBinDir,
    buildDir
  ];

  const compileRes = await runCli(buildArgs, {
    onStdout: (chunk) => onLog(chunk),
    onStderr: (chunk) => onLog(chunk)
  });

  const binPath = path.join(outBinDir, `${deviceId}.ino.bin`);
  const success = compileRes.success && fs.existsSync(binPath);

  return {
    success,
    binPath: success ? binPath : null,
    stdout: compileRes.stdout,
    stderr: compileRes.stderr,
    code: finalCode
  };
}

async function compileWithSelfHealing(initialCode, initialLibs, options = {}, maxRetries = 2) {
  let currentCode = initialCode;
  let currentLibs = initialLibs;
  const onLog = options.onLog || (() => {});

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    onLog(`[BUILD] Compilation Attempt ${attempt} of ${maxRetries + 1}...`);
    const result = await compileProject(currentCode, { ...options, requiredLibs: currentLibs });

    if (result.success) {
      onLog('[BUILD] Compilation successful!');
      return result;
    }

    if (attempt > maxRetries) {
      onLog('[BUILD] Max retries reached. Compilation failed.');
      return result;
    }

    onLog(`[BUILD] Compilation error detected. Prompting AI for self-healing repair...`);
    const userPrompt = `ORIGINAL SKETCH:\n${currentCode}\n\nCOMPILER ERROR LOG:\n${result.stderr || result.stdout}`;
    
    try {
      const fixed = await callGemini(CODE_HEALING_PROMPT, userPrompt);
      currentCode = fixed.sketch_code || currentCode;
      currentLibs = fixed.required_libraries || currentLibs;
      onLog(`[AI REPAIR] ${fixed.explanation || 'Code patched'}`);
    } catch (err) {
      onLog(`[AI REPAIR FAILED] ${err.message}`);
      return result;
    }
  }
}

module.exports = { compileProject, compileWithSelfHealing };
```

---

### Task 6: Cloud Hub & Device WebSocket Tunnel Manager

**Files:**
- Create: `server/src/tunnel/deviceManager.js`
- Create: `server/server.js`

**Interfaces:**
- Consumes: Inbound device connections, Web UI clients.
- Produces: Real-time bi-directional messaging, OTA triggering endpoint, and live device telemetry.

- [ ] **Step 1: Implement `server/src/tunnel/deviceManager.js`**

```javascript
// server/src/tunnel/deviceManager.js
class DeviceManager {
  constructor() {
    this.devices = new Map(); // deviceId -> { ws, info, lastSeen }
    this.uiClients = new Set(); // Set of active dashboard WebSocket clients
  }

  registerDevice(deviceId, ws, req) {
    this.devices.set(deviceId, {
      ws,
      info: { deviceId, connectedAt: Date.now() },
      lastSeen: Date.now()
    });

    this.broadcastToUi({
      type: 'DEVICE_STATUS',
      deviceId,
      online: true
    });
  }

  unregisterDevice(deviceId) {
    this.devices.delete(deviceId);
    this.broadcastToUi({
      type: 'DEVICE_STATUS',
      deviceId,
      online: false
    });
  }

  updateTelemetry(deviceId, data) {
    const dev = this.devices.get(deviceId);
    if (dev) {
      dev.info = { ...dev.info, ...data };
      dev.lastSeen = Date.now();
    }
    this.broadcastToUi({
      type: 'TELEMETRY',
      deviceId,
      data
    });
  }

  broadcastSerialLog(deviceId, log) {
    this.broadcastToUi({
      type: 'SERIAL_STREAM',
      deviceId,
      log
    });
  }

  registerUiClient(ws) {
    this.uiClients.add(ws);
    // Send list of online devices
    const deviceList = Array.from(this.devices.values()).map(d => d.info);
    ws.send(JSON.stringify({ type: 'INIT_DEVICE_LIST', devices: deviceList }));
  }

  unregisterUiClient(ws) {
    this.uiClients.delete(ws);
  }

  broadcastToUi(messageObj) {
    const msgStr = JSON.stringify(messageObj);
    for (const client of this.uiClients) {
      if (client.readyState === 1) { // OPEN
        client.send(msgStr);
      }
    }
  }

  sendToDevice(deviceId, payload) {
    const dev = this.devices.get(deviceId);
    if (dev && dev.ws.readyState === 1) {
      dev.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }
}

module.exports = new DeviceManager();
```

- [ ] **Step 2: Implement main server `server/server.js`**

```javascript
// server/server.js
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const config = require('./src/config');
const deviceManager = require('./src/tunnel/deviceManager');
const { callGemini } = require('./src/ai/geminiClient');
const { CODE_GENERATION_PROMPT } = require('./src/ai/promptTemplates');
const { compileWithSelfHealing } = require('./src/compiler/buildEngine');
const { listInstalledLibraries, installLibrary, uninstallLibrary } = require('./src/compiler/libraryManager');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../frontend')));
app.use('/firmware', express.static(path.resolve(config.workspaceDir)));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket Routing
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/ws/device') {
    const deviceId = req.headers['x-device-id'] || url.searchParams.get('device_id') || 'unknown';
    deviceManager.registerDevice(deviceId, ws, req);

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'DEVICE_HELLO' || parsed.type === 'TELEMETRY') {
          deviceManager.updateTelemetry(deviceId, parsed);
        } else if (parsed.type === 'SERIAL_LOG') {
          deviceManager.broadcastSerialLog(deviceId, parsed.payload);
        }
      } catch (e) {}
    });

    ws.on('close', () => deviceManager.unregisterDevice(deviceId));
  } else if (url.pathname === '/ws/ui') {
    deviceManager.registerUiClient(ws);
    ws.on('close', () => deviceManager.unregisterUiClient(ws));
  }
});

// REST APIs
app.get('/api/libraries', async (req, res) => {
  const libs = await listInstalledLibraries();
  res.json({ success: true, libraries: libs });
});

app.post('/api/libraries/install', async (req, res) => {
  const { name } = req.body;
  const result = await installLibrary(name);
  res.json(result);
});

app.post('/api/libraries/uninstall', async (req, res) => {
  const { name } = req.body;
  const result = await uninstallLibrary(name);
  res.json(result);
});

app.post('/api/build/ai', async (req, res) => {
  const { prompt, deviceId, autoPrune = true } = req.body;
  try {
    const aiResp = await callGemini(CODE_GENERATION_PROMPT, prompt);
    res.json({ success: true, project: aiResp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/build/deploy', async (req, res) => {
  const { sketchCode, requiredLibraries, deviceId = 'esp32-01', autoPrune = true } = req.body;

  const buildResult = await compileWithSelfHealing(sketchCode, requiredLibraries, {
    deviceId,
    autoPrune,
    onLog: (chunk) => {
      deviceManager.broadcastToUi({
        type: 'BUILD_LOG',
        deviceId,
        log: chunk
      });
    }
  });

  if (!buildResult.success) {
    return res.status(400).json({ success: false, error: buildResult.stderr || buildResult.stdout });
  }

  // Trigger OTA update over WebSocket
  const host = req.headers.host;
  const fwUrl = `http://${host}/firmware/${deviceId}/bin/${deviceId}.ino.bin`;
  deviceManager.sendToDevice(deviceId, {
    type: 'START_OTA',
    url: fwUrl
  });

  res.json({
    success: true,
    message: 'Firmware compiled successfully. OTA dispatch sent to ESP32.',
    firmwareUrl: fwUrl
  });
});

server.listen(config.port, () => {
  console.log(`[ESP32 AI FORGE] Server listening worldwide on port ${config.port}`);
});
```

---

### Task 7: Unified Global Control Studio (Frontend)

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/css/style.css`
- Create: `frontend/js/api.js`
- Create: `frontend/js/app.js`

**Interfaces:**
- Consumes: Backend REST and WebSocket APIs.
- Produces: Polished, responsive web console for mobile and desktop featuring:
  1. AI Prompt-to-Code generator.
  2. In-browser C++ code editor with syntax highlighting.
  3. Dynamic Library list & package manager with 1-click Install & Prune.
  4. Live build status, compiler logs, and remote serial monitor streaming in real-time.

- [ ] **Step 1: Write `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32 Worldwide AI Forge</title>
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/nord.min.css">
</head>
<body>
  <div class="app-layout">
    <header class="app-header">
      <div class="logo">⚡ ESP32 AI FORGE</div>
      <div class="device-badge" id="deviceStatus">Connecting to Cloud Hub...</div>
    </header>

    <div class="main-content">
      <!-- Left Panel: AI Studio & Editor -->
      <section class="editor-section">
        <div class="ai-prompt-box">
          <input type="text" id="aiPrompt" placeholder="Describe hardware behavior (e.g. Read BME280 on I2C and show on SSD1306)...">
          <button id="generateBtn" class="btn primary">✨ Generate with AI</button>
          <button id="deployBtn" class="btn success">🚀 Compile & Flash OTA</button>
        </div>
        <div class="editor-container">
          <textarea id="codeEditor"></textarea>
        </div>
      </section>

      <!-- Right Panel: Libraries & Console -->
      <section class="side-section">
        <div class="card library-card">
          <div class="card-header">
            <h3>📚 Active Libraries</h3>
            <button id="refreshLibsBtn" class="btn small">🔄</button>
          </div>
          <div class="lib-install-row">
            <input type="text" id="newLibInput" placeholder="Install library name...">
            <button id="installLibBtn" class="btn small primary">+ Add</button>
          </div>
          <ul id="libraryList" class="library-list"></ul>
        </div>

        <div class="card console-card">
          <div class="card-header">
            <h3>🖥️ Live Build & Remote Serial</h3>
            <button id="clearLogsBtn" class="btn small">Clear</button>
          </div>
          <pre id="consoleOutput" class="console-box"></pre>
        </div>
      </section>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js"></script>
  <script src="js/api.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `frontend/css/style.css`**

```css
:root {
  --bg-main: #0a0e17;
  --bg-card: #131b2a;
  --border-color: #212e44;
  --text-main: #f3f4f6;
  --text-muted: #9ca3af;
  --accent-blue: #3b82f6;
  --accent-green: #10b981;
  --accent-red: #ef4444;
}

* { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
body { background: var(--bg-main); color: var(--text-main); height: 100vh; overflow: hidden; }

.app-layout { display: flex; flex-direction: column; height: 100vh; }
.app-header { height: 50px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-weight: bold; }
.device-badge { font-size: 13px; padding: 4px 10px; border-radius: 20px; background: #26354d; color: var(--text-muted); }
.device-badge.online { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); }

.main-content { display: grid; grid-template-columns: 60% 40%; flex: 1; overflow: hidden; }
.editor-section { display: flex; flex-direction: column; border-right: 1px solid var(--border-color); }
.ai-prompt-box { padding: 12px; display: flex; gap: 8px; background: #0f1624; border-bottom: 1px solid var(--border-color); }
.ai-prompt-box input { flex: 1; background: var(--bg-card); border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 6px; color: var(--text-main); }

.btn { border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; color: white; background: #2d3748; }
.btn.primary { background: var(--accent-blue); }
.btn.success { background: var(--accent-green); }
.btn.small { padding: 4px 8px; font-size: 12px; }

.editor-container { flex: 1; position: relative; }
.CodeMirror { height: 100% !important; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; }

.side-section { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.card { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 12px; display: flex; flex-direction: column; }
.library-card { height: 40%; }
.console-card { height: 60%; flex: 1; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }

.lib-install-row { display: flex; gap: 6px; margin-bottom: 8px; }
.lib-install-row input { flex: 1; background: #0b111c; border: 1px solid var(--border-color); padding: 6px; border-radius: 4px; color: var(--text-main); font-size: 12px; }

.library-list { list-style: none; overflow-y: auto; flex: 1; font-size: 12px; }
.library-list li { display: flex; justify-content: space-between; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.library-list button { background: none; border: none; color: var(--accent-red); cursor: pointer; }

.console-box { flex: 1; background: #070a10; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #a3e635; overflow-y: auto; white-space: pre-wrap; }
```

- [ ] **Step 3: Implement `frontend/js/api.js` & `frontend/js/app.js`**

```javascript
// frontend/js/api.js
const API = {
  async getLibraries() {
    const res = await fetch('/api/libraries');
    return res.json();
  },
  async installLibrary(name) {
    const res = await fetch('/api/libraries/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return res.json();
  },
  async uninstallLibrary(name) {
    const res = await fetch('/api/libraries/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return res.json();
  },
  async generateAiProject(prompt, deviceId) {
    const res = await fetch('/api/build/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, deviceId })
    });
    return res.json();
  },
  async deployProject(payload) {
    const res = await fetch('/api/build/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }
};
```

```javascript
// frontend/js/app.js
let editor;
let activeLibraries = [];

document.addEventListener('DOMContentLoaded', () => {
  // Initialize CodeMirror Editor
  editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
    mode: 'text/x-c++src',
    theme: 'nord',
    lineNumbers: true,
    tabSize: 2
  });

  editor.setValue(`// Describe your project in the prompt above, or write C++ here
void setup() {
  pinMode(2, OUTPUT);
}

void loop() {
  digitalWrite(2, HIGH);
  delay(1000);
  digitalWrite(2, LOW);
  delay(1000);
}
`);

  // Connect WebSocket to Cloud Hub
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/ui`);

  const statusBadge = document.getElementById('deviceStatus');
  const consoleBox = document.getElementById('consoleOutput');

  function log(msg) {
    consoleBox.textContent += msg + '\n';
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT_DEVICE_LIST' || data.type === 'DEVICE_STATUS') {
      const isOnline = data.online || (data.devices && data.devices.length > 0);
      statusBadge.textContent = isOnline ? '● ESP32 Online' : '○ No Devices Connected';
      statusBadge.className = 'device-badge ' + (isOnline ? 'online' : '');
    } else if (data.type === 'BUILD_LOG' || data.type === 'SERIAL_STREAM') {
      log(data.log);
    }
  };

  // Load Libraries
  async function loadLibs() {
    const res = await API.getLibraries();
    if (res.success) {
      const list = document.getElementById('libraryList');
      list.innerHTML = '';
      activeLibraries = res.libraries;
      res.libraries.forEach(lib => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${lib.name} <small style="color:#6b7280">(${lib.version})</small></span>
                        <button onclick="removeLib('${lib.name}')">🗑️</button>`;
        list.appendChild(li);
      });
    }
  }
  loadLibs();

  document.getElementById('refreshLibsBtn').onclick = loadLibs;

  document.getElementById('installLibBtn').onclick = async () => {
    const input = document.getElementById('newLibInput');
    const name = input.value.trim();
    if (!name) return;
    log(`[LIB] Installing ${name}...`);
    const res = await API.installLibrary(name);
    log(res.output || 'Installed');
    input.value = '';
    loadLibs();
  };

  window.removeLib = async (name) => {
    if (!confirm(`Uninstall library: ${name}?`)) return;
    log(`[LIB] Removing ${name}...`);
    const res = await API.uninstallLibrary(name);
    log(res.output || 'Removed');
    loadLibs();
  };

  // AI Generation Button
  document.getElementById('generateBtn').onclick = async () => {
    const prompt = document.getElementById('aiPrompt').value.trim();
    if (!prompt) return alert('Please enter a project description.');
    log(`[AI] Generating C++ sketch for: "${prompt}"...`);
    try {
      const res = await API.generateAiProject(prompt, 'esp32-01');
      if (res.success && res.project) {
        editor.setValue(res.project.sketch_code);
        log(`[AI SUCCESS] Project: ${res.project.project_name}`);
        if (res.project.required_libraries?.length) {
          log(`[AI] Required libraries: ${res.project.required_libraries.join(', ')}`);
        }
      } else {
        log(`[AI ERROR] ${res.error}`);
      }
    } catch (err) {
      log(`[AI ERROR] ${err.message}`);
    }
  };

  // Deploy OTA Button
  document.getElementById('deployBtn').onclick = async () => {
    const sketchCode = editor.getValue();
    log(`[DEPLOY] Starting build & OTA deployment...`);
    try {
      const res = await API.deployProject({
        sketchCode,
        requiredLibraries: [],
        deviceId: 'esp32-01',
        autoPrune: true
      });
      if (res.success) {
        log(`[DEPLOY SUCCESS] ${res.message}`);
      } else {
        log(`[DEPLOY FAILED] ${res.error}`);
      }
    } catch (err) {
      log(`[DEPLOY ERROR] ${err.message}`);
    }
  };

  document.getElementById('clearLogsBtn').onclick = () => {
    consoleBox.textContent = '';
  };
});
```

---

### Task 8: End-to-End System Verification & Deployment Guide

**Files:**
- Create: `firmware/ESP32_Guardian_Firmware.ino`
- Create: `README.md`

**Interfaces:**
- Consumes: All completed components.
- Produces: Tested, operational factory firmware and deployment instructions for hosting on cloud platforms (Render, Railway, Fly.io, or VPS).

- [ ] **Step 1: Create baseline factory firmware (`firmware/ESP32_Guardian_Firmware.ino`)**

```cpp
#include "include/GuardianConfig.h"
#include "include/GuardianAgent.h"

GuardianAgentClass Guardian;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("[BOOT] Starting ESP32 AI Dynamic Runtime Factory Image...");

  // Launches the permanent cloud tunnel on Core 0
  Guardian.begin();
  
  // Built-in status LED indicator
  pinMode(2, OUTPUT);
}

void loop() {
  // Core 1 baseline blink idle loop
  digitalWrite(2, HIGH);
  delay(1000);
  digitalWrite(2, LOW);
  delay(1000);
}
```

- [ ] **Step 2: Create comprehensive deployment documentation (`README.md`)**

Document step-by-step instructions on:
1. Running the automated toolchain setup script.
2. Configuring `.env` with Gemini API credentials.
3. Launching the backend server.
4. Flashing the baseline factory image to the ESP32 via USB once.
5. Performing subsequent updates 100% remotely over the global web dashboard.

- [ ] **Step 3: Verification gate**
- Run test suite: `cd server && npm test`
- Verify `arduino-cli` detects ESP32 platform
- Verify web console boots on `http://localhost:3000`

---

## Execution Handoff

Plan complete and saved to `plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Fresh subagent dispatched per task, review checkpoints between tasks, fast iteration.
**2. Inline Execution** - Execute tasks sequentially in this session with verification checkpoints.

**Which approach would you like to take?**
