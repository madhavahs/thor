const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const config = require('./src/config');
const deviceManager = require('./src/tunnel/deviceManager');
const { callGemini } = require('./src/ai/geminiClient');
const { CODE_GENERATION_PROMPT, HARDWARE_CONTROL_PROMPT } = require('./src/ai/promptTemplates');
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
        } else if (parsed.type === 'PIN_STATE') {
          deviceManager.updatePinState(deviceId, parsed.pin, parsed.mode, parsed.value);
        } else if (parsed.type === 'ALL_PINS_REPORT') {
          deviceManager.updateAllPinsReport(deviceId, parsed);
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
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

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
  const {
    sketchCode,
    requiredLibraries = [],
    deviceId = 'esp32-01',
    autoPrune = true,
    serverHost: customHost,
    serverPort: customPort,
    wifiSsid: customSsid,
    wifiPass: customPass
  } = req.body;

  // Determine actual server host & port from request headers
  const hostHeader = req.headers.host || '';
  const parts = hostHeader.split(':');
  const detectedHost = parts[0];
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  const detectedPort = parts[1] ? parseInt(parts[1], 10) : (isHttps ? 443 : 80);

  const serverHost = customHost || (detectedHost && detectedHost !== 'localhost' && detectedHost !== '127.0.0.1' ? detectedHost : undefined);
  const serverPort = customPort ? parseInt(customPort, 10) : detectedPort;

  // Look up device info if available
  const dev = deviceManager.devices.get(deviceId);
  const wifiSsid = customSsid || (dev?.info?.wifi_ssid) || undefined;
  const wifiPass = customPass || undefined;

  const buildResult = await compileWithSelfHealing(sketchCode, requiredLibraries, {
    deviceId,
    autoPrune,
    serverHost,
    serverPort,
    wifiSsid,
    wifiPass,
    deviceToken: config.deviceAuthToken,
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
  const proto = isHttps ? 'https' : 'http';
  const fwUrl = `${proto}://${host}/firmware/${deviceId}/bin/${deviceId}.ino.bin`;
  deviceManager.markFlashing(deviceId, 25000);
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

// Hardware GPIO, Sensor, and Actuator Control APIs
app.get('/api/device/:deviceId/pins', (req, res) => {
  const { deviceId } = req.params;
  const dev = deviceManager.devices.get(deviceId);
  if (!dev) return res.status(404).json({ success: false, error: 'Device is offline or not registered' });
  res.json({ success: true, pinStates: dev.pinStates || {} });
});

app.post('/api/device/:deviceId/pin', (req, res) => {
  const { deviceId } = req.params;
  const { action, pin, value = 0, mode = 'OUTPUT' } = req.body;
  const pinNum = Number(pin);

  if (isNaN(pinNum) || pinNum < 0 || pinNum > 39) {
    return res.status(400).json({ success: false, error: 'Invalid GPIO pin number (0-39)' });
  }

  let cmd;
  if (action === 'DIGITAL_WRITE') {
    cmd = { type: 'DIGITAL_WRITE', pin: pinNum, value: value ? 1 : 0 };
  } else if (action === 'PWM_WRITE') {
    cmd = { type: 'PWM_WRITE', pin: pinNum, value: Math.min(255, Math.max(0, Number(value))) };
  } else if (action === 'DIGITAL_READ') {
    cmd = { type: 'DIGITAL_READ', pin: pinNum };
  } else if (action === 'ANALOG_READ') {
    cmd = { type: 'ANALOG_READ', pin: pinNum };
  } else if (action === 'PIN_MODE') {
    cmd = { type: 'PIN_MODE', pin: pinNum, mode };
  } else {
    return res.status(400).json({ success: false, error: 'Unsupported pin action' });
  }

  const sent = deviceManager.sendToDevice(deviceId, cmd);
  if (!sent) {
    return res.status(404).json({ success: false, error: 'ESP32 device is offline' });
  }

  res.json({ success: true, message: `Command dispatched: ${action} on GPIO ${pinNum}` });
});

app.post('/api/device/:deviceId/scan', (req, res) => {
  const { deviceId } = req.params;
  const sent = deviceManager.sendToDevice(deviceId, { type: 'SCAN_ALL_PINS' });
  if (!sent) {
    return res.status(404).json({ success: false, error: 'ESP32 device is offline' });
  }
  res.json({ success: true, message: 'Scan all pins requested from ESP32' });
});

app.post('/api/device/:deviceId/ai-command', async (req, res) => {
  const { deviceId } = req.params;
  const { command } = req.body;
  if (!command) return res.status(400).json({ success: false, error: 'Command text is required' });

  try {
    const aiResp = await callGemini(HARDWARE_CONTROL_PROMPT, command);
    const actions = aiResp.actions || [];
    let sentCount = 0;

    for (const act of actions) {
      if (deviceManager.sendToDevice(deviceId, act)) {
        sentCount++;
      }
    }

    res.json({
      success: true,
      explanation: aiResp.explanation,
      actions,
      dispatched: sentCount,
      online: deviceManager.devices.has(deviceId)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`[ESP32 AI FORGE] Server listening worldwide on port ${config.port}`);
  });
}

module.exports = { app, server };
