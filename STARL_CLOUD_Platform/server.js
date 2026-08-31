const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Upload directories for Camera Snapshots and Video Recordings
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const SNAPSHOTS_DIR = path.join(UPLOAD_DIR, 'snapshots');
const RECORDINGS_DIR = path.join(UPLOAD_DIR, 'recordings');
const DATA_FILE = path.join(__dirname, 'db.json');

[UPLOAD_DIR, SNAPSHOTS_DIR, RECORDINGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const PORT = process.env.PORT || 3000;
const MQTT_BROKER_URL = process.env.MQTT_BROKER || 'mqtt://broker.emqx.io:1883';

// ====================== STARK ARCHITECTURE FULL MODEL ======================
let state = {
  template: {
    id: 'STARK_PRO_TMPL',
    name: 'STARK Quantum IoT Master Template',
    hardware: 'ESP32 & ESP32-CAM',
    connectionType: 'Wi-Fi / 4G / MQTT',
    datastreams: [
      { pin: 'V0', name: 'Power Switch / LED', type: 'Integer', min: 0, max: 1, default: 0, icon: 'power' },
      { pin: 'V1', name: 'Temperature', type: 'Double', unit: '°C', min: -40, max: 80, default: 25.4, icon: 'thermometer' },
      { pin: 'V2', name: 'Humidity', type: 'Double', unit: '%', min: 0, max: 100, default: 58.0, icon: 'droplets' },
      { pin: 'V3', name: 'PWM Brightness', type: 'Integer', min: 0, max: 100, default: 75, icon: 'sun' },
      { pin: 'V4', name: 'RGB NeoPixel Color', type: 'String', default: '#10b981', icon: 'palette' },
      { pin: 'V5', name: 'Terminal Console', type: 'String', default: 'STARK OS v2.5 Online', icon: 'terminal' },
      { pin: 'V6', name: 'Servo Motor Angle', type: 'Integer', unit: '°', min: 0, max: 180, default: 90, icon: 'rotate-cw' },
      { pin: 'V7', name: 'Potentiometer (ADC)', type: 'Integer', unit: 'raw', min: 0, max: 4095, default: 2048, icon: 'gauge' },
      { pin: 'V8', name: 'Speedometer (RPM/Speed)', type: 'Double', unit: 'km/h', min: 0, max: 240, default: 65.0, icon: 'gauge-circle' },
      { pin: 'V9', name: 'Motor Throttle', type: 'Integer', unit: '%', min: 0, max: 100, default: 45, icon: 'cpu' },
      { pin: 'V10', name: 'Battery Level', type: 'Integer', unit: '%', min: 0, max: 100, default: 92, icon: 'battery-charging' },
      { pin: 'V11', name: 'CAM Flashlight', type: 'Integer', min: 0, max: 1, default: 0, icon: 'camera' },
      { pin: 'V12', name: 'CAM Resolution', type: 'String', default: 'VGA', icon: 'image' }
    ]
  },
  devices: [
    {
      id: 'stark_dev_01',
      name: 'STARK Quantum ESP32 Node',
      templateId: 'STARK_PRO_TMPL',
      authToken: 'stark_tok_84f92bc3',
      hardware: 'ESP32-WROOM-32',
      status: 'online',
      lastSeen: new Date().toISOString(),
      pinValues: {
        V0: 1,
        V1: 26.2,
        V2: 54.0,
        V3: 75,
        V4: '#06b6d4',
        V5: '[BOOT] STARK Quantum Kernel v2.5 initialized.',
        V6: 90,
        V7: 2048,
        V8: 68.5,
        V9: 45,
        V10: 92,
        V11: 0,
        V12: 'SVGA'
      }
    }
  ],
  telemetryHistory: {
    stark_dev_01: [
      { timestamp: '12:20:00', V1: 25.0, V2: 56.0, V7: 1800, V8: 50.0 },
      { timestamp: '12:21:00', V1: 25.4, V2: 55.5, V7: 1950, V8: 58.0 },
      { timestamp: '12:22:00', V1: 25.8, V2: 55.0, V7: 2048, V8: 65.0 },
      { timestamp: '12:23:00', V1: 26.2, V2: 54.0, V7: 2100, V8: 68.5 }
    ]
  },
  rules: [
    {
      id: 'rule_1',
      name: 'Servo Safety Over-Heat Response',
      conditionPin: 'V1',
      operator: '>',
      threshold: 30.0,
      targetPin: 'V6',
      actionValue: 180,
      enabled: true
    },
    {
      id: 'rule_2',
      name: 'Potentiometer Auto-Throttle Link',
      conditionPin: 'V7',
      operator: '>',
      threshold: 3000,
      targetPin: 'V0',
      actionValue: 1,
      enabled: true
    }
  ],
  media: {
    snapshots: [],
    recordings: []
  },
  events: [
    { id: 'evt_init', timestamp: new Date().toLocaleTimeString(), title: 'STARK Core Online', type: 'SYSTEM', desc: 'Quantum gateway and EMQX link established.' }
  ]
};

// Auto-scan existing media files on disk
function refreshMediaList() {
  if (fs.existsSync(SNAPSHOTS_DIR)) {
    state.media.snapshots = fs.readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp'))
      .map(f => ({
        id: f,
        name: f,
        url: `/uploads/snapshots/${f}`,
        timestamp: fs.statSync(path.join(SNAPSHOTS_DIR, f)).mtime.toLocaleTimeString()
      })).reverse();
  }
  if (fs.existsSync(RECORDINGS_DIR)) {
    state.media.recordings = fs.readdirSync(RECORDINGS_DIR)
      .filter(f => f.endsWith('.webm') || f.endsWith('.mp4'))
      .map(f => ({
        id: f,
        name: f,
        url: `/uploads/recordings/${f}`,
        timestamp: fs.statSync(path.join(RECORDINGS_DIR, f)).mtime.toLocaleTimeString()
      })).reverse();
  }
}
refreshMediaList();

// Load persistent DB
if (fs.existsSync(DATA_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    state = { ...state, ...loaded };
  } catch (e) {
    console.error('db.json load error:', e.message);
  }
}

function saveDB() {
  fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), () => {});
}

