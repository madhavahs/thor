const test = require('node:test');
const assert = require('node:assert');
const deviceManager = require('../src/tunnel/deviceManager');

test('deviceManager registers device and tracks online state', () => {
  const fakeWs = {
    readyState: 1,
    send: () => {}
  };

  deviceManager.registerDevice('esp32-test-device', fakeWs, {});
  assert.ok(deviceManager.devices.has('esp32-test-device'));

  const dev = deviceManager.devices.get('esp32-test-device');
  assert.strictEqual(dev.info.deviceId, 'esp32-test-device');

  deviceManager.unregisterDevice('esp32-test-device');
  assert.strictEqual(deviceManager.devices.has('esp32-test-device'), false);
});

test('deviceManager handles telemetry and serial broadcasts', () => {
  let sentData = null;
  const fakeUiClient = {
    readyState: 1,
    send: (msg) => { sentData = JSON.parse(msg); }
  };

  deviceManager.registerUiClient(fakeUiClient);
  deviceManager.broadcastSerialLog('esp32-unit-1', 'Test log message');

  assert.ok(sentData);
  assert.strictEqual(sentData.type, 'SERIAL_STREAM');
  assert.strictEqual(sentData.log, 'Test log message');

  deviceManager.unregisterUiClient(fakeUiClient);
});

test('deviceManager handles PIN_STATE and ALL_PINS_REPORT broadcasts and state tracking', () => {
  let broadcastMsg = null;
  const fakeUiClient = {
    readyState: 1,
    send: (msg) => { broadcastMsg = JSON.parse(msg); }
  };
  const fakeDevWs = {
    readyState: 1,
    send: () => {}
  };

  deviceManager.registerDevice('esp32-pin-test', fakeDevWs, {});
  deviceManager.registerUiClient(fakeUiClient);

  // 1. Single pin update
  deviceManager.updatePinState('esp32-pin-test', 2, 'OUTPUT', 1);
  assert.strictEqual(broadcastMsg.type, 'PIN_STATE');
  assert.strictEqual(broadcastMsg.pin, 2);
  assert.strictEqual(broadcastMsg.value, 1);

  const dev = deviceManager.devices.get('esp32-pin-test');
  assert.strictEqual(dev.pinStates[2].value, 1);

  // 2. All pins report update
  deviceManager.updateAllPinsReport('esp32-pin-test', {
    digital: { "2": 1, "4": 0 },
    analog: { "34": 2048 }
  });
  assert.strictEqual(broadcastMsg.type, 'ALL_PINS_REPORT');
  assert.strictEqual(dev.pinStates.digital["2"], 1);
  assert.strictEqual(dev.pinStates.analog["34"], 2048);

  deviceManager.unregisterUiClient(fakeUiClient);
  deviceManager.unregisterDevice('esp32-pin-test');
});

test('getServiceHealth returns exact required schema', () => {
  const { getServiceHealth } = require('../server');
  const health = getServiceHealth();

  assert.strictEqual(health.service, "ESP32 AI Auto Builder");
  assert.strictEqual(health.version, "1.1.0");
  assert.strictEqual(health.status, "online");
  assert.strictEqual(health.model, "gemini-3.1-flash-lite");
  assert.strictEqual(health.fqbn, "esp32:esp32:esp32");
  assert.strictEqual(health.port, 10000);
  assert.deepStrictEqual(health.endpoints, {
    health: "/health",
    command: "POST /command",
    manifest: "GET /device/{device_id}/manifest",
    firmware: "GET /device/{device_id}/firmware"
  });
});

test('HTTP GET /health and /device/:device_id/manifest respond correctly', async () => {
  const { app } = require('../server');
  const http = require('http');

  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /health
    const resHealth = await fetch(`${baseUrl}/health`);
    assert.strictEqual(resHealth.status, 200);
    const bodyHealth = await resHealth.json();
    assert.strictEqual(bodyHealth.service, "ESP32 AI Auto Builder");
    assert.strictEqual(bodyHealth.version, "1.1.0");
    assert.strictEqual(bodyHealth.model, "gemini-3.1-flash-lite");
    assert.strictEqual(bodyHealth.port, 10000);

    // 2. GET /device/test-dev/manifest
    const resManifest = await fetch(`${baseUrl}/device/test-dev/manifest`);
    assert.strictEqual(resManifest.status, 200);
    const bodyManifest = await resManifest.json();
    assert.strictEqual(bodyManifest.device_id, "test-dev");
    assert.strictEqual(bodyManifest.status, "offline");
    assert.strictEqual(bodyManifest.fqbn, "esp32:esp32:esp32");
    assert.ok(bodyManifest.firmware_url.includes("/device/test-dev/firmware"));

    // 3. POST /command with direct pin action
    const resCmd = await fetch(`${baseUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'test-dev',
        action: 'DIGITAL_WRITE',
        pin: 2,
        value: 1
      })
    });
    assert.strictEqual(resCmd.status, 200);
    const bodyCmd = await resCmd.json();
    assert.strictEqual(bodyCmd.type, 'action');
    assert.strictEqual(bodyCmd.action, 'DIGITAL_WRITE');
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});

