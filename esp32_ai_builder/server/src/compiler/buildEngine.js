const fs = require('fs');
const path = require('path');
const config = require('../config');
const { runCli } = require('./cliRunner');
const { syncLibraries } = require('./libraryManager');
const { injectGuardian } = require('./codeInjector');
const { callGemini } = require('../ai/geminiClient');
const { CODE_HEALING_PROMPT } = require('../ai/promptTemplates');

async function compileProject(sketchCode, options = {}) {
  const {
    deviceId = 'esp32-01',
    autoPrune = true,
    requiredLibs = [],
    onLog = () => {}
  } = options;

  const buildDir = path.join(config.workspaceDir, deviceId);
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  // 1. Sync libraries (only when libraries are requested)
  if (requiredLibs && requiredLibs.length > 0) {
    onLog('[BUILD] Synchronizing libraries...');
    const libReport = await syncLibraries(requiredLibs, autoPrune);
    if (libReport.installed.length) onLog(`[BUILD] Installed: ${libReport.installed.join(', ')}`);
    if (libReport.removed.length) onLog(`[BUILD] Pruned unused: ${libReport.removed.join(', ')}`);
  }

  // 2. Inject Guardian background agent
  const finalCode = injectGuardian(sketchCode, options);
  const sketchPath = path.join(buildDir, `${deviceId}.ino`);
  fs.writeFileSync(sketchPath, finalCode, 'utf8');

  // Copy Guardian headers into build directory
  const includeSrc = path.resolve(__dirname, '../../../firmware/include');
  if (fs.existsSync(includeSrc)) {
    fs.readdirSync(includeSrc).forEach(file => {
      fs.copyFileSync(path.join(includeSrc, file), path.join(buildDir, file));
    });
  }

  // Copy partitions.csv if present
  const partitionsSrc = path.resolve(__dirname, '../../../firmware/partitions.csv');
  if (fs.existsSync(partitionsSrc)) {
    fs.copyFileSync(partitionsSrc, path.join(buildDir, 'partitions.csv'));
  }

  // 3. Compile with arduino-cli
  onLog('[BUILD] Invoking arduino-cli compile...');
  const fqbn = 'esp32:esp32:esp32';
  const outBinDir = path.join(buildDir, 'bin');
  const buildCacheDir = path.join(config.workspaceDir, 'cache');
  if (!fs.existsSync(outBinDir)) fs.mkdirSync(outBinDir, { recursive: true });
  if (!fs.existsSync(buildCacheDir)) fs.mkdirSync(buildCacheDir, { recursive: true });

  const buildArgs = [
    'compile',
    '--fqbn', fqbn,
    '--output-dir', outBinDir,
    '--build-path', buildCacheDir,
    '--jobs', '0',
    buildDir
  ];

  const compileRes = await runCli(buildArgs, {
    onStdout: (chunk) => onLog(chunk),
    onStderr: (chunk) => onLog(chunk)
  });

  const binPath = path.join(outBinDir, `${deviceId}.ino.bin`);
  const success = compileRes.success && fs.existsSync(binPath);

  return {
    success,
    binPath: success ? binPath : null,
    stdout: compileRes.stdout,
    stderr: compileRes.stderr,
    code: finalCode
  };
}

async function compileWithSelfHealing(initialCode, initialLibs, options = {}, maxRetries = 2) {
  let currentCode = initialCode;
  let currentLibs = initialLibs;
  const onLog = options.onLog || (() => {});

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    onLog(`[BUILD] Compilation Attempt ${attempt} of ${maxRetries + 1}...`);
    const result = await compileProject(currentCode, { ...options, requiredLibs: currentLibs });

    if (result.success) {
      onLog('[BUILD] Compilation successful!');
      return result;
    }

    if (attempt > maxRetries) {
      onLog('[BUILD] Max retries reached. Compilation failed.');
      return result;
    }

    onLog(`[BUILD] Compilation error detected. Prompting AI for self-healing repair...`);
    const userPrompt = `ORIGINAL SKETCH:\n${currentCode}\n\nCOMPILER ERROR LOG:\n${result.stderr || result.stdout}`;
    
    try {
      const fixed = await callGemini(CODE_HEALING_PROMPT, userPrompt);
      currentCode = fixed.sketch_code || currentCode;
      currentLibs = fixed.required_libraries || currentLibs;
      onLog(`[AI REPAIR] ${fixed.explanation || 'Code patched'}`);
    } catch (err) {
      onLog(`[AI REPAIR FAILED] ${err.message}`);
      return result;
    }
  }
}

module.exports = { compileProject, compileWithSelfHealing };
