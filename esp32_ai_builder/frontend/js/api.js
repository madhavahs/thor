async function handleResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    if (!res.ok) {
      return {
        success: false,
        error: `Server HTTP ${res.status} (${res.statusText || 'Error'}): ${text.slice(0, 200) || 'Connection closed or timeout'}`
      };
    }
    return { success: false, error: text || 'Invalid JSON response from server' };
  }
}

const API = {
  async getLibraries() {
    const res = await fetch('/api/libraries');
    return handleResponse(res);
  },
  async installLibrary(name) {
    const res = await fetch('/api/libraries/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return handleResponse(res);
  },
  async uninstallLibrary(name) {
    const res = await fetch('/api/libraries/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return handleResponse(res);
  },
  async generateAiProject(prompt, deviceId) {
    const res = await fetch('/api/build/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, deviceId })
    });
    return handleResponse(res);
  },
  async deployProject(payload) {
    const res = await fetch('/api/build/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },
  async getDevicePins(deviceId) {
    const res = await fetch(`/api/device/${deviceId}/pins`);
    return handleResponse(res);
  },
  async controlPin(deviceId, payload) {
    const res = await fetch(`/api/device/${deviceId}/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },
  async scanAllPins(deviceId) {
    const res = await fetch(`/api/device/${deviceId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return handleResponse(res);
  },
  async sendAiHardwareCommand(deviceId, command) {
    const res = await fetch(`/api/device/${deviceId}/ai-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    return handleResponse(res);
  }
};
