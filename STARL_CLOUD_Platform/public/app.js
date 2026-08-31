// ===================== STARK QUANTUM IoT CLIENT =====================
let template = null;
let devices = [];
let activeDevice = null;
let superChart = null;
let ws = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecordingVideo = false;
let recStartTime = 0;
let recTimerInterval = null;
let simEngineActive = false;
let simInterval = null;

// Camera stream animation frame
let camAnimId = null;

// ===================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', async () => {
  initSuperChart();
  initSpeedometer();
  initCameraSimulator();
  initWebSocket();
  await loadTemplate();
  await loadDevices();
  loadMediaGallery();
  loadRules();
  lucide.createIcons();
});

// ===================== WEBSOCKET GATEWAY ===================
function initWebSocket() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}/ws`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    logTerminal('STARK WebSocket Core Link: CONNECTED (2.5ms)');
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 3000);
  };

  let frameCount = 0;
  let lastFpsTime = Date.now();

  ws.onmessage = async (e) => {
    // 1. Ultra-Low-Latency Raw Binary Video Frame Stream (25+ FPS)
    if (e.data instanceof Blob || e.data instanceof ArrayBuffer) {
      isRealCameraStreaming = true;
      if (camAnimId) cancelAnimationFrame(camAnimId);

      const blob = e.data instanceof Blob ? e.data : new Blob([e.data], { type: 'image/jpeg' });
      try {
        const imageBitmap = await createImageBitmap(blob);
        const canvas = document.getElementById('camStreamCanvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
          imageBitmap.close();
        }
        
        // Calculate real FPS
        frameCount++;
        const now = Date.now();
        if (now - lastFpsTime >= 1000) {
          const fps = (frameCount * 1000 / (now - lastFpsTime)).toFixed(1);
          document.getElementById('cam-fps-tag').innerText = `⚡ ${fps} FPS | 320x240 | ULTRA LOW LATENCY`;
          frameCount = 0;
          lastFpsTime = now;
        }
      } catch (err) {
        console.error('Frame decode error:', err);
      }
      return;
    }

    // 2. Standard JSON Gateway Events & MQTT messages
    try {
      const msg = JSON.parse(e.data);
      handleGatewayEvent(msg);
    } catch (err) {
      console.error(err);
    }
  };
}

let isRenderingFrame = false;
let pendingFrameSrc = null;
let liveFpsCounter = 0;
let lastLiveFpsTime = Date.now();

function renderNextCameraFrame() {
  if (!pendingFrameSrc) {
    isRenderingFrame = false;
    return;
  }

  isRenderingFrame = true;
  const currentSrc = pendingFrameSrc;
  pendingFrameSrc = null; // Clear so intermediate queue is dropped instantly

  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById('camStreamCanvas');
    const feedImg = document.getElementById('liveCamFeedImg');
    if (canvas) {
      canvas.style.display = 'block';
      if (feedImg) feedImg.style.display = 'none';
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    liveFpsCounter++;
    const now = Date.now();
    if (now - lastLiveFpsTime >= 1000) {
      const fps = (liveFpsCounter * 1000 / (now - lastLiveFpsTime)).toFixed(1);
      document.getElementById('cam-fps-tag').innerText = `⚡ REAL-TIME | ${fps} FPS | LOW LATENCY`;
      liveFpsCounter = 0;
      lastLiveFpsTime = now;
    }
    
    if (pendingFrameSrc) {
      requestAnimationFrame(renderNextCameraFrame);
    } else {
      isRenderingFrame = false;
    }
  };
  img.onerror = () => {
    isRenderingFrame = false;
  };
  img.src = currentSrc;
}

function handleGatewayEvent(msg) {
  const { type, data } = msg;

  if (type === 'PIN_VALUE_UPDATED') {
    if (activeDevice && data.deviceId === activeDevice.id) {
      activeDevice.pinValues = data.pinValues;
      updateWidgetStates(data.pinValues);
      if (data.history) updateSuperChart(data.history);
      renderDatastreamsTable();
    }
    logTerminal(`[RX Pin Update] ${data.pin} -> ${data.value}`);
  } else if (type === 'CAM_URL_UPDATED' || (type === 'PIN_VALUE_UPDATED' && data.pin === 'cam/url')) {
    const streamUrl = data.url || data.value;
    if (streamUrl) {
      connectDirectStream(streamUrl);
    }
  } else if (type === 'CAM_FRAME_STREAM') {
    isRealCameraStreaming = true;
    if (camAnimId) cancelAnimationFrame(camAnimId);
    
    // Zero-Lag: Push newest frame and drop stale buffer
    pendingFrameSrc = data.frame;
    if (!isRenderingFrame) {
      renderNextCameraFrame();
    }
  } else if (type === 'DEVICE_STATUS_CHANGED') {
    if (activeDevice && data.deviceId === activeDevice.id) {
      updateDeviceStatusPill(data.status);
    }
  } else if (type === 'MEDIA_UPDATED') {
    loadMediaGallery();
  } else if (type === 'ALERT_TRIGGERED') {
    logTerminal(`🚨 [RULE ALERT] ${data.event.title}: ${data.event.desc}`);
    if (Notification.permission === 'granted') {
      new Notification(data.event.title, { body: data.event.desc });
    }
  }
}

// ===================== TEMPLATE & DEVICES ==================
async function loadTemplate() {
  const res = await fetch('/api/template');
  template = await res.json();
}

async function loadDevices() {
  const res = await fetch('/api/devices');
  devices = await res.json();

  const sel = document.getElementById('device-selector');
  sel.innerHTML = '';
  devices.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.innerText = `${d.name} (${d.hardware})`;
    sel.appendChild(opt);
  });

  if (devices.length > 0) {
    if (!activeDevice || !devices.find(d => d.id === activeDevice.id)) {
      activeDevice = devices[0];
    }
    sel.value = activeDevice.id;
    onDeviceSelected();
  }
}

function onDeviceChange() {
  const selId = document.getElementById('device-selector').value;
  activeDevice = devices.find(d => d.id === selId);
  onDeviceSelected();
}

async function onDeviceSelected() {
  if (!activeDevice) return;

  document.getElementById('sidebar-auth-token').innerText = activeDevice.authToken;
  updateDeviceStatusPill(activeDevice.status);
  updateWidgetStates(activeDevice.pinValues);
  renderDatastreamsTable();
  updateFirmwareTemplate();

  const res = await fetch(`/api/devices/${activeDevice.id}/history`);
  const history = await res.json();
  updateSuperChart(history);
}

function updateDeviceStatusPill(status) {
  const pill = document.getElementById('device-status-pill');
  const txt = document.getElementById('device-status-text');
  const isOnline = status === 'online';

  pill.className = `status-pill ${isOnline ? 'online' : 'offline'}`;
  txt.innerText = isOnline ? 'Online' : 'Offline';
}

// ===================== WIDGET STATE UPDATES =================
function updateWidgetStates(pv) {
  if (!pv) return;

  // V0 (Relay / Power)
  if (pv.V0 !== undefined) {
    const is1 = pv.V0 == 1 || pv.V0 === '1';
    const btn = document.getElementById('btn-master-relay');
    const lbl = document.getElementById('relay-btn-text');
    const stateLbl = document.getElementById('relay-state-label');
    const beacon = document.getElementById('relay-beacon');

    if (is1) {
      btn.className = 'switch-btn-promax active';
      lbl.innerText = 'TURN OFF';
      stateLbl.innerText = 'ON (1)';
      beacon.style.color = 'var(--stark-green)';
    } else {
      btn.className = 'switch-btn-promax';
      lbl.innerText = 'TURN ON';
      stateLbl.innerText = 'OFF (0)';
      beacon.style.color = '#475569';
    }
  }

  // V6 (Servo Motor Angle)
  if (pv.V6 !== undefined) {
    const angle = parseInt(pv.V6);
    document.getElementById('slider-servo').value = angle;
    document.getElementById('servo-angle-text').innerText = angle;
    // Rotate arm: 0 deg -> -90deg, 90 deg -> 0deg, 180 deg -> 90deg
    const rot = angle - 90;
    document.getElementById('servo-arm-indicator').style.transform = `rotate(${rot}deg)`;
  }

  // V7 (Potentiometer ADC)
  if (pv.V7 !== undefined) {
    const raw = parseInt(pv.V7);
    document.getElementById('pot-raw-val').innerText = raw;
    const volts = ((raw / 4095) * 3.3).toFixed(2);
    document.getElementById('pot-volt-val').innerText = `${volts} V`;
    const pct = Math.min(100, Math.max(0, (raw / 4095) * 100));
    document.getElementById('pot-fill-bar').style.width = `${pct}%`;
  }

  // V8 (Speedometer)
  if (pv.V8 !== undefined) {
    const speed = parseFloat(pv.V8);
    document.getElementById('speedo-val-display').innerText = speed.toFixed(1);
    drawSpeedometer(speed);
  }

  // V3 (PWM) & V9 (Throttle)
  if (pv.V3 !== undefined) {
    document.getElementById('slider-pwm').value = pv.V3;
    document.getElementById('pwm-val-text').innerText = `${pv.V3}%`;
  }
  if (pv.V9 !== undefined) {
    document.getElementById('slider-throttle').value = pv.V9;
    document.getElementById('throttle-val-text').innerText = `${pv.V9}%`;
  }

  // V4 (RGB Color)
  if (pv.V4 !== undefined) {
    document.getElementById('rgb-matrix-picker').value = pv.V4;
    document.getElementById('rgb-hex-display').innerText = pv.V4;
  }
}

// ===================== CONTROL ACTIONS =====================
async function toggleMasterRelay() {
  if (!activeDevice) return;
  const current = activeDevice.pinValues.V0 || 0;
  const next = current == 1 ? 0 : 1;
  await writePin('V0', next);
}

function onServoInput(val) {
  setServoAngle(parseInt(val));
}

async function setServoAngle(angle) {
  document.getElementById('slider-servo').value = angle;
  document.getElementById('servo-angle-text').innerText = angle;
  document.getElementById('servo-arm-indicator').style.transform = `rotate(${angle - 90}deg)`;
  await writePin('V6', angle);
}

function onPWMInput(val) {
  document.getElementById('pwm-val-text').innerText = `${val}%`;
  writePin('V3', parseInt(val));
}

function onThrottleInput(val) {
  document.getElementById('throttle-val-text').innerText = `${val}%`;
  writePin('V9', parseInt(val));
}

function onRGBColorChange(val) {
  document.getElementById('rgb-hex-display').innerText = val;
  writePin('V4', val);
}

async function writePin(pin, value) {
  if (!activeDevice) return;
  await fetch(`/api/devices/${activeDevice.id}/pin-write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, value })
  });
}

