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
