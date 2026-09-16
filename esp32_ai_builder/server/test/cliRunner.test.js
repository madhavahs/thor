const test = require('node:test');
const assert = require('node:assert');
const { runCli } = require('../src/compiler/cliRunner');

test('runCli should return version from arduino-cli', async () => {
  const result = await runCli(['version']);
  assert.strictEqual(result.success, true);
  assert.match(result.stdout, /arduino-cli/i);
});
