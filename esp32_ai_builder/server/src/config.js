const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

module.exports = {
  port: process.env.PORT || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  deviceAuthToken: process.env.DEVICE_AUTH_TOKEN || 'default_device_token_xyz',
  arduinoCliPath: process.env.ARDUINO_CLI_PATH 
    ? path.resolve(__dirname, '..', process.env.ARDUINO_CLI_PATH)
    : 'arduino-cli',
  workspaceDir: path.resolve(__dirname, '..', process.env.WORKSPACE_DIR || './workspace')
};