// ====================== WEBSOCKET BROADCAST ====================
function broadcast(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
}

// Ultra-High-Speed 25+ FPS Raw Binary Video Stream Pipe
wss.on('connection', (wsClient) => {
  wsClient.on('message', (message, isBinary) => {
    if (isBinary) {
      // Relay raw binary JPEG directly to all browser clients (No Base64 overhead!)
      wss.clients.forEach(c => {
        if (c !== wsClient && c.readyState === WebSocket.OPEN) {
          c.send(message, { binary: true });
        }
      });
    }
  });
});

// ====================== MQTT GATEWAY ===========================
const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  clientId: 'STARK_SERVER_' + Math.random().toString(16).substring(2, 8),
  clean: true,
  reconnectPeriod: 2500
});

mqttClient.on('connect', () => {
  console.log('[MQTT] STARK Quantum Gateway Connected to EMQX Cloud Broker!');
  mqttClient.subscribe('stark/+/ds/+');       // Telemetry streams: stark/{token}/ds/{pin}
  mqttClient.subscribe('stark/+/status');     // Heartbeats: stark/{token}/status
  mqttClient.subscribe('stark/+/cam/frame');  // Camera Frame: stark/{token}/cam/frame (base64)
});

mqttClient.on('message', (topic, payloadBuf) => {
  const msg = payloadBuf.toString();
  const parts = topic.split('/');
  const token = parts[1];
  const channel = parts[2];

  let device = state.devices.find(d => d.authToken === token || d.id === token);
  if (!device) {
    // Auto-register connected node
    device = {
      id: 'stark_' + token.substring(token.length - 6),
      name: 'STARK Camera Node',
      templateId: state.template.id,
      authToken: token,
      hardware: 'ESP32-CAM',
      status: 'online',
      lastSeen: new Date().toISOString(),
      pinValues: { V0: 0, V11: 0, V12: 'QVGA' }
    };
    state.devices.push(device);
    broadcast('DEVICE_CREATED', device);
    saveDB();
  }

  device.lastSeen = new Date().toISOString();
  device.status = 'online';

  if (channel === 'status') {
    device.status = msg;
    broadcast('DEVICE_STATUS_CHANGED', { deviceId: device.id, status: msg });
  } else if (channel === 'cam') {
    if (parts[3] === 'url') {
      broadcast('CAM_URL_UPDATED', { deviceId: device.id, token, url: msg });
    } else if (payloadBuf.length > 4 && payloadBuf[0] === 0xFF && payloadBuf[1] === 0xD8) {
      // Broadcast raw binary buffer directly to browser canvas at 25-30 FPS!
      wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(payloadBuf, { binary: true });
        }
      });
    } else {
      // Base64 string fallback
      broadcast('CAM_FRAME_STREAM', { deviceId: device.id, token, frame: msg });
    }
  } else if (channel === 'ds') {
    const pin = parts[3];
    const numVal = isNaN(Number(msg)) ? msg : Number(msg);
    device.pinValues[pin] = numVal;

    // Track historical telemetry
    if (!state.telemetryHistory[device.id]) state.telemetryHistory[device.id] = [];
    const history = state.telemetryHistory[device.id];

    if (['V1', 'V2', 'V7', 'V8'].includes(pin)) {
      history.push({
        timestamp: new Date().toLocaleTimeString(),
        V1: device.pinValues.V1 || 0,
        V2: device.pinValues.V2 || 0,
        V7: device.pinValues.V7 || 0,
        V8: device.pinValues.V8 || 0
      });
      if (history.length > 30) history.shift();
    }

    // Evaluate Automation Rules
    evaluateRules(device, pin, numVal);

    broadcast('PIN_VALUE_UPDATED', {
      deviceId: device.id,
      pin,
      value: numVal,
      pinValues: device.pinValues,
      history
    });
    saveDB();
  }
});

