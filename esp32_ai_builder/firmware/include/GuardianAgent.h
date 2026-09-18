#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <Preferences.h>
#include <esp_ota_ops.h>
#include <esp_task_wdt.h>
#include "GuardianConfig.h"

class GuardianAgentClass {
public:
  WebSocketsClient wsClient;
  bool connected = false;
  unsigned long lastPing = 0;
  unsigned long bootTime = 0;
  int failedConnects = 0;

  void begin() {
    bootTime = millis();
    Serial.println("[GUARDIAN] Initializing Immortal Guardian background task on Core 0...");
    // 8192 bytes stack required for TLS/mbedtls and OTA update stream processing
    xTaskCreatePinnedToCore(
      taskTrampoline,
      "GuardianTask",
      8192,
      this,
      1,
      NULL,
      0 // Pinned strictly to Core 0 so user code runs uninterrupted on Core 1
    );
  }

  void logRemote(const String& msg) {
    if (connected) {
      JsonDocument doc;
      doc["type"] = "SERIAL_LOG";
      doc["device_id"] = GUARDIAN_DEVICE_ID;
      doc["payload"] = msg;
      String out;
      serializeJson(doc, out);
      wsClient.sendTXT(out);
    }
  }

private:
  static void taskTrampoline(void* arg) {
    GuardianAgentClass* self = static_cast<GuardianAgentClass*>(arg);
    self->runTask();
  }

  void runTask() {
    Preferences prefs;
    prefs.begin("guardian", false);

    // Read stored config with compiled macros as default fallbacks
    String ssid = prefs.getString("wifi_ssid", GUARDIAN_WIFI_SSID);
    String pass = prefs.getString("wifi_pass", GUARDIAN_WIFI_PASS);
    String host = prefs.getString("server_host", GUARDIAN_SERVER_HOST);
    uint16_t port = prefs.getUShort("server_port", GUARDIAN_SERVER_PORT);

    // Ensure we never use localhost if a real host was ever stored or compiled
    if (host == "localhost" || host == "127.0.0.1" || host.length() == 0) {
      if (String(GUARDIAN_SERVER_HOST) != "localhost" && String(GUARDIAN_SERVER_HOST) != "127.0.0.1") {
        host = GUARDIAN_SERVER_HOST;
      }
    }
    if (port == 0) port = GUARDIAN_SERVER_PORT;

    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());

