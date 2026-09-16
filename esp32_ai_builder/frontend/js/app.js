let editor;
let activeLibraries = [];
const DEFAULT_DEVICE_ID = 'esp32-01';

const DIGITAL_PINS = [
  { pin: 2, label: 'GPIO 2 (LED)' },
  { pin: 4, label: 'GPIO 4' },
  { pin: 5, label: 'GPIO 5' },
  { pin: 12, label: 'GPIO 12' },
  { pin: 13, label: 'GPIO 13' },
  { pin: 14, label: 'GPIO 14' },
  { pin: 15, label: 'GPIO 15' },
  { pin: 16, label: 'GPIO 16' },
  { pin: 17, label: 'GPIO 17' },
  { pin: 18, label: 'GPIO 18' },
  { pin: 19, label: 'GPIO 19' },
  { pin: 21, label: 'GPIO 21 (SDA)' },
  { pin: 22, label: 'GPIO 22 (SCL)' },
  { pin: 23, label: 'GPIO 23' },
  { pin: 25, label: 'GPIO 25 (DAC1)' },
  { pin: 26, label: 'GPIO 26 (DAC2)' },
  { pin: 27, label: 'GPIO 27' },
  { pin: 32, label: 'GPIO 32' },
  { pin: 33, label: 'GPIO 33' }
];

