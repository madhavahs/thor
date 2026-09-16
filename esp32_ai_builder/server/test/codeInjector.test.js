const test = require('node:test');
const assert = require('node:assert');
const { injectGuardian } = require('../src/compiler/codeInjector');

test('injectGuardian injects configuration and Guardian.begin() call', () => {
  const rawCode = `
    void setup() {
      Serial.begin(115200);
    }
    void loop() {}
  `;

  const injected = injectGuardian(rawCode, {
    deviceId: 'esp32-unit-99',
    wifiSsid: 'MyHomeWiFi'
  });

  assert.match(injected, /GUARDIAN_DEVICE_ID "esp32-unit-99"/);
  assert.match(injected, /GUARDIAN_WIFI_SSID "MyHomeWiFi"/);
  assert.match(injected, /Guardian\.begin\(\);/);
});

test('injectGuardian adds setup() if missing', () => {
  const rawCode = `void loop() {}`;
  const injected = injectGuardian(rawCode);
  assert.match(injected, /void setup\(\)\s*\{\s*Guardian\.begin\(\);\s*\}/);
});
