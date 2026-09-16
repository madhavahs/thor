const { runCli } = require('./cliRunner');

// Mapping of popular Arduino & ESP32 C++ headers to their official library registry names
const HEADER_TO_LIB_MAP = {
  'DHT.h': ['DHT sensor library', 'Adafruit Unified Sensor'],
  'Adafruit_Sensor.h': ['Adafruit Unified Sensor'],
  'Adafruit_SSD1306.h': ['Adafruit SSD1306', 'Adafruit GFX Library'],
  'Adafruit_GFX.h': ['Adafruit GFX Library'],
  'LiquidCrystal_I2C.h': ['LiquidCrystal I2C'],
  'LiquidCrystal.h': ['LiquidCrystal'],
  'FastLED.h': ['FastLED'],
  'ESP32Servo.h': ['ESP32Servo'],
  'Servo.h': ['ESP32Servo'],
  'PubSubClient.h': ['PubSubClient'],
  'Adafruit_BME280.h': ['Adafruit BME280 Library', 'Adafruit Unified Sensor'],
  'BME280I2C.h': ['BME280'],
  'Adafruit_BMP280.h': ['Adafruit BMP280 Library', 'Adafruit Unified Sensor'],
  'Adafruit_NeoPixel.h': ['Adafruit NeoPixel'],
  'MPU6050.h': ['MPU6050_tockn'],
  'Adafruit_MPU6050.h': ['Adafruit MPU6050', 'Adafruit Unified Sensor'],
  'TFT_eSPI.h': ['TFT_eSPI'],
  'U8g2lib.h': ['U8g2'],
  'BH1750.h': ['BH1750'],
  'OneWire.h': ['OneWire'],
  'DallasTemperature.h': ['DallasTemperature', 'OneWire'],
  'TinyGPS++.h': ['TinyGPSPlus'],
  'HX711.h': ['HX711 Arduino Library'],
  'MFRC522.h': ['MFRC522'],
  'RTClib.h': ['RTClib'],
  'NTPClient.h': ['NTPClient'],
  'Stepper.h': ['Stepper']
};

// Built-in ESP32 core headers and system libraries that must NEVER be installed or uninstalled
const BUILTIN_ESP32_HEADERS = new Set([
  'Arduino.h', 'WiFi.h', 'WiFiMulti.h', 'WiFiClient.h', 'WiFiServer.h', 'WiFiUdp.h',
  'HTTPClient.h', 'WebServer.h', 'WiFiClientSecure.h', 'SPIFFS.h', 'FS.h', 'LittleFS.h',
  'SD.h', 'Update.h', 'Wire.h', 'SPI.h', 'EEPROM.h', 'Preferences.h', 'driver/gpio.h',
  'driver/ledc.h', 'driver/adc.h', 'esp_system.h', 'esp_wifi.h', 'esp_event.h', 'esp_ota_ops.h',
  'freertos/FreeRTOS.h', 'freertos/task.h', 'soc/rtc.h', 'esp_task_wdt.h',
  'WebSocketsClient.h', 'WebSockets.h', 'ArduinoJson.h', 'GuardianAgent.h', 'GuardianConfig.h',
  'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'stdint.h', 'stdbool.h', 'time.h'
]);

// System libraries bundled or required by Immortal Guardian
const PROTECTED_SYSTEM_LIBRARIES = new Set([
  'WiFi', 'WebServer', 'HTTPClient', 'WiFiClientSecure',
  'SPIFFS', 'FS', 'Update', 'Wire', 'SPI', 'EEPROM', 'Preferences',
  'WebSockets', 'ArduinoJson'
]);

function detectIncludedHeaders(code) {
  if (!code || typeof code !== 'string') return [];
  const lines = code.split('\n');
  const headers = [];
  const regex = /^\s*#include\s+[<"]([^>"]+)[>"]/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('//') || line.startsWith('/*')) continue;
    const match = line.match(regex);
    if (match && match[1]) {
      headers.push(match[1]);
    }
  }
  return headers;
}

function detectRequiredLibraries(code) {
  const headers = detectIncludedHeaders(code);
  const required = new Set();

  for (const h of headers) {
    if (BUILTIN_ESP32_HEADERS.has(h)) continue;
    
    // Check direct mapping
    if (HEADER_TO_LIB_MAP[h]) {
      HEADER_TO_LIB_MAP[h].forEach(lib => required.add(lib));
    } else {
      // Fallback: strip .h and remove directory prefix if any (e.g. "Adafruit_SSD1306.h" -> "Adafruit_SSD1306")
      const baseName = h.replace(/^.*[\\/]/, '').replace(/\.h$/i, '');
      if (baseName && !BUILTIN_ESP32_HEADERS.has(baseName)) {
        required.add(baseName);
      }
    }
  }

  return Array.from(required);
}

async function listInstalledLibraries() {
  const res = await runCli(['lib', 'list', '--format', 'json']);
  if (!res.success) {
    return [];
  }
  try {
    const data = JSON.parse(res.stdout);
    if (data.installed_libraries) {
      return data.installed_libraries.map(lib => ({
        name: lib.library.name,
        version: lib.library.version,
        installedLocation: lib.library.install_dir
      }));
    }
    return [];
  } catch (err) {
    return [];
  }
}

async function installLibrary(libName) {
  const res = await runCli(['lib', 'install', libName]);
  return {
    success: res.success,
    output: res.stdout || res.stderr
  };
}

async function uninstallLibrary(libName) {
  const res = await runCli(['lib', 'uninstall', libName]);
  return {
    success: res.success,
    output: res.stdout || res.stderr
  };
}

async function syncLibraries(requiredLibNames = [], autoPrune = true) {
  const installed = await listInstalledLibraries();
  const installedNames = new Set(installed.map(l => l.name));
  const requiredNames = new Set(requiredLibNames);

  const report = { installed: [], removed: [], retained: [] };

  const toInstall = [];
  for (const req of requiredNames) {
    if (PROTECTED_SYSTEM_LIBRARIES.has(req)) continue;
    if (!installedNames.has(req)) {
      toInstall.push(req);
    } else {
      report.retained.push(req);
    }
  }

  // 1. Batch install missing libraries in a single command
  if (toInstall.length > 0) {
    const installRes = await runCli(['lib', 'install', ...toInstall]);
    if (installRes.success) {
      report.installed.push(...toInstall);
    } else {
      for (const req of toInstall) {
        const singleRes = await installLibrary(req);
        if (singleRes.success) report.installed.push(req);
      }
    }
  }

  // 2. Batch prune obsolete libraries if requested
  if (autoPrune) {
    const toRemove = [];
    for (const inst of installedNames) {
      if (PROTECTED_SYSTEM_LIBRARIES.has(inst)) continue;
      if (!requiredNames.has(inst)) {
        toRemove.push(inst);
      }
    }

    if (toRemove.length > 0) {
      const delRes = await runCli(['lib', 'uninstall', ...toRemove]);
      if (delRes.success) {
        report.removed.push(...toRemove);
      } else {
        for (const rem of toRemove) {
          const singleDel = await uninstallLibrary(rem);
          if (singleDel.success) report.removed.push(rem);
        }
      }
    }
  }

  return report;
}

module.exports = {
  detectIncludedHeaders,
  detectRequiredLibraries,
  listInstalledLibraries,
  installLibrary,
  uninstallLibrary,
  syncLibraries,
  HEADER_TO_LIB_MAP,
  PROTECTED_SYSTEM_LIBRARIES
};
