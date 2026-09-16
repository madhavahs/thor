const { runCli } = require('./cliRunner');

function detectIncludedHeaders(code) {
  const lines = code.split('\n');
  const headers = [];
  const regex = /^\s*#include\s+[<"]([^>"]+)[>"]/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('//')) continue;
    const match = line.match(regex);
    if (match && match[1]) {
      headers.push(match[1]);
    }
  }
  return headers;
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

// System libraries bundled into ESP32 Core or required by Immortal Guardian
const PROTECTED_SYSTEM_LIBRARIES = new Set([
  'WiFi', 'WebServer', 'HTTPClient', 'WiFiClientSecure',
  'SPIFFS', 'FS', 'Update', 'Wire', 'SPI', 'EEPROM', 'Preferences',
  'WebSockets', 'ArduinoJson'
]);

async function syncLibraries(requiredLibNames = [], autoPrune = true) {
  const installed = await listInstalledLibraries();
  const installedNames = new Set(installed.map(l => l.name));
  const requiredNames = new Set(requiredLibNames);

  const report = { installed: [], removed: [], retained: [] };

  // 1. Install missing libraries
  for (const req of requiredNames) {
    if (PROTECTED_SYSTEM_LIBRARIES.has(req)) continue;
    if (!installedNames.has(req)) {
      const installRes = await installLibrary(req);
      if (installRes.success) {
        report.installed.push(req);
      }
    } else {
      report.retained.push(req);
    }
  }

  // 2. Prune obsolete libraries if requested
  if (autoPrune) {
    for (const inst of installedNames) {
      if (PROTECTED_SYSTEM_LIBRARIES.has(inst)) continue;
      if (!requiredNames.has(inst)) {
        const delRes = await uninstallLibrary(inst);
        if (delRes.success) {
          report.removed.push(inst);
        }
      }
    }
  }

  return report;
}

module.exports = {
  detectIncludedHeaders,
  listInstalledLibraries,
  installLibrary,
  uninstallLibrary,
  syncLibraries
};