// ===================== CANVAS SPEEDOMETER ==================
function initSpeedometer() {
  drawSpeedometer(68.5);
}

function drawSpeedometer(speed) {
  const canvas = document.getElementById('speedoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h - 20;
  const radius = 105;

  ctx.clearRect(0, 0, w, h);

  // Background Arc (0 to 240 km/h) -> Angle: PI to 2*PI
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI, false);
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  // Active Value Gradient Arc
  const maxSpeed = 240;
  const clamped = Math.min(maxSpeed, Math.max(0, speed));
  const currentAngle = Math.PI + (clamped / maxSpeed) * Math.PI;

  const grad = ctx.createLinearGradient(0, cy, w, cy);
  grad.addColorStop(0, '#10b981');
  grad.addColorStop(0.5, '#06b6d4');
  grad.addColorStop(1, '#f43f5e');

  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, currentAngle, false);
  ctx.lineWidth = 14;
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Ticks
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    const x1 = cx + Math.cos(a) * (radius - 12);
    const y1 = cy + Math.sin(a) * (radius - 12);
    const x2 = cx + Math.cos(a) * (radius - 20);
    const y2 = cy + Math.sin(a) * (radius - 20);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();
  }

  // Needle
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const nx = cx + Math.cos(currentAngle) * (radius - 10);
  const ny = cy + Math.sin(currentAngle) * (radius - 10);
  ctx.lineTo(nx, ny);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#38bdf8';
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Center Pivot
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
}

