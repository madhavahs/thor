const API = {
  async getLibraries() {
    const res = await fetch('/api/libraries');
    return res.json();
  },
  async installLibrary(name) {
    const res = await fetch('/api/libraries/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return res.json();
  },
  async uninstallLibrary(name) {
    const res = await fetch('/api/libraries/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return res.json();
  },
  async generateAiProject(prompt, deviceId) {
    const res = await fetch('/api/build/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, deviceId })
    });
    return res.json();
  },
  async deployProject(payload) {
    const res = await fetch('/api/build/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }
};
