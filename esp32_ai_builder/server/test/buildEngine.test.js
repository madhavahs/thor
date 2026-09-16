const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { compileProject } = require('../src/compiler/buildEngine');

test('compileProject compiles a basic sketch with Guardian injected', { timeout: 120000 }, async () => {
  const minimalSketch = `
    void setup() {
      pinMode(2, OUTPUT);
    }
    void loop() {
      digitalWrite(2, HIGH);
      delay(500);
      digitalWrite(2, LOW);
      delay(500);
    }
  `;

  const logs = [];
  const result = await compileProject(minimalSketch, {
    deviceId: 'test-device-01',
    autoPrune: false,
    requiredLibs: [],
    onLog: (chunk) => logs.push(chunk)
  });

  assert.strictEqual(result.success, true, `Build failed. stderr: ${result.stderr}`);
  assert.ok(result.binPath && fs.existsSync(result.binPath), 'Binary .bin should exist');
  assert.match(result.code, /Guardian\.begin\(\);/);
});
