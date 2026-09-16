#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <esp_task_wdt.h>
#include "GuardianConfig.h"

class GuardianAgentClass {
public:
  WebSocketsClient wsClient;
  bool connected = false;
  unsigned long lastPing = 0;

  void begin() {
    Serial.println("[GUARDIAN] Initializing Immortal Guardian background task on Core 0...");
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
    WiFi.mode(WIFI_STA);
    WiFi.begin(GUARDIAN_WIFI_SSID, GUARDIAN_WIFI_PASS);

    while (WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(500));
    }

    Serial.println("[GUARDIAN] WiFi Connected. IP: " + WiFi.localIP().toString());
    
    // Mark current firmware partition valid to cancel rollback
    esp_ota_mark_app_valid_cancel_rollback();

    // Setup WebSocket client
    wsClient.beginSSL(GUARDIAN_SERVER_HOST, GUARDIAN_SERVER_PORT, "/ws/device");
    wsClient.setExtraHeaders("Authorization: Bearer " GUARDIAN_DEVICE_TOKEN "\r\nX-Device-Id: " GUARDIAN_DEVICE_ID);
    wsClient.onEvent([this](WStype_t type, uint8_t* payload, size_t length) {
      this->handleWsEvent(type, payload, length);
    });
    wsClient.setReconnectInterval(3000);

    for (;;) {
      wsClient.loop();
      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }

  void handleWsEvent(WStype_t type, uint8_t* payload, size_t length) {
    if (type == WStype_CONNECTED) {
      connected = true;
      Serial.println("[GUARDIAN] Connected to Global Cloud Hub!");
      sendTelemetry();
    } else if (type == WStype_DISCONNECTED) {
      connected = false;
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
    WiFiClientSecure secClient;
    secClient.setInsecure();
    HTTPClient http;
    http.setTimeout(15000);
    if (!http.begin(secClient, url)) {
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
    uint8_t buff[4096];
    int bytesWritten = 0;
    int lastPercent = -1;

    while (http.connected() && (bytesWritten < totalSize)) {
      size_t avail = stream->available();
      if (avail) {
        int readBytes = stream->readBytes(buff, ((avail > sizeof(buff)) ? sizeof(buff) : avail));
        Update.write(buff, readBytes);
        bytesWritten += readBytes;

        int percent = (bytesWritten * 100) / totalSize;
        if (percent % 20 == 0 && percent != lastPercent) {
          lastPercent = percent;
          Serial.printf("[GUARDIAN] OTA Flashing: %d%%\n", percent);
          logRemote("[OTA] Flashing: " + String(percent) + "%");
        }
      }
      vTaskDelay(1);
    }

    if (bytesWritten == totalSize && Update.end(true)) {
      Serial.println("[GUARDIAN] OTA Complete! Rebooting into new firmware...");
      logRemote("[OTA] Flash 100% Complete! Rebooting...");
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
