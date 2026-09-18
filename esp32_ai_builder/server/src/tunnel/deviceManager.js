class DeviceManager {
  constructor() {
    this.devices = new Map(); // deviceId -> { ws, info, lastSeen, flashingUntil, graceTimer }
    this.uiClients = new Set(); // Set of active dashboard WebSocket clients
  }

  markFlashing(deviceId, durationMs = 15000) {
    const dev = this.devices.get(deviceId);
    if (dev) {
      dev.flashingUntil = Date.now() + durationMs;
    }
    this.broadcastToUi({
      type: 'DEVICE_STATUS',
      deviceId,
      online: true,
      flashing: true
    });
  }

  registerDevice(deviceId, ws, req) {
    const existing = this.devices.get(deviceId);
    if (existing && existing.graceTimer) {
      clearTimeout(existing.graceTimer);
    }

    this.devices.set(deviceId, {
      ws,
      info: { deviceId, connectedAt: Date.now() },
      lastSeen: Date.now(),
      flashingUntil: 0,
      graceTimer: null
    });

    this.broadcastToUi({
      type: 'DEVICE_STATUS',
      deviceId,
      online: true,
      flashing: false
    });
  }

  unregisterDevice(deviceId) {
    const dev = this.devices.get(deviceId);
    if (dev && dev.flashingUntil && Date.now() < dev.flashingUntil) {
      // Device is in the middle of an OTA reboot: preserve online status during grace period
      const remaining = dev.flashingUntil - Date.now();
      this.broadcastToUi({
        type: 'DEVICE_STATUS',
        deviceId,
        online: true,
        flashing: true
      });

      dev.graceTimer = setTimeout(() => {
        const current = this.devices.get(deviceId);
        if (!current || !current.ws || current.ws.readyState !== 1) {
          this.devices.delete(deviceId);
          this.broadcastToUi({
            type: 'DEVICE_STATUS',
            deviceId,
            online: false,
            flashing: false
          });
        }
      }, remaining);
      return;
    }

    this.devices.delete(deviceId);
    this.broadcastToUi({
      type: 'DEVICE_STATUS',
      deviceId,
      online: false,
      flashing: false
    });
  }

  updateTelemetry(deviceId, data) {
    const dev = this.devices.get(deviceId);
    if (dev) {
      dev.info = { ...dev.info, ...data };
      dev.lastSeen = Date.now();
      dev.flashingUntil = 0;
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

  updatePinState(deviceId, pin, mode, value) {
    const dev = this.devices.get(deviceId);
    if (dev) {
      if (!dev.pinStates) dev.pinStates = {};
      dev.pinStates[pin] = { mode, value, updatedAt: Date.now() };
      dev.lastSeen = Date.now();
    }
    this.broadcastToUi({
      type: 'PIN_STATE',
      deviceId,
      pin,
      mode,
      value
    });
  }

  updateAllPinsReport(deviceId, data) {
    const dev = this.devices.get(deviceId);
    if (dev) {
      dev.pinStates = {
        digital: data.digital || {},
        analog: data.analog || {},
        updatedAt: Date.now()
      };
      dev.lastSeen = Date.now();
    }
    this.broadcastToUi({
      type: 'ALL_PINS_REPORT',
      deviceId,
      data
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
    if (dev && dev.ws && dev.ws.readyState === 1) {
      dev.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }
}

module.exports = new DeviceManager();
