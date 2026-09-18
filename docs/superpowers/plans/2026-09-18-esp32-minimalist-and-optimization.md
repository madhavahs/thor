# ESP32 AI Forge: Minimalist Redesign, Mobile Responsiveness, Code Hot-Swap & Memory Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the ESP32 AI Forge into a minimalist White, Green, and Black dashboard with universal custom scrollbars, full mobile/tablet responsiveness, clean old-code deletion during OTA without web disconnection, and aggressive Flash/RAM footprint optimization while preserving 100% of existing functionality.

**Architecture:** 
- **Frontend Presentation Layer:** Replaced cyberpunk dark theme with a clean, high-contrast, editorial minimalist aesthetic using Pure White (`#ffffff`), bone/slate off-white (`#f8fafc`), deep charcoal/black (`#0f172a`), and emerald/mint green (`#059669` / `#10b981`). Responsive flex/grid architecture with custom slim scrollbars across all scroll containers and mobile-first touch optimization.
- **OTA Code Swap & Continuity Engine:** Build engine cleans previous sketch files before compile; Guardian Agent maintains WebSocket heartbeat and fast 500ms reconnect with NVS credentials so the device re-attaches immediately; the UI handles flashing grace periods seamlessly without false disconnect alarms.
- **ESP32 Space Optimization Toolchain:** Integrates `-Os -DCORE_DEBUG_LEVEL=0 -ffunction-sections -fdata-sections -Wl,--gc-sections` compiler optimization flags, halves FreeRTOS task stack from 8KB to 4KB, and optimizes OTA buffer allocations to drastically reduce binary flash size and conserve SRAM.

**Tech Stack:** 
- HTML5, Modern CSS (CSS Variables, Flexbox, Bento Grid, Custom Scrollbars, Media Queries)
- JavaScript (Vanilla ES6+, CodeMirror 5 with minimalist theme, WebSockets)
- Node.js, Express, `arduino-cli`, Google Gemini API
- ESP32 C++ (Arduino-ESP32 Core 3.x), FreeRTOS, `WebSocketsClient`, `Update.h`, `<Preferences.h>`

## Global Constraints
- UI must strictly follow White, Green, and Black minimalist design (no blue/purple gradients, no heavy drop shadows).
- All tabs and panels must feature accessible, custom-styled scrollbars with no clipped overflow.
- Mobile layout must support screens down to 360px width with touch targets >= 44px.
- When new code is compiled, stale code/files must be purged; web connectivity must not be lost; all hardware RPC functions (`DIGITAL_WRITE`, `PWM_WRITE`, `SCAN_ALL_PINS`, `PIN_MODE`) must perform identically.
- ESP32 flash and RAM footprint must be minimized without breaking any existing features.

---

### File Structure Map

```text
esp32_ai_builder/
├── frontend/
│   ├── css/
│   │   └── style.css                 # Refactored: Minimalist White/Green/Black theme + custom scrollbars + mobile queries
│   ├── js/
│   │   ├── app.js                   # Refactored: Mobile view toggles, OTA flashing grace period, theme support
│   │   └── api.js                   # REST & WebSocket client
│   └── index.html                   # Refactored: Mobile viewport, clean markup, minimalist layout
├── server/
│   ├── server.js                    # Verified & maintained: OTA dispatch and hardware RPC
│   └── src/
│       ├── compiler/
│       │   ├── buildEngine.js       # Updated: Workspace purge of old sketch files + -Os / -DCORE_DEBUG_LEVEL=0 flags
│       │   ├── codeInjector.js      # Updated: Clean code replacement & Guardian injection
│       │   └── libraryManager.js    # Maintained: Auto-detect, auto-install, and auto-prune
│       └── tunnel/
│           └── deviceManager.js     # Updated: Flashing state tracking & reconnect grace period
└── firmware/
    ├── partitions.csv               # Maintained: 4MB dual-OTA partition table
    └── include/
        ├── GuardianConfig.h         # Maintained: Default network configuration
        └── GuardianAgent.h          # Updated: 4KB task stack, 2KB dynamic buffer, fast 500ms reconnect
```

---

## Tasks

