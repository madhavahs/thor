const http = require('http');
const path = require('path');
const fs = require('fs');
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

// Helper for Service Discovery & Health Metadata
function getServiceHealth() {
  return {
    service: "ESP32 AI Auto Builder",
    version: "1.1.0",
    status: "online",
    model: config.geminiModel || "gemini-3.1-flash-lite",
    fqbn: "esp32:esp32:esp32",
    port: 10000,
    endpoints: {
      health: "/health",
      command: "POST /command",
      manifest: "GET /device/{device_id}/manifest",
      firmware: "GET /device/{device_id}/firmware"
    }
  };
}

// 1. Health & Discovery Endpoints
app.get('/health', (req, res) => res.json(getServiceHealth()));
app.get('/api/health', (req, res) => res.json(getServiceHealth()));

// 2. Command Endpoint (Universal Natural Language, RPC & Build Commander)
app.post('/command', async (req, res) => {
  const {
    command,
    prompt,
    device_id,
    deviceId = device_id || 'esp32-01',
    action,
    pin,
    value,
    mode,
    code,
    sketchCode = code
  } = req.body;

  // Case A: Direct pin action dispatch
  if (action) {
    const pinNum = Number(pin);
    let cmd;
    if (action === 'DIGITAL_WRITE') cmd = { type: 'DIGITAL_WRITE', pin: pinNum, value: value ? 1 : 0 };
    else if (action === 'PWM_WRITE') cmd = { type: 'PWM_WRITE', pin: pinNum, value: Math.min(255, Math.max(0, Number(value))) };
    else if (action === 'DIGITAL_READ') cmd = { type: 'DIGITAL_READ', pin: pinNum };
    else if (action === 'ANALOG_READ') cmd = { type: 'ANALOG_READ', pin: pinNum };
    else if (action === 'PIN_MODE') cmd = { type: 'PIN_MODE', pin: pinNum, mode: mode || 'OUTPUT' };
    else if (action === 'SCAN_ALL_PINS') cmd = { type: 'SCAN_ALL_PINS' };

    if (cmd) {
      const sent = deviceManager.sendToDevice(deviceId, cmd);
      return res.json({
        success: sent,
        type: 'action',
        action,
        dispatched: sent,
        message: sent ? `Dispatched ${action} to ${deviceId}` : `Device ${deviceId} is offline`
      });
    }
  }

  // Case B: Direct C++ sketch code deploy
  if (sketchCode) {
    try {
      const hostHeader = req.headers.host || '';
      const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
      const detectedPort = hostHeader.includes(':') ? parseInt(hostHeader.split(':')[1], 10) : (isHttps ? 443 : 80);
      const buildResult = await compileWithSelfHealing(sketchCode, [], {
        deviceId,
        autoPrune: true,
        serverHost: hostHeader.split(':')[0],
        serverPort: detectedPort,
        deviceToken: config.deviceAuthToken
      });
      if (!buildResult.success) {
        return res.status(400).json({ success: false, error: buildResult.stderr || buildResult.stdout });
      }
      const proto = isHttps ? 'https' : 'http';
      const fwUrl = `${proto}://${hostHeader}/device/${deviceId}/firmware`;
      deviceManager.markFlashing(deviceId, 25000);
      deviceManager.sendToDevice(deviceId, { type: 'START_OTA', url: fwUrl });
      return res.json({
        success: true,
        type: 'deploy',
        firmware_url: fwUrl,
        message: 'Firmware compiled and OTA update dispatched.'
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Case C: Natural language instruction (Hardware command or sketch generation)
  const cmdText = command || prompt;
  if (cmdText) {
    const isBuildPrompt = /build|sketch|compile|write code|program|code for|firmware/i.test(cmdText);
    if (isBuildPrompt) {
      try {
        const aiResp = await callGemini(CODE_GENERATION_PROMPT, cmdText);
        return res.json({ success: true, type: 'code_generated', project: aiResp });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      try {
        const aiResp = await callGemini(HARDWARE_CONTROL_PROMPT, cmdText);
        const actions = aiResp.actions || [];
        let sentCount = 0;
        for (const act of actions) {
          if (deviceManager.sendToDevice(deviceId, act)) sentCount++;
        }
        return res.json({
          success: true,
          type: 'hardware_command',
          explanation: aiResp.explanation,
          actions,
          dispatched: sentCount,
          online: deviceManager.devices.has(deviceId)
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  res.status(400).json({ success: false, error: 'Command text, action, or sketchCode is required' });
});

// 3. Device Manifest Endpoint
function handleDeviceManifest(req, res) {
  const deviceId = req.params.device_id || req.params.deviceId;
  const dev = deviceManager.devices.get(deviceId);
  const host = req.headers.host;
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  const proto = isHttps ? 'https' : 'http';

  const binPath = path.join(config.workspaceDir, deviceId, 'bin', `${deviceId}.ino.bin`);
  const hasFirmware = fs.existsSync(binPath);
  let firmwareSize = 0;
  let firmwareModified = null;
  if (hasFirmware) {
    const stat = fs.statSync(binPath);
    firmwareSize = stat.size;
    firmwareModified = stat.mtime;
  }

  res.json({
    service: "ESP32 AI Auto Builder",
    version: "1.1.0",
    device_id: deviceId,
    status: dev ? (dev.ws && dev.ws.readyState === 1 ? "online" : "reconnecting") : "offline",
    fqbn: "esp32:esp32:esp32",
    firmware_url: `${proto}://${host}/device/${deviceId}/firmware`,
    has_firmware: hasFirmware,
    firmware_size_bytes: firmwareSize,
    firmware_updated_at: firmwareModified,
    pin_states: dev?.pinStates || {},
    telemetry: dev?.info || {},
    last_seen: dev?.lastSeen || null
  });
}

app.get('/device/:device_id/manifest', handleDeviceManifest);
app.get('/api/device/:deviceId/manifest', handleDeviceManifest);

// 4. Device Firmware Download Endpoint
function handleDeviceFirmware(req, res) {
  const deviceId = req.params.device_id || req.params.deviceId;
  const binPath = path.join(config.workspaceDir, deviceId, 'bin', `${deviceId}.ino.bin`);
  if (fs.existsSync(binPath)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${deviceId}.bin"`);
    return res.sendFile(binPath);
  }
  res.status(404).json({ success: false, error: `No compiled firmware binary found for device ${deviceId}` });
}

app.get('/device/:device_id/firmware', handleDeviceFirmware);
app.get('/api/device/:deviceId/firmware', handleDeviceFirmware);

// Libraries Management
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

// AI Sketch Generation
app.post('/api/build/ai', async (req, res) => {
  const { prompt } = req.body;
  try {
    const aiResp = await callGemini(CODE_GENERATION_PROMPT, prompt);
    res.json({ success: true, project: aiResp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Compile & Deploy via Web Dashboard
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
  const fwUrl = `${proto}://${host}/device/${deviceId}/firmware`;
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

module.exports = { app, server, getServiceHealth };
