const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');
const { runCli } = require('./cliRunner');
const { syncLibraries, detectRequiredLibraries } = require('./libraryManager');
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
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  } else {
    // Purge old sketch files and stale artifacts to guarantee old code is replaced completely
    try {
      const files = fs.readdirSync(buildDir);
      for (const f of files) {
        if (f !== 'cache' && f !== 'bin') {
          fs.rmSync(path.join(buildDir, f), { recursive: true, force: true });
        }
      }
    } catch (e) {}
  }

  // 1. Auto-detect required libraries from sketch headers and synchronize
  const detectedLibs = detectRequiredLibraries(sketchCode);
  const allRequiredLibs = Array.from(new Set([...(requiredLibs || []), ...detectedLibs]));

  if (allRequiredLibs.length > 0 || autoPrune) {
    onLog(`[BUILD] Checking libraries (Required: ${allRequiredLibs.length ? allRequiredLibs.join(', ') : 'none'}, Auto-prune: ${autoPrune})...`);
    const libReport = await syncLibraries(allRequiredLibs, autoPrune);
    if (libReport.installed.length) onLog(`[BUILD] Auto-installed libraries: ${libReport.installed.join(', ')}`);
    if (libReport.removed.length) onLog(`[BUILD] Auto-pruned unused libraries: ${libReport.removed.join(', ')}`);
  }

  // 2. Inject Guardian background agent with real network configuration
  const finalCode = injectGuardian(sketchCode, options);
  onLog(`[BUILD] Injected Immortal Guardian agent (Host: ${options.serverHost || 'LAN/Host'}, Port: ${options.serverPort || 3000}, Device: ${deviceId})...`);
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

  // 3. Clean previous binaries and compile with arduino-cli
  const outBinDir = path.join(buildDir, 'bin');
  if (fs.existsSync(outBinDir)) {
    try {
      const bins = fs.readdirSync(outBinDir);
      for (const b of bins) {
        fs.rmSync(path.join(outBinDir, b), { force: true });
      }
    } catch (e) {}
  } else {
    fs.mkdirSync(outBinDir, { recursive: true });
  }

  const buildCacheDir = path.join(buildDir, 'cache');
  
  // Inherit pre-warmed cache from default device if available
  const defaultCache = path.join(config.workspaceDir, 'esp32-01', 'cache');
  if (deviceId !== 'esp32-01' && !fs.existsSync(buildCacheDir) && fs.existsSync(defaultCache)) {
    try {
      fs.cpSync(defaultCache, buildCacheDir, { recursive: true });
    } catch (e) {}
  }
  if (!fs.existsSync(buildCacheDir)) fs.mkdirSync(buildCacheDir, { recursive: true });

  onLog('[BUILD] Invoking arduino-cli compile with space optimization (-Os, CORE_DEBUG_LEVEL=0)...');
  const fqbn = 'esp32:esp32:esp32';
  const cpuJobs = String(Math.min(4, Math.max(2, os.cpus()?.length || 2)));
  const buildArgs = [
    'compile',
    '--fqbn', fqbn,
    '--output-dir', outBinDir,
    '--build-path', buildCacheDir,
    '--jobs', cpuJobs,
    '--build-property', 'compiler.optimization_flags=-Os -DCORE_DEBUG_LEVEL=0 -ffunction-sections -fdata-sections -Wl,--gc-sections',
    '--build-property', 'compiler.c.extra_flags=-Os -DCORE_DEBUG_LEVEL=0',
    '--build-property', 'compiler.cpp.extra_flags=-Os -DCORE_DEBUG_LEVEL=0',
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