### Task 1: Minimalist White, Green & Black Theme with Universal Scrollbars

**Files:**
- Modify: `frontend/css/style.css`
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: Clean HTML structure and semantic classes.
- Produces: Polished CSS design tokens, flat bento grid, universal custom scrollbars, and high-contrast typography.

- [ ] **Step 1: Update design tokens and universal scrollbars in `frontend/css/style.css`**
Define minimalist color palette (`--bg-page: #ffffff; --bg-surface: #f8fafc; --text-primary: #0f172a; --text-secondary: #64748b; --border-color: #e2e8f0; --accent-green: #059669; --accent-green-hover: #047857; --accent-green-subtle: #ecfdf5; --accent-black: #0f172a;`).
Add universal `::-webkit-scrollbar` and `scrollbar-width: thin;` styles across `*`, `.console-box`, `.library-list`, `.hw-log-box`, `.pins-grid`, `.sensors-grid`, and `.tab-content`.

- [ ] **Step 2: Style navigation header, bento cards, and buttons**
Replace dark blue headers and cards with crisp white surface cards, 1px subtle borders (`#e2e8f0`), minimalist tab pills (black active tab with white text), and distinct action buttons:
- Black CTA: `#0f172a`
- Green Flash CTA: `#059669`
- White Outline Secondary: `border: 1px solid #e2e8f0; color: #0f172a`
- Red Stop: `#ef4444`

- [ ] **Step 3: Style CodeMirror and Console to match White, Green, and Black**
Style `.CodeMirror` to clean light theme with subtle gray borders, off-black text, emerald keywords (`#059669`), and styled cursor.
Style `.console-box` and `.hw-log-box` as sleek high-contrast charcoal (`#0f172a`) containers with vibrant green terminal text (`#10b981`), ensuring custom scrollbars are visible.

- [ ] **Step 4: Verify CSS syntax and render**
Verify that all elements render cleanly in White, Green, and Black with no remaining dark blue or purple accents.

---

### Task 2: Mobile and Tablet Responsiveness

**Files:**
- Modify: `frontend/css/style.css`
- Modify: `frontend/index.html`
- Modify: `frontend/js/app.js`

**Interfaces:**
- Consumes: Mobile viewport widths (< 900px, < 600px).
- Produces: Stacked single-column layouts, mobile sub-tabs for Editor / Side panel, wrapped toolbars, and touch-friendly controls.

- [ ] **Step 1: Add mobile responsive breakpoints in `frontend/css/style.css`**
Add `@media (max-width: 900px)` and `@media (max-width: 600px)` rules:
- `.app-header`: Flex-wrap, height auto, gap 8px, compact badge.
- `.main-content`: Switch from `60% 40%` grid to single column (`1fr`) with full width.
- `.editor-section`: Height 45vh on mobile, or toggleable sub-panels.
- `.side-section`: Full width below editor or toggleable.
- `.ai-prompt-box`: Flex wrap, full-width inputs, touch buttons.
- `.gpio-sections-grid`: Switch from `58% 42%` to single column (`1fr`).
- `.gpio-master-toolbar`: Flex wrap, auto-sizing buttons.
- `.pins-grid`, `.sensors-grid`: Minimum item width `135px`, comfortable 44px touch targets.

- [ ] **Step 2: Add Mobile Panel Switcher for Tab 1 in `frontend/index.html` and `frontend/js/app.js`**
Add a lightweight sub-tab toggle on mobile for AI Firmware Forge: `[Code Editor] [Libraries] [Build & Serial Logs]` so mobile users can switch views easily without endless scrolling.

- [ ] **Step 3: Test mobile layout behavior**
Verify all interactive controls, sliders, and buttons are comfortably tap-friendly and content does not overflow screen boundaries horizontally.

---

### Task 3: Clean Code Replacement & Seamless Online Continuity

**Files:**
- Modify: `server/src/compiler/buildEngine.js`
- Modify: `server/src/compiler/codeInjector.js`
- Modify: `firmware/include/GuardianAgent.h`
- Modify: `frontend/js/app.js`
- Modify: `server/src/tunnel/deviceManager.js`

