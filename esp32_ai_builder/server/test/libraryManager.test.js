const test = require('node:test');
const assert = require('node:assert');
const { detectIncludedHeaders, syncLibraries, listInstalledLibraries } = require('../src/compiler/libraryManager');

test('detectIncludedHeaders extracts quoted and angle-bracket headers', () => {
  const sampleCode = `
    #include <WiFi.h>
    #include "MyCustomHeader.h"
    #include <Adafruit_Sensor.h>
    // #include <CommentedOut.h>
    void setup() {}
  `;
  const headers = detectIncludedHeaders(sampleCode);
  assert.deepStrictEqual(headers, ['WiFi.h', 'MyCustomHeader.h', 'Adafruit_Sensor.h']);
});

test('listInstalledLibraries returns an array', async () => {
  const libs = await listInstalledLibraries();
  assert.ok(Array.isArray(libs));
});