// ===================== SUPERCHART ==========================
function initSuperChart() {
  const ctx = document.getElementById('superChartCanvas').getContext('2d');
  superChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Speed (km/h)',
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          data: [],
          tension: 0.35,
          fill: true
        },
        {
          label: 'Temperature (°C)',
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          data: [],
          tension: 0.35
        },
        {
          label: 'Humidity (%)',
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          data: [],
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } }
      },
      plugins: {
        legend: { labels: { color: '#cbd5e1' } }
      }
    }
  });
}

function updateSuperChart(history) {
  if (!superChart || !history) return;
  superChart.data.labels = history.map(h => h.timestamp);
  superChart.data.datasets[0].data = history.map(h => h.V8);
  superChart.data.datasets[1].data = history.map(h => h.V1);
  superChart.data.datasets[2].data = history.map(h => h.V2);
  superChart.update('none');
}

// ===================== ESP32-CAM & MEDIA HUB ===============
let isRealCameraStreaming = false;

function initCameraSimulator() {
  const canvas = document.getElementById('camStreamCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let time = 0;
  function renderFrame() {
    if (isRealCameraStreaming) return; // Stop simulation when real camera is active

    time += 0.04;
    ctx.fillStyle = '#0a101d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render Cyber Grid
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Dynamic Target Sight
    const cx = canvas.width / 2 + Math.sin(time) * 40;
    const cy = canvas.height / 2 + Math.cos(time * 0.8) * 30;

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 50, cy); ctx.lineTo(cx + 50, cy);
    ctx.moveTo(cx, cy - 50); ctx.lineTo(cx, cy + 50);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px monospace';
    ctx.fillText(`STARK CAM-01 [SIMULATED] - ${new Date().toLocaleTimeString()}`, 20, canvas.height - 20);

    camAnimId = requestAnimationFrame(renderFrame);
  }
  renderFrame();
}

