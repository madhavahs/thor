const { spawn } = require('child_process');
const config = require('../config');

function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const cliPath = config.arduinoCliPath;
    const proc = spawn(cliPath, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (options.onStdout) options.onStdout(chunk);
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (options.onStderr) options.onStderr(chunk);
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        code: -1,
        stdout: '',
        stderr: err.message
      });
    });
  });
}

module.exports = { runCli };
