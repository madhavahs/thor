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

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`[ESP32 AI FORGE] Server listening worldwide on port ${config.port}`);
  });
}

module.exports = { app, server };