let currentStreamUrl = '';

function connectDirectStream(url) {
  if (!url) return;
  currentStreamUrl = url;
  const img = document.getElementById('liveCamFeedImg');
  const canvas = document.getElementById('camStreamCanvas');
  const input = document.getElementById('direct-stream-input');
  
  if (img && canvas) {
    img.src = url;
    img.style.display = 'block';
    canvas.style.display = 'none';
    isRealCameraStreaming = true;
    if (camAnimId) cancelAnimationFrame(camAnimId);
    if (input) input.value = url;
    document.getElementById('cam-fps-tag').innerText = '⚡ 30 FPS | ZERO LATENCY (<20ms) | ONLINE';
    logTerminal(`⚡ Connected to Direct Zero-Latency Stream: ${url}`);
  }
}

function activateZeroLatencyMode() {
  const url = currentStreamUrl || document.getElementById('direct-stream-input')?.value;
  const btnZero = document.getElementById('btn-mode-zero-latency');
  const btnCloud = document.getElementById('btn-mode-cloud');
  if (btnZero) btnZero.style.borderColor = 'var(--stark-green)';
  if (btnCloud) btnCloud.style.borderColor = 'var(--glass-border)';

  if (url) {
    connectDirectStream(url);
  } else {
    logTerminal('⚡ Enter your ESP32 Stream URL (e.g. http://192.168.1.50:81/stream) and click Connect');
  }
}

function activateCloudStreamMode() {
  const img = document.getElementById('liveCamFeedImg');
  const canvas = document.getElementById('camStreamCanvas');
  const btnZero = document.getElementById('btn-mode-zero-latency');
  const btnCloud = document.getElementById('btn-mode-cloud');
  
  if (img) {
    img.src = '';
    img.style.display = 'none';
  }
  if (canvas) canvas.style.display = 'block';
  if (btnCloud) btnCloud.style.borderColor = 'var(--stark-cyan)';
  if (btnZero) btnZero.style.borderColor = 'var(--glass-border)';
  
  document.getElementById('cam-fps-tag').innerText = '🌐 CLOUD STREAM MODE | ACTIVE';
  logTerminal('🌐 Switched to Global Cloud Stream Mode');
}

// Capture Snapshot & Save to Cloud
async function captureSnapshot() {
  const canvas = document.getElementById('camStreamCanvas');
  const img = document.getElementById('liveCamFeedImg');

  // If streaming directly via Image element, paint it to canvas for capture
  if (img && img.style.display !== 'none' && img.complete && img.naturalWidth > 0) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

  try {
    const res = await fetch('/api/camera/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: dataUrl, deviceId: activeDevice?.id })
    });
    const data = await res.json();
    if (data.success) {
      logTerminal(`📷 Snapshot Captured & Saved: ${data.filename}`);
      loadMediaGallery();
    }
  } catch (err) {
    console.error('Snapshot failed:', err);
  }
}