const ANALOG_PINS = [
  { pin: 32, label: 'GPIO 32 (ADC1_4)' },
  { pin: 33, label: 'GPIO 33 (ADC1_5)' },
  { pin: 34, label: 'GPIO 34 (ADC1_6)' },
  { pin: 35, label: 'GPIO 35 (ADC1_7)' },
  { pin: 36, label: 'GPIO 36 (SENSOR_VP)' },
  { pin: 39, label: 'GPIO 39 (SENSOR_VN)' }
];

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize CodeMirror
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

  // 2. Tab Navigation
  const tabForgeBtn = document.getElementById('tabForgeBtn');
  const tabGpioBtn = document.getElementById('tabGpioBtn');
  const forgeTabContent = document.getElementById('forgeTabContent');
  const gpioTabContent = document.getElementById('gpioTabContent');

  tabForgeBtn.onclick = () => {
    tabForgeBtn.classList.add('active');
    tabGpioBtn.classList.remove('active');
    forgeTabContent.classList.add('active');
    gpioTabContent.classList.remove('active');
    editor.refresh();
  };

  tabGpioBtn.onclick = () => {
    tabGpioBtn.classList.add('active');
    tabForgeBtn.classList.remove('active');
    gpioTabContent.classList.add('active');
    forgeTabContent.classList.remove('active');
    // Request fresh scan
    API.scanAllPins(DEFAULT_DEVICE_ID);
  };

  // 3. Connect WebSocket to Cloud Hub
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/ui`);

  const statusBadge = document.getElementById('deviceStatus');
  const consoleBox = document.getElementById('consoleOutput');
  const hwLogBox = document.getElementById('hwEventLog');

  function log(msg) {
    consoleBox.textContent += msg + '\n';
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }

  function logHw(msg) {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = 'hw-log-entry';
    div.innerHTML = `<span class="hw-log-time">[${time}]</span> ${msg}`;
    hwLogBox.prepend(div);
  }

  document.getElementById('clearHwLogsBtn').onclick = () => {
    hwLogBox.innerHTML = '';
  };

  // 4. WebSocket Dispatcher
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT_DEVICE_LIST' || data.type === 'DEVICE_STATUS') {
        const isOnline = data.online || (data.devices && data.devices.length > 0);
        statusBadge.textContent = isOnline ? '● ESP32 Online' : '○ No Devices Connected';
        statusBadge.className = 'device-badge ' + (isOnline ? 'online' : '');
      } else if (data.type === 'BUILD_LOG' || data.type === 'SERIAL_STREAM') {
        log(data.log);
      } else if (data.type === 'PIN_STATE') {
        applyPinState(data.pin, data.mode, data.value);
        logHw(`GPIO ${data.pin} [${data.mode}]: ${data.value}`);
      } else if (data.type === 'ALL_PINS_REPORT') {
        applyAllPinsReport(data.data || data);
      } else if (data.type === 'TELEMETRY') {
        updateTelemetryPills(data.data);
      }
    } catch (err) {
      console.error('WS Parse Error', err);
    }
  };

  function updateTelemetryPills(data) {
    if (!data) return;
    if (data.wifi_rssi !== undefined) {
      document.getElementById('teleWifi').textContent = `📶 RSSI: ${data.wifi_rssi} dBm`;
    }
    if (data.free_heap !== undefined) {
      document.getElementById('teleHeap').textContent = `💾 Heap: ${Math.round(data.free_heap / 1024)} KB`;
    }
    if (data.uptime_ms !== undefined) {
      const sec = Math.floor(data.uptime_ms / 1000);
      const min = Math.floor(sec / 60);
      document.getElementById('teleUptime').textContent = `⏱️ Uptime: ${min}m ${sec % 60}s`;
    }
  }

  // 5. Build Interactive GPIO Pin Grid
  const digitalGrid = document.getElementById('digitalPinsGrid');
  const analogGrid = document.getElementById('analogSensorsGrid');

  DIGITAL_PINS.forEach(({ pin, label }) => {
    const card = document.createElement('div');
    card.className = 'pin-card';
    card.id = `pin-card-${pin}`;
    card.innerHTML = `
      <div class="pin-card-header">
        <span class="pin-num">${label}</span>
        <span class="pin-status-dot" id="dot-${pin}"></span>
      </div>
      <div class="pin-controls">
        <button class="pin-toggle-btn" id="toggle-${pin}" onclick="toggleDigitalPin(${pin})">OFF</button>
        <button class="pin-read-btn" onclick="readDigitalPin(${pin})">👁️</button>
      </div>
      <div class="pin-pwm-row">
        <div class="pin-pwm-label">
          <span>PWM Output</span>
          <span id="pwm-val-${pin}">0</span>
        </div>
        <input type="range" class="pin-pwm-slider" id="pwm-${pin}" min="0" max="255" value="0"
               oninput="onPwmSliderChange(${pin}, this.value)">
      </div>
    `;
    digitalGrid.appendChild(card);
  });

  ANALOG_PINS.forEach(({ pin, label }) => {
    const card = document.createElement('div');
    card.className = 'sensor-card';
    card.id = `sensor-card-${pin}`;
    card.innerHTML = `
      <div class="sensor-header">
        <span class="sensor-title">${label}</span>
        <span class="sensor-val-badge" id="sensor-val-${pin}">0</span>
      </div>
      <div class="sensor-bar-wrap">
        <div class="sensor-bar" id="sensor-bar-${pin}"></div>
      </div>
      <div class="sensor-footer">
        <span id="sensor-volt-${pin}">0.00 V</span>
        <button class="btn small" onclick="readAnalogPin(${pin})">Read</button>
      </div>
    `;
    analogGrid.appendChild(card);
  });

  // 6. Real-time UI Update Handlers
  function applyPinState(pin, mode, value) {
    const dot = document.getElementById(`dot-${pin}`);
    const toggle = document.getElementById(`toggle-${pin}`);
    const pwmVal = document.getElementById(`pwm-val-${pin}`);
    const pwmSlider = document.getElementById(`pwm-${pin}`);

    if (mode === 'OUTPUT' || mode === 'INPUT') {
      const isHigh = Boolean(value);
      if (dot) {
        if (isHigh) dot.classList.add('active');
        else dot.classList.remove('active');
      }
      if (toggle) {
        toggle.textContent = isHigh ? 'ON (HIGH)' : 'OFF (LOW)';
        if (isHigh) toggle.classList.add('on');
        else toggle.classList.remove('on');
      }
    } else if (mode === 'PWM') {
      if (pwmVal) pwmVal.textContent = value;
      if (pwmSlider) pwmSlider.value = value;
      if (dot) {
        if (value > 0) dot.classList.add('active');
        else dot.classList.remove('active');
      }
    } else if (mode === 'ANALOG') {
      applyAnalogState(pin, value);
    }
  }

  function applyAnalogState(pin, rawVal) {
    const valBadge = document.getElementById(`sensor-val-${pin}`);
    const bar = document.getElementById(`sensor-bar-${pin}`);
    const voltLabel = document.getElementById(`sensor-volt-${pin}`);

    if (valBadge) valBadge.textContent = rawVal;
    const percent = Math.min(100, Math.max(0, (rawVal / 4095) * 100));
    if (bar) bar.style.width = `${percent}%`;
    const voltage = ((rawVal / 4095.0) * 3.3).toFixed(2);
    if (voltLabel) voltLabel.textContent = `${voltage} V`;
  }

  function applyAllPinsReport(report) {
    if (!report) return;
    if (report.digital) {
      Object.entries(report.digital).forEach(([pinStr, val]) => {
        applyPinState(Number(pinStr), 'OUTPUT', val);
      });
    }
    if (report.analog) {
      Object.entries(report.analog).forEach(([pinStr, val]) => {
        applyAnalogState(Number(pinStr), val);
      });
    }
    const now = new Date().toLocaleTimeString();
    document.getElementById('teleLastScan').textContent = `🕒 Last Scan: ${now}`;
    logHw(`⚡ Master Scan received: updated ${Object.keys(report.digital || {}).length} digital pins & ${Object.keys(report.analog || {}).length} analog sensors`);
  }

  // 7. Global Hardware Actions (attached to window for onclick handlers)
  window.toggleDigitalPin = async (pin) => {
    const toggle = document.getElementById(`toggle-${pin}`);
    const willBeOn = !toggle.classList.contains('on');
    logHw(`Switching GPIO ${pin} to ${willBeOn ? 'HIGH' : 'LOW'}...`);
    const res = await API.controlPin(DEFAULT_DEVICE_ID, {
      action: 'DIGITAL_WRITE',
      pin,
      value: willBeOn ? 1 : 0
    });
    if (!res.success) logHw(`Error GPIO ${pin}: ${res.error}`);
  };

  window.readDigitalPin = async (pin) => {
    logHw(`Reading GPIO ${pin}...`);
    const res = await API.controlPin(DEFAULT_DEVICE_ID, {
      action: 'DIGITAL_READ',
      pin
    });
    if (!res.success) logHw(`Error reading GPIO ${pin}: ${res.error}`);
  };

  let pwmDebounce = {};
  window.onPwmSliderChange = (pin, val) => {
    const valLabel = document.getElementById(`pwm-val-${pin}`);
    if (valLabel) valLabel.textContent = val;
    clearTimeout(pwmDebounce[pin]);
    pwmDebounce[pin] = setTimeout(async () => {
      logHw(`Setting GPIO ${pin} PWM duty: ${val}...`);
      await API.controlPin(DEFAULT_DEVICE_ID, {
        action: 'PWM_WRITE',
        pin,
        value: Number(val)
      });
    }, 150);
  };

  window.readAnalogPin = async (pin) => {
    logHw(`Reading analog sensor GPIO ${pin}...`);
    const res = await API.controlPin(DEFAULT_DEVICE_ID, {
      action: 'ANALOG_READ',
      pin
    });
    if (!res.success) logHw(`Error reading sensor GPIO ${pin}: ${res.error}`);
  };

  // 8. Toolbar Button Handlers
  document.getElementById('scanAllPinsBtn').onclick = async () => {
    logHw('Dispatched master scan command to ESP32...');
    const res = await API.scanAllPins(DEFAULT_DEVICE_ID);
    if (!res.success) logHw(`Scan request error: ${res.error}`);
  };

  document.getElementById('emergencyStopBtn').onclick = async () => {
    logHw('🛑 EMERGENCY STOP: Turning off all digital outputs and PWM...');
    for (const { pin } of DIGITAL_PINS) {
      API.controlPin(DEFAULT_DEVICE_ID, { action: 'DIGITAL_WRITE', pin, value: 0 });
    }
  };

  // 9. AI Hardware Command Assistant
  const aiHwInput = document.getElementById('aiHwCommandInput');
  const aiHwBtn = document.getElementById('sendAiHwBtn');
  const aiHwFeedback = document.getElementById('aiHwFeedback');

  async function executeAiHwCommand() {
    const prompt = aiHwInput.value.trim();
    if (!prompt) return;
    aiHwFeedback.classList.remove('hidden');
    aiHwFeedback.textContent = `🤖 Processing: "${prompt}"...`;
    logHw(`[AI Hardware] Command: "${prompt}"`);

    try {
      const res = await API.sendAiHardwareCommand(DEFAULT_DEVICE_ID, prompt);
      if (res.success) {
        aiHwFeedback.textContent = `✅ ${res.explanation || 'Commands dispatched'}`;
        logHw(`[AI Action] ${res.explanation}`);
        if (res.actions && res.actions.length > 0) {
          res.actions.forEach(act => {
            logHw(`  ➔ ${act.type} ${act.pin !== undefined ? 'Pin ' + act.pin : ''} ${act.value !== undefined ? 'Val ' + act.value : ''}`);
          });
        }
      } else {
        aiHwFeedback.textContent = `⚠️ ${res.error}`;
        logHw(`[AI Error] ${res.error}`);
      }
    } catch (err) {
      aiHwFeedback.textContent = `❌ ${err.message}`;
      logHw(`[AI Error] ${err.message}`);
    }
  }

  aiHwBtn.onclick = executeAiHwCommand;
  aiHwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeAiHwCommand();
  });

  // 10. Libraries Management
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

  // 11. AI Generation Button
  document.getElementById('generateBtn').onclick = async () => {
    const prompt = document.getElementById('aiPrompt').value.trim();
    if (!prompt) return alert('Please enter a project description.');
    log(`[AI] Generating C++ sketch for: "${prompt}"...`);
    try {
      const res = await API.generateAiProject(prompt, DEFAULT_DEVICE_ID);
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

  // 12. Deploy OTA Button
  document.getElementById('deployBtn').onclick = async () => {
    const sketchCode = editor.getValue();
    const pruneBox = document.getElementById('autoPruneCheckbox');
    const autoPrune = pruneBox ? pruneBox.checked : true;

    log(`[DEPLOY] Starting build & OTA deployment (Auto-prune: ${autoPrune})...`);
    try {
      const res = await API.deployProject({
        sketchCode,
        requiredLibraries: activeLibraries?.map(l => l.name) || [],
        deviceId: DEFAULT_DEVICE_ID,
        autoPrune,
        serverHost: (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? window.location.hostname : undefined,
        serverPort: window.location.port ? parseInt(window.location.port, 10) : (window.location.protocol === 'https:' ? 443 : 80)
      });
      if (res.success) {
        log(`[DEPLOY SUCCESS] ${res.message}`);
        // Refresh active libraries to reflect newly auto-installed or auto-pruned libraries
        setTimeout(loadLibs, 1000);
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