**Interfaces:**
- Consumes: New sketch code from user.
- Produces: Clean build directory without old artifacts, intact Guardian agent with preserved NVS settings, fast reconnect, and uninterrupted UI state.

- [ ] **Step 1: Implement workspace purge of old sketch files in `server/src/compiler/buildEngine.js`**
Before writing new sketch code, remove any previous `.ino`, `.cpp`, `.h` (except pre-warmed cache) and old `.bin` in `workspace/{deviceId}`. This guarantees that only the current working code is compiled and old files cannot interfere.

- [ ] **Step 2: Clean code injection in `server/src/compiler/codeInjector.js`**
Ensure user code is cleanly wrapped and injected with `Guardian.begin()` in `setup()`, while preserving all global functions, includes, and variables.

- [ ] **Step 3: Non-blocking OTA download and rapid reconnection in `firmware/include/GuardianAgent.h`**
In `performOTA()`:
- Service `wsClient.loop()` periodically during the download loop so the WebSocket connection remains alive.
- Send live percentage logs to the server.
- Set `wsClient.setReconnectInterval(500);` (reduced from 3000ms) for near-instant reconnection once rebooted into the new firmware.
- Preserve NVS storage of working host, port, Wi-Fi credentials across reboots so the ESP32 never gets lost.

- [ ] **Step 4: Update UI and DeviceManager for smooth OTA state transition**
When OTA starts, UI displays `● Flashing & Hot-Swapping Firmware...` (orange/green pulse) rather than dropping abruptly to offline. When device reconnects (typically within 2-3 seconds), it seamlessly updates to `● ESP32 Online`.

---

### Task 4: ESP32 Flash & RAM Footprint Space Optimization

**Files:**
- Modify: `server/src/compiler/buildEngine.js`
- Modify: `firmware/include/GuardianAgent.h`

**Interfaces:**
- Consumes: `arduino-cli compile` configuration and FreeRTOS task configuration.
- Produces: Shrunk binary size (saving 150KB–300KB Flash) and halved task stack (saving 4KB RAM) while maintaining 100% functionality.

- [ ] **Step 1: Add GCC size optimization flags in `server/src/compiler/buildEngine.js`**
Pass size-optimization properties to `arduino-cli compile`:
- `--build-property`, `compiler.optimization_flags=-Os -DCORE_DEBUG_LEVEL=0 -ffunction-sections -fdata-sections -Wl,--gc-sections`
- `--build-property`, `compiler.c.extra_flags=-Os -DCORE_DEBUG_LEVEL=0`
- `--build-property`, `compiler.cpp.extra_flags=-Os -DCORE_DEBUG_LEVEL=0`
This eliminates unused debug strings and performs dead-code elimination at link time.

- [ ] **Step 2: Optimize FreeRTOS task stack and buffers in `firmware/include/GuardianAgent.h`**
- Reduce FreeRTOS `GuardianTask` stack from `8192` bytes to `4096` bytes, saving 4 KB of critical SRAM.
- In `performOTA()`, allocate dynamic 2048-byte stream buffer that is freed immediately after flashing finishes, preventing stack overflow.
- Optimize JSON serialization buffers across telemetry and pin state reports.

- [ ] **Step 3: Verify all features remain identical**
Verify that:
- Pin RPC (`DIGITAL_WRITE`, `PWM_WRITE`, `DIGITAL_READ`, `ANALOG_READ`, `SCAN_ALL_PINS`, `PIN_MODE`) continues to operate flawlessly.
- Serial log relaying continues to work.
- Telemetry reporting continues to work.
- 45s fail-safe rollback remains fully active.

---

### Task 5: End-to-End Verification & Testing

- [ ] **Step 1: Test server syntax and API endpoints**
Run unit tests and verify `server/server.js`, `buildEngine.js`, and `codeInjector.js` execute without error.

- [ ] **Step 2: Visual and mobile verification**
Verify the UI in browser under desktop and mobile viewports (simulating iPhone/Android viewports). Confirm White, Green, and Black styling and scrollbars.

- [ ] **Step 3: Document changes**
Commit changes with clean semantic commit messages.
