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

