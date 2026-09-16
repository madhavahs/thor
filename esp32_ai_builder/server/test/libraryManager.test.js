const test = require('node:test');
const assert = require('node:assert');
const { detectIncludedHeaders, detectRequiredLibraries, syncLibraries, listInstalledLibraries } = require('../src/compiler/libraryManager');

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

test('detectRequiredLibraries maps headers to official libraries and filters builtins', () => {
  const sampleCode = `
    #include <Arduino.h>
    #include <WiFi.h>
    #include <DHT.h>
    #include <Adafruit_SSD1306.h>
    #include <FastLED.h>
    void setup() {}
  `;
  const libs = detectRequiredLibraries(sampleCode);
  assert.ok(libs.includes('DHT sensor library'));
  assert.ok(libs.includes('Adafruit Unified Sensor'));
  assert.ok(libs.includes('Adafruit SSD1306'));
  assert.ok(libs.includes('FastLED'));
  assert.strictEqual(libs.includes('WiFi'), false);
  assert.strictEqual(libs.includes('Arduino'), false);
});

test('listInstalledLibraries returns an array', async () => {
  const libs = await listInstalledLibraries();
  assert.ok(Array.isArray(libs));
});