// ====================== RULE ENGINE ===========================
function evaluateRules(device, pin, value) {
  state.rules.forEach(rule => {
    if (!rule.enabled || rule.conditionPin !== pin) return;
    const val = parseFloat(value);
    const thresh = parseFloat(rule.threshold);
    let triggered = false;

    if (rule.operator === '>' && val > thresh) triggered = true;
    else if (rule.operator === '<' && val < thresh) triggered = true;
    else if (rule.operator === '==' && val == thresh) triggered = true;

    if (triggered) {
      console.log(`[STARK RULE] Rule "${rule.name}" triggered by Pin ${pin} (${val})!`);
      device.pinValues[rule.targetPin] = rule.actionValue;
      
      const writeTopic = `stark/${device.authToken}/write/${rule.targetPin}`;
      mqttClient.publish(writeTopic, String(rule.actionValue), { qos: 1 });

      const alertEvt = {
        id: 'evt_' + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        title: `Rule Fired: ${rule.name}`,
        type: 'ALERT',
        desc: `Pin ${pin} reached ${val}. Dispatched ${rule.targetPin} = ${rule.actionValue}`
      };
      state.events.unshift(alertEvt);
      if (state.events.length > 25) state.events.pop();

      broadcast('ALERT_TRIGGERED', { event: alertEvt, deviceId: device.id });
    }
  });
}

// ====================== REST APIS =============================

// Get Full Template Schema
app.get('/api/template', (req, res) => res.json(state.template));

// Get Devices List
app.get('/api/devices', (req, res) => res.json(state.devices));