// Video Recording Online
function toggleVideoRecording() {
  const btn = document.getElementById('btn-video-rec');
  const badge = document.getElementById('rec-status-badge');
  const dur = document.getElementById('rec-duration');

  if (!isRecordingVideo) {
    // Start Recording Canvas Stream
    const canvas = document.getElementById('camStreamCanvas');
    const stream = canvas.captureStream(30);
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result;
        await fetch('/api/camera/recording', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoBase64: base64data, deviceId: activeDevice?.id })
        });
        logTerminal(`🎥 Video Clip Saved to Cloud Vault!`);
        loadMediaGallery();
      };
    };

    mediaRecorder.start();
    isRecordingVideo = true;
    recStartTime = Date.now();
    btn.className = 'btn-cam rec is-recording';
    document.getElementById('rec-btn-text').innerText = 'Stop Recording';
    badge.className = 'rec-badge recording';

    recTimerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - recStartTime) / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      dur.innerText = `${mm}:${ss}`;
    }, 1000);
  } else {
    // Stop Recording
    mediaRecorder.stop();
    isRecordingVideo = false;
    clearInterval(recTimerInterval);
    btn.className = 'btn-cam rec';
    document.getElementById('rec-btn-text').innerText = 'Record Video';
    badge.className = 'rec-badge';
  }
}

async function loadMediaGallery() {
  const res = await fetch('/api/camera/media');
  const media = await res.json();
  const grid = document.getElementById('media-gallery-grid');
  grid.innerHTML = '';

  const total = (media.snapshots?.length || 0) + (media.recordings?.length || 0);
  document.getElementById('gallery-count').innerText = `${total} items`;

  media.snapshots?.forEach(s => {
    const card = document.createElement('div');
    card.className = 'gallery-item-card';
    card.innerHTML = `
      <img src="${s.url}" alt="Snapshot" />
      <div class="gallery-item-info">
        <span>📸 ${s.timestamp}</span>
        <div class="media-actions-group">
          <a href="${s.url}" download="${s.name}" class="media-btn download" title="Download Snapshot">
            <i data-lucide="download"></i> Save
          </a>
          <button onclick="deleteMediaItem('snapshots', '${s.name}')" class="media-btn delete" title="Delete Snapshot">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  media.recordings?.forEach(r => {
    const card = document.createElement('div');
    card.className = 'gallery-item-card';
    card.innerHTML = `
      <video src="${r.url}" controls></video>
      <div class="gallery-item-info">
        <span>🎥 ${r.timestamp}</span>
        <div class="media-actions-group">
          <a href="${r.url}" download="${r.name}" class="media-btn download" title="Download Recording">
            <i data-lucide="download"></i> Save
          </a>
          <button onclick="deleteMediaItem('recordings', '${r.name}')" class="media-btn delete" title="Delete Recording">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  lucide.createIcons();
}

async function deleteMediaItem(type, filename) {
  if (!confirm(`Delete ${filename}?`)) return;
  try {
    const res = await fetch(`/api/camera/media/${type}/${filename}`, { method: 'DELETE' });
    if (res.ok) {
      logTerminal(`🗑️ Media Deleted: ${filename}`);
      loadMediaGallery();
    }
  } catch (err) {
    console.error('Delete error:', err);
  }
}

function toggleCamFlash() {
  const current = activeDevice?.pinValues.V11 || 0;
  const next = current == 1 ? 0 : 1;
  writePin('V11', next);
  logTerminal(`💡 CAM Flashlight toggled -> ${next ? 'ON' : 'OFF'}`);
}

function changeCamRes(res) {
  writePin('V12', res);
  document.getElementById('cam-fps-tag').innerText = `LIVE | ${res} | ONLINE`;
  logTerminal(`📷 Dynamic Resolution changed to: ${res}`);
}

let isViewFlipped = false;
function toggleWebCamFlip() {
  const canvas = document.getElementById('camStreamCanvas');
  isViewFlipped = !isViewFlipped;
  if (canvas) {
    canvas.style.transform = isViewFlipped ? 'rotate(180deg)' : 'rotate(0deg)';
  }
  logTerminal(`🔄 Viewfinder Orientation: ${isViewFlipped ? 'Rotated 180°' : 'Normal'}`);
}

// ===================== DATASTREAMS TABLE ===================
function renderDatastreamsTable() {
  if (!template || !activeDevice) return;
  const tbody = document.getElementById('vpins-table-body');
  tbody.innerHTML = '';

  template.datastreams.forEach(ds => {
    const val = activeDevice.pinValues[ds.pin] ?? ds.default;
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--glass-border)';
    tr.innerHTML = `
      <td style="padding: 0.9rem;"><span class="pin-chip">${ds.pin}</span></td>
      <td style="padding: 0.9rem;"><strong>${ds.name}</strong></td>
      <td style="padding: 0.9rem;"><code>${ds.type}</code></td>
      <td style="padding: 0.9rem;">${ds.min !== undefined ? `${ds.min} - ${ds.max}` : '--'}</td>
      <td style="padding: 0.9rem;"><strong style="color: var(--stark-green);">${val} ${ds.unit || ''}</strong></td>
      <td style="padding: 0.9rem;"><code>starl/${activeDevice.authToken}/ds/${ds.pin}</code></td>
    `;
    tbody.appendChild(tr);
  });
}

// ===================== AUTOMATION RULES ====================
async function loadRules() {
  const res = await fetch('/api/rules');
  const rules = await res.json();
  const grid = document.getElementById('rules-cards-grid');
  grid.innerHTML = '';

  rules.forEach(r => {
    const card = document.createElement('div');
    card.className = 'glass-widget';
    card.innerHTML = `
      <div class="widget-top-bar">
        <span class="widget-label">⚡ ${r.name}</span>
        <span class="badge-stark">ACTIVE</span>
      </div>
      <p style="font-size: 0.9rem; margin-bottom: 8px;">
        <strong>IF:</strong> <code>Pin ${r.conditionPin}</code> ${r.operator} <strong>${r.threshold}</strong>
      </p>
      <p style="font-size: 0.9rem; color: var(--stark-cyan);">
        <strong>THEN:</strong> Set <code>Pin ${r.targetPin}</code> = <strong>${r.actionValue}</strong>
      </p>
    `;
    grid.appendChild(card);
  });
}

async function openNewRuleModal() {
  const name = prompt('Enter Rule Name (e.g. Servo High Temp Protection):', 'Overheat Servo Eject');
  if (!name) return;
  const thresh = prompt('Trigger Threshold for Temperature (Pin V1 °C):', '32.0');

  await fetch('/api/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      conditionPin: 'V1',
      operator: '>',
      threshold: parseFloat(thresh),
      targetPin: 'V6',
      actionValue: 180
    })
  });
  loadRules();
}