    int wifiAttempts = 0;
    while (WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(500));
      wifiAttempts++;
      // If Wi-Fi fails after 30 seconds (60 attempts) on freshly flashed firmware, rollback
      if (wifiAttempts > 60) {
        checkRollback("WiFi connection timeout");
        wifiAttempts = 0;
      }
    }

    Serial.println("[GUARDIAN] WiFi Connected. IP: " + WiFi.localIP().toString());

    // Save working Wi-Fi credentials to NVS
    prefs.putString("wifi_ssid", ssid);
    prefs.putString("wifi_pass", pass);

    // Setup WebSocket client: Use beginSSL for port 443 (Cloud/HTTPS), begin for local ports (3000, 80)
    if (port == 443) {
      Serial.printf("[GUARDIAN] Connecting via secure SSL/TLS to %s:443...\n", host.c_str());
      wsClient.beginSSL(host.c_str(), port, "/ws/device");
    } else {
      Serial.printf("[GUARDIAN] Connecting via plain WebSocket to %s:%d...\n", host.c_str(), port);
      wsClient.begin(host.c_str(), port, "/ws/device");
    }

    wsClient.setExtraHeaders("Authorization: Bearer " GUARDIAN_DEVICE_TOKEN "\r\nX-Device-Id: " GUARDIAN_DEVICE_ID);
    wsClient.onEvent([this, &prefs, host, port](WStype_t type, uint8_t* payload, size_t length) {
      this->handleWsEvent(type, payload, length, prefs, host, port);
    });
    wsClient.setReconnectInterval(3000);

    for (;;) {
      wsClient.loop();

      // Check if newly flashed firmware failed to connect to Cloud Hub
      if (!connected) {
        if ((millis() - bootTime > 45000) || (failedConnects >= 6)) {
          checkRollback("Failed to connect to Cloud Hub within timeout");
        }
      }

      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }

  void checkRollback(const char* reason) {
    const esp_partition_t* running = esp_ota_get_running_partition();
    esp_ota_img_states_t ota_state;
    if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
      if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
        Serial.printf("[GUARDIAN CRITICAL] Auto-Rollback triggered: %s. Reverting to previous firmware...\n", reason);
        vTaskDelay(pdMS_TO_TICKS(500));
        esp_ota_mark_app_invalid_rollback_and_reboot();
      }
    }
  }

  void handleWsEvent(WStype_t type, uint8_t* payload, size_t length, Preferences& prefs, const String& host, uint16_t port) {
    if (type == WStype_CONNECTED) {
      connected = true;
      failedConnects = 0;
      Serial.println("[GUARDIAN] Connected to Global Cloud Hub!");

      // Confirm firmware validity now that server connection is established
      esp_ota_mark_app_valid_cancel_rollback();

      // Persist working server connection to NVS
      prefs.putString("server_host", host);
      prefs.putUShort("server_port", port);

      sendTelemetry();
    } else if (type == WStype_DISCONNECTED) {
      connected = false;
      failedConnects++;
      Serial.println("[GUARDIAN] Disconnected from Global Cloud Hub");
    } else if (type == WStype_TEXT) {
      handleCommand(String((char*)payload));
    }
  }

  void sendTelemetry() {
    JsonDocument doc;
    doc["type"] = "DEVICE_HELLO";
    doc["device_id"] = GUARDIAN_DEVICE_ID;
    doc["firmware_ver"] = GUARDIAN_FIRMWARE_VER;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["wifi_ssid"] = WiFi.SSID();
    doc["ip"] = WiFi.localIP().toString();
    String out;
    serializeJson(doc, out);
    wsClient.sendTXT(out);
  }

  void handleCommand(const String& rawJson) {
    JsonDocument doc;
    if (deserializeJson(doc, rawJson)) return;
    String cmdType = doc["type"] | "";
    if (cmdType == "START_OTA") {
      String fwUrl = doc["url"] | "";
      performOTA(fwUrl);
    } else if (cmdType == "RESTART") {
      ESP.restart();
    } else if (cmdType == "PIN_MODE") {
      int pin = doc["pin"] | -1;
      String mode = doc["mode"] | "OUTPUT";
      if (pin >= 0) {
        if (mode == "INPUT") pinMode(pin, INPUT);
        else if (mode == "INPUT_PULLUP") pinMode(pin, INPUT_PULLUP);
        else if (mode == "INPUT_PULLDOWN") pinMode(pin, INPUT_PULLDOWN);
        else pinMode(pin, OUTPUT);
        sendPinState(pin, mode, digitalRead(pin));
      }
    } else if (cmdType == "DIGITAL_WRITE") {
      int pin = doc["pin"] | -1;
      int val = doc["value"] | 0;
      if (pin >= 0) {
        pinMode(pin, OUTPUT);
        digitalWrite(pin, val ? HIGH : LOW);
        sendPinState(pin, "OUTPUT", val ? 1 : 0);
      }
    } else if (cmdType == "PWM_WRITE" || cmdType == "ANALOG_WRITE") {
      int pin = doc["pin"] | -1;
      int val = doc["value"] | 0;
      if (pin >= 0) {
        analogWrite(pin, constrain(val, 0, 255));
        sendPinState(pin, "PWM", val);
      }
    } else if (cmdType == "DIGITAL_READ") {
      int pin = doc["pin"] | -1;
      if (pin >= 0) {
        int val = digitalRead(pin);
        sendPinState(pin, "INPUT", val);
      }
    } else if (cmdType == "ANALOG_READ") {
      int pin = doc["pin"] | -1;
      if (pin >= 0) {
        int val = analogRead(pin);
        sendPinState(pin, "ANALOG", val);
      }
    } else if (cmdType == "SCAN_ALL_PINS") {
      scanAllPins();
    }
  }

  void sendPinState(int pin, const String& mode, int value) {
    JsonDocument doc;
    doc["type"] = "PIN_STATE";
    doc["device_id"] = GUARDIAN_DEVICE_ID;
    doc["pin"] = pin;
    doc["mode"] = mode;
    doc["value"] = value;
    String out;
    serializeJson(doc, out);
    wsClient.sendTXT(out);
  }

  void scanAllPins() {
    JsonDocument doc;
    doc["type"] = "ALL_PINS_REPORT";
    doc["device_id"] = GUARDIAN_DEVICE_ID;
    doc["uptime_ms"] = millis();

    // Safe general-purpose GPIO pins
    const int digPins[] = { 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33 };
    JsonObject digObj = doc["digital"].to<JsonObject>();
    for (int p : digPins) {
      digObj[String(p)] = digitalRead(p);
    }

    // Safe ADC1 analog pins
    const int adcPins[] = { 32, 33, 34, 35, 36, 39 };
    JsonObject adcObj = doc["analog"].to<JsonObject>();
    for (int p : adcPins) {
      adcObj[String(p)] = analogRead(p);
    }

    String out;
    serializeJson(doc, out);
    wsClient.sendTXT(out);
  }

  void performOTA(const String& url) {
    Serial.println("[GUARDIAN] Commencing OTA download from: " + url);
    logRemote("[OTA] Starting high-speed OTA download...");
    HTTPClient http;
    http.setTimeout(20000);
    http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    http.setReuse(false);

    bool connectedHttp = false;
    WiFiClientSecure secClient;
    WiFiClient plainClient;

    if (url.startsWith("https://")) {
      secClient.setInsecure();
      connectedHttp = http.begin(secClient, url);
    } else {
      connectedHttp = http.begin(plainClient, url);
    }

    if (!connectedHttp) {
      Serial.println("[GUARDIAN] HTTP connect failed");
      logRemote("[OTA] Error: HTTP connect failed");
      return;
    }
    int code = http.GET();
    if (code != HTTP_CODE_OK) {
      Serial.printf("[GUARDIAN] HTTP GET failed (%d)\n", code);
      logRemote("[OTA] HTTP GET error: " + String(code));
      http.end();
      return;
    }
    int totalSize = http.getSize();
    if (totalSize <= 0) {
      Serial.println("[GUARDIAN] Invalid firmware size");
      logRemote("[OTA] Error: Invalid firmware size");
      http.end();
      return;
    }
    if (!Update.begin(totalSize, U_FLASH)) {
      Serial.println("[GUARDIAN] Not enough space for OTA");
      logRemote("[OTA] Error: Not enough flash space");
      http.end();
      return;
    }

    WiFiClient* stream = http.getStreamPtr();
    // Dynamic buffer allocation instead of large stack footprint
    const size_t buffSize = 2048;
    uint8_t* buff = (uint8_t*)malloc(buffSize);
    if (!buff) {
      Serial.println("[GUARDIAN] Memory allocation failed for OTA buffer");
      logRemote("[OTA] Error: Insufficient RAM for OTA buffer");
      http.end();
      Update.abort();
      return;
    }

    int bytesWritten = 0;
    int lastPercent = -1;

    while (http.connected() && (bytesWritten < totalSize)) {
      size_t avail = stream->available();
      if (avail) {
        int readBytes = stream->readBytes(buff, ((avail > buffSize) ? buffSize : avail));
        Update.write(buff, readBytes);
        bytesWritten += readBytes;

        int percent = (bytesWritten * 100) / totalSize;
        if (percent % 20 == 0 && percent != lastPercent) {
          lastPercent = percent;
          Serial.printf("[GUARDIAN] OTA Flashing: %d%%\n", percent);
          logRemote("[OTA] Flashing: " + String(percent) + "%");
        }
      }
      // Service WebSocket event loop so connection doesn't drop during long download
      wsClient.loop();
      vTaskDelay(1);
    }

    free(buff);

    if (bytesWritten == totalSize && Update.end(true)) {
      Serial.println("[GUARDIAN] OTA Complete! Rebooting into new firmware...");
      logRemote("[OTA] Flash 100% Complete! Hot-swapping code now...");
      vTaskDelay(pdMS_TO_TICKS(500));
      ESP.restart();
    } else {
      Serial.println("[GUARDIAN] OTA update failed.");
      logRemote("[OTA] Error: OTA verification failed");
      Update.abort();
    }
    http.end();
  }
};

extern GuardianAgentClass Guardian;