// Quickstart Create Device
app.post('/api/quickstart/create-device', (req, res) => {
  const { name, hardware } = req.body;
  const newId = 'stark_dev_' + Math.random().toString(16).substring(2, 6);
  const token = 'stark_tok_' + Math.random().toString(16).substring(2, 12);

  const newDevice = {
    id: newId,
    name: name || 'STARK Quantum Node',
    templateId: state.template.id,
    authToken: token,
    hardware: hardware || 'ESP32 & ESP32-CAM',
    status: 'online',
    lastSeen: new Date().toISOString(),
    pinValues: {
      V0: 0, V1: 25.0, V2: 50.0, V3: 80, V4: '#10b981',
      V5: 'STARK Node Provisioned.', V6: 90, V7: 2048, V8: 0,
      V9: 0, V10: 100, V11: 0, V12: 'VGA'
    }
  };

  state.devices.push(newDevice);
  state.telemetryHistory[newId] = [];
  saveDB();
  broadcast('DEVICE_CREATED', newDevice);

  res.json(newDevice);
});

// Write to Virtual Pin (UI -> Cloud -> Device)
app.post('/api/devices/:id/pin-write', (req, res) => {
  const { pin, value } = req.body;
  const device = state.devices.find(d => d.id === req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  device.pinValues[pin] = value;
  
  // Publish to MQTT
  const writeTopic = `stark/${device.authToken}/write/${pin}`;
  mqttClient.publish(writeTopic, String(value), { qos: 1 });

  broadcast('PIN_VALUE_UPDATED', {
    deviceId: device.id,
    pin,
    value,
    pinValues: device.pinValues
  });
  saveDB();

  res.json({ success: true, topic: writeTopic, value });
});

// Telemetry History
app.get('/api/devices/:id/history', (req, res) => {
  res.json(state.telemetryHistory[req.params.id] || []);
});

// ====================== CAMERA & MEDIA HUB ====================

// Save Snapshot to Cloud Gallery
app.post('/api/camera/snapshot', (req, res) => {
  const { imageBase64, deviceId } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'No image data provided' });

  const filename = `stark_snap_${Date.now()}.jpg`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  fs.writeFile(filepath, base64Data, 'base64', (err) => {
    if (err) return res.status(500).json({ error: 'Failed to save snapshot' });
    
    refreshMediaList();
    broadcast('MEDIA_UPDATED', state.media);
    res.json({ success: true, filename, url: `/uploads/snapshots/${filename}` });
  });
});

// Save Video Recording to Cloud Gallery
app.post('/api/camera/recording', (req, res) => {
  const { videoBase64, deviceId } = req.body;
  if (!videoBase64) return res.status(400).json({ error: 'No video data provided' });

  const filename = `stark_rec_${Date.now()}.webm`;
  const filepath = path.join(RECORDINGS_DIR, filename);
  const base64Data = videoBase64.replace(/^data:video\/\w+;base64,/, '');

  fs.writeFile(filepath, base64Data, 'base64', (err) => {
    if (err) return res.status(500).json({ error: 'Failed to save video' });
    
    refreshMediaList();
    broadcast('MEDIA_UPDATED', state.media);
    res.json({ success: true, filename, url: `/uploads/recordings/${filename}` });
  });
});

// Get Media Gallery List
app.get('/api/camera/media', (req, res) => {
  refreshMediaList();
  res.json(state.media);
});

// Delete Media item
app.delete('/api/camera/media/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const targetDir = type === 'snapshots' ? SNAPSHOTS_DIR : RECORDINGS_DIR;
  const filepath = path.join(targetDir, filename);

  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  refreshMediaList();
  broadcast('MEDIA_UPDATED', state.media);
  res.json({ success: true });
});

// Rules & Events
app.get('/api/rules', (req, res) => res.json(state.rules));
app.get('/api/events', (req, res) => res.json(state.events));

// Launch Server
server.listen(PORT, () => {
  console.log(`\n================================================================`);
  console.log(`⚡ STARK QUANTUM IoT CLOUD PLATFORM (PROMAX EDITION)`);
  console.log(`🌐 Live Dashboard:  http://localhost:${PORT}`);
  console.log(`📡 STARK Broker:    ${MQTT_BROKER_URL}`);
  console.log(`📷 Camera Lab:      http://localhost:${PORT}/#pane-camera`);
  console.log(`================================================================\n`);
});
