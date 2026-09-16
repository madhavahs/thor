class DeviceManager {
  constructor() {
    this.devices = new Map(); // deviceId -> { ws, info, lastSeen }
    this.uiClients = new Set(); // Set of active dashboard WebSocket clients
  }

  registerDevice(deviceId, ws, req) {
    this.devices.set(deviceId, {
      ws,
      info: { deviceId, connectedAt: Date.now() },
      lastSeen: Date.now()
    });

    this.broadcastToUi({
      type: 'DEVICE_STATUS',
      deviceId,
      online: true
    });
  }

  unregisterDevice(deviceId) {
    this.devices.delete(deviceId);
    this.broadcastToUi({
      type: 'DEVICE_STATUS',
      deviceId,
      online: false
    });
  }

  updateTelemetry(deviceId, data) {
    const dev = this.devices.get(deviceId);
    if (dev) {
      dev.info = { ...dev.info, ...data };
      dev.lastSeen = Date.now();
    }
    this.broadcastToUi({
      type: 'TELEMETRY',
      deviceId,
      data
    });
  }

  broadcastSerialLog(deviceId, log) {
    this.broadcastToUi({
      type: 'SERIAL_STREAM',
      deviceId,
      log
    });
  }

  registerUiClient(ws) {
    this.uiClients.add(ws);
    // Send list of online devices
    const deviceList = Array.from(this.devices.values()).map(d => d.info);
    ws.send(JSON.stringify({ type: 'INIT_DEVICE_LIST', devices: deviceList }));
  }

  unregisterUiClient(ws) {
    this.uiClients.delete(ws);
  }

  broadcastToUi(messageObj) {
    const msgStr = JSON.stringify(messageObj);
    for (const client of this.uiClients) {
      if (client.readyState === 1) { // OPEN
        client.send(msgStr);
      }
    }
  }

  sendToDevice(deviceId, payload) {
    const dev = this.devices.get(deviceId);
    if (dev && dev.ws.readyState === 1) {
      dev.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }
}

module.exports = new DeviceManager();
