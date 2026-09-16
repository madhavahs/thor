function injectGuardian(userCode, options = {}) {
  const {
    deviceId = 'esp32-01',
    deviceToken = 'token_secret',
    wifiSsid = 'wifi',
    wifiPass = '123456789',
    serverHost = 'localhost',
    serverPort = 3000,
    firmwareVersion = 'v1.0.0'
  } = options;

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

module.exports = { injectGuardian };
