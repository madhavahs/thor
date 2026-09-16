let editor;
let activeLibraries = [];

document.addEventListener('DOMContentLoaded', () => {
  // Initialize CodeMirror Editor
  editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
    mode: 'text/x-c++src',
    theme: 'nord',
    lineNumbers: true,
    tabSize: 2
  });

  editor.setValue(`// Describe your project in the prompt above, or write C++ here
void setup() {
  pinMode(2, OUTPUT);
}

void loop() {
  digitalWrite(2, HIGH);
  delay(1000);
  digitalWrite(2, LOW);
  delay(1000);
}
`);

  // Connect WebSocket to Cloud Hub
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/ui`);

  const statusBadge = document.getElementById('deviceStatus');
  const consoleBox = document.getElementById('consoleOutput');

  function log(msg) {
    consoleBox.textContent += msg + '\n';
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT_DEVICE_LIST' || data.type === 'DEVICE_STATUS') {
      const isOnline = data.online || (data.devices && data.devices.length > 0);
      statusBadge.textContent = isOnline ? '● ESP32 Online' : '○ No Devices Connected';
      statusBadge.className = 'device-badge ' + (isOnline ? 'online' : '');
    } else if (data.type === 'BUILD_LOG' || data.type === 'SERIAL_STREAM') {
      log(data.log);
    }
  };

  // Load Libraries
  async function loadLibs() {
    const res = await API.getLibraries();
    if (res.success) {
      const list = document.getElementById('libraryList');
      list.innerHTML = '';
      activeLibraries = res.libraries;
      res.libraries.forEach(lib => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${lib.name} <small style="color:#6b7280">(${lib.version})</small></span>
                        <button onclick="removeLib('${lib.name}')">🗑️</button>`;
        list.appendChild(li);
      });
    }
  }
  loadLibs();

  document.getElementById('refreshLibsBtn').onclick = loadLibs;

  document.getElementById('installLibBtn').onclick = async () => {
    const input = document.getElementById('newLibInput');
    const name = input.value.trim();
    if (!name) return;
    log(`[LIB] Installing ${name}...`);
    const res = await API.installLibrary(name);
    log(res.output || 'Installed');
    input.value = '';
    loadLibs();
  };

  window.removeLib = async (name) => {
    if (!confirm(`Uninstall library: ${name}?`)) return;
    log(`[LIB] Removing ${name}...`);
    const res = await API.uninstallLibrary(name);
    log(res.output || 'Removed');
    loadLibs();
  };

  // AI Generation Button
  document.getElementById('generateBtn').onclick = async () => {
    const prompt = document.getElementById('aiPrompt').value.trim();
    if (!prompt) return alert('Please enter a project description.');
    log(`[AI] Generating C++ sketch for: "${prompt}"...`);
    try {
      const res = await API.generateAiProject(prompt, 'esp32-01');
      if (res.success && res.project) {
        editor.setValue(res.project.sketch_code);
        log(`[AI SUCCESS] Project: ${res.project.project_name}`);
        if (res.project.required_libraries?.length) {
          log(`[AI] Required libraries: ${res.project.required_libraries.join(', ')}`);
        }
      } else {
        log(`[AI ERROR] ${res.error}`);
      }
    } catch (err) {
      log(`[AI ERROR] ${err.message}`);
    }
  };

  // Deploy OTA Button
  document.getElementById('deployBtn').onclick = async () => {
    const sketchCode = editor.getValue();
    log(`[DEPLOY] Starting build & OTA deployment...`);
    try {
      const res = await API.deployProject({
        sketchCode,
        requiredLibraries: [],
        deviceId: 'esp32-01',
        autoPrune: true
      });
      if (res.success) {
        log(`[DEPLOY SUCCESS] ${res.message}`);
      } else {
        log(`[DEPLOY FAILED] ${res.error}`);
      }
    } catch (err) {
      log(`[DEPLOY ERROR] ${err.message}`);
    }
  };

  document.getElementById('clearLogsBtn').onclick = () => {
    consoleBox.textContent = '';
  };
});
