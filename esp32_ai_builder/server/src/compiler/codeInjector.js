const fs = require('fs');
const path = require('path');

function readDefaultConfig() {
  const configPath = path.resolve(__dirname, '../../../firmware/ESP32_Guardian_Firmware/GuardianConfig.h');
  const defaults = {
    deviceId: 'esp32-01',
    deviceToken: 'super_secret_device_token_12345',
    wifiSsid: 'wifi',
    wifiPass: '123456789',
    serverHost: '10.73.239.77',
    serverPort: 3000,
    firmwareVersion: 'v1.0.0'
  };

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const mHost = content.match(/#define\s+GUARDIAN_SERVER_HOST\s+"([^"]+)"/);
      const mPort = content.match(/#define\s+GUARDIAN_SERVER_PORT\s+(\d+)/);
      const mSsid = content.match(/#define\s+GUARDIAN_WIFI_SSID\s+"([^"]+)"/);
      const mPass = content.match(/#define\s+GUARDIAN_WIFI_PASS\s+"([^"]+)"/);
      const mDev = content.match(/#define\s+GUARDIAN_DEVICE_ID\s+"([^"]+)"/);
      const mTok = content.match(/#define\s+GUARDIAN_DEVICE_TOKEN\s+"([^"]+)"/);

      if (mHost && mHost[1]) defaults.serverHost = mHost[1];
      if (mPort && mPort[1]) defaults.serverPort = parseInt(mPort[1], 10);
      if (mSsid && mSsid[1]) defaults.wifiSsid = mSsid[1];
      if (mPass && mPass[1]) defaults.wifiPass = mPass[1];
      if (mDev && mDev[1]) defaults.deviceId = mDev[1];
      if (mTok && mTok[1]) defaults.deviceToken = mTok[1];
    } catch (e) {}
  }
  return defaults;
}

function injectGuardian(userCode, options = {}) {
  const defaults = readDefaultConfig();

  const deviceId = options.deviceId || defaults.deviceId;
  const deviceToken = options.deviceToken || defaults.deviceToken;
  const wifiSsid = options.wifiSsid || defaults.wifiSsid;
  const wifiPass = options.wifiPass || defaults.wifiPass;
  let serverHost = options.serverHost || defaults.serverHost;
  let serverPort = options.serverPort || defaults.serverPort;
  const firmwareVersion = options.firmwareVersion || defaults.firmwareVersion;

  // Never allow localhost to be burned into ESP32 firmware
  if (serverHost === 'localhost' || serverHost === '127.0.0.1') {
    serverHost = defaults.serverHost;
  }

  const headerDefines = `
// --- AUTOMATICALLY INJECTED IMMORTAL GUARDIAN AGENT ---
#define GUARDIAN_DEVICE_ID "${deviceId}"
#define GUARDIAN_DEVICE_TOKEN "${deviceToken}"
#define GUARDIAN_WIFI_SSID "${wifiSsid}"
#define GUARDIAN_WIFI_PASS "${wifiPass}"
#define GUARDIAN_SERVER_HOST "${serverHost}"
#define GUARDIAN_SERVER_PORT ${serverPort}
#define GUARDIAN_FIRMWARE_VER "${firmwareVersion}"

#include "GuardianAgent.h"
GuardianAgentClass Guardian;
// ----------------------------------------------------
`;

  // Search for setup() function to inject Guardian.begin()
  const setupRegex = /(void\s+setup\s*\(\s*\)\s*\{)/;
  let modifiedCode = userCode;

  if (setupRegex.test(userCode)) {
    modifiedCode = userCode.replace(
      setupRegex,
      `$1\n  Guardian.begin();`
    );
  } else {
    // If no setup found, append one
    modifiedCode += `\nvoid setup() {\n  Guardian.begin();\n}\n`;
  }

  return headerDefines + modifiedCode;
}

module.exports = { injectGuardian, readDefaultConfig };