// ===================== QUANTUM SIMULATOR ===================
function toggleSimulatorEngine() {
  simEngineActive = !simEngineActive;
  const btn = document.getElementById('sim-toggle-btn');
  const badge = document.getElementById('sim-engine-badge');

  if (simEngineActive) {
    btn.innerHTML = '<i data-lucide="square"></i> Stop Quantum Simulation';
    btn.style.background = 'var(--stark-rose)';
    badge.innerText = 'STREAMING LIVE (1.5s)';
    badge.style.color = 'var(--stark-green)';

    simInterval = setInterval(publishSimCycle, 1500);
  } else {
    btn.innerHTML = '<i data-lucide="play"></i> Start Quantum Simulation';
    btn.style.background = 'var(--stark-green)';
    badge.innerText = 'SIMULATOR IDLE';
    badge.style.color = 'var(--stark-cyan)';
    clearInterval(simInterval);
  }
  lucide.createIcons();
}

function onSimPotInput(v) {
  document.getElementById('sim-pot-txt').innerText = v;
  writePin('V7', parseInt(v));
}

function onSimSpeedInput(v) {
  document.getElementById('sim-speed-txt').innerText = parseFloat(v).toFixed(1);
  writePin('V8', parseFloat(v));
}

function onSimTempInput(v) {
  document.getElementById('sim-temp-txt').innerText = parseFloat(v).toFixed(1);
  writePin('V1', parseFloat(v));
}

function publishSimCycle() {
  // Add micro fluctuations to simulated speed and temp
  const speedEl = document.getElementById('sim-speed-slider');
  let curSpeed = parseFloat(speedEl.value);
  curSpeed = Math.min(220, Math.max(20, curSpeed + (Math.random() * 6 - 3)));
  speedEl.value = curSpeed.toFixed(1);
  onSimSpeedInput(curSpeed);
}

// ===================== FIRMWARE GENERATOR ==================
function updateFirmwareTemplate() {
  if (!activeDevice) return;
  const tok = activeDevice.authToken;
  const code = `
/*
 ==============================================================================
 STARK QUANTUM IoT - ALL-IN-ONE C++ FIRMWARE (PROMAX)
 Target Hardware: ESP32 Dev Kit (Servo, Potentiometer, Relays, Sensors)
 Protocol: STARK Architecture MQTT Gateway
 ==============================================================================
*/

#define STARK_DEVICE_ID   "${activeDevice.id}"
#define STARK_AUTH_TOKEN  "${tok}"

#include <WiFi.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>

// 1. Wi-Fi & MQTT Settings
const char* ssid        = "YOUR_WIFI_SSID";
const char* password    = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "broker.emqx.io";

// 2. Hardware Pin Definitions
#define PIN_RELAY_LED   2    // V0: Built-in LED / Relay
#define PIN_SERVO       18   // V6: Servo Motor PWM
#define PIN_POT_ADC     34   // V7: Potentiometer 12-bit ADC
#define PIN_PWM_LED     19   // V3: PWM Dimmer

Servo starkServo;
WiFiClient espClient;
PubSubClient stark(espClient);

// Callback for incoming Virtual Pin Writes from the Dashboard
void callback(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\\0';
  String msg = (char*)payload;
  String t = String(topic);

  // V0: Relay / LED
  if (t.endsWith("/V0")) {
    digitalWrite(PIN_RELAY_LED, msg.toInt() == 1 ? HIGH : LOW);
  }
  // V6: Servo Angle
  else if (t.endsWith("/V6")) {
    int angle = msg.toInt();
    starkServo.write(angle);
  }
  // V3: PWM Dimmer
  else if (t.endsWith("/V3")) {
    int duty = map(msg.toInt(), 0, 100, 0, 255);
    analogWrite(PIN_PWM_LED, duty);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELAY_LED, OUTPUT);
  pinMode(PIN_PWM_LED, OUTPUT);
  starkServo.attach(PIN_SERVO);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(400);

  stark.setServer(mqtt_server, 1883);
  stark.setCallback(callback);
}

void loop() {
  if (!stark.connected()) {
    String subTopic = "stark/" + String(STARK_AUTH_TOKEN) + "/write/#";
    if (stark.connect(STARK_DEVICE_ID)) {
      stark.subscribe(subTopic.c_str());
    } else delay(3000);
  }
  stark.loop();

  // Periodic Telemetry Streaming (Every 1.5 seconds)
  static unsigned long lastTime = 0;
  if (millis() - lastTime > 1500) {
    lastTime = millis();

    // Read Potentiometer & Simulated Speed
    int rawPot = analogRead(PIN_POT_ADC);
    float speed = (rawPot / 4095.0) * 180.0;
    float temp = 26.4;

    // Publish to STARK Cloud
    stark.publish(("stark/" + String(STARK_AUTH_TOKEN) + "/ds/V7").c_str(), String(rawPot).c_str());
    stark.publish(("stark/" + String(STARK_AUTH_TOKEN) + "/ds/V8").c_str(), String(speed).c_str());
    stark.publish(("stark/" + String(STARK_AUTH_TOKEN) + "/ds/V1").c_str(), String(temp).c_str());
  }
}
  `.trim();

  document.getElementById('firmware-code-box').innerText = code;
}

function copyActiveFirmware() {
  const code = document.getElementById('firmware-code-box').innerText;
  navigator.clipboard.writeText(code);
  alert('Firmware sketch copied to clipboard!');
}

function copyToken() {
  if (!activeDevice) return;
  navigator.clipboard.writeText(activeDevice.authToken);
  alert('Device Auth Token copied!');
}

// ===================== NAVIGATION & UTILS ==================
function switchStage(stageId) {
  document.querySelectorAll('.tab-stage-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link-btn').forEach(b => b.classList.remove('active'));

  const pane = document.getElementById(`stage-${stageId}`);
  if (pane) pane.classList.add('active');

  const btn = Array.from(document.querySelectorAll('.nav-link-btn')).find(b => b.getAttribute('onclick')?.includes(stageId));
  if (btn) btn.classList.add('active');

  lucide.createIcons();
}

function logTerminal(txt) {
  const term = document.getElementById('stark-terminal');
  if (!term) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.innerText = `[${time}] ${txt}`;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function clearTerminal() {
  const term = document.getElementById('stark-terminal');
  if (term) term.innerHTML = '';
}
