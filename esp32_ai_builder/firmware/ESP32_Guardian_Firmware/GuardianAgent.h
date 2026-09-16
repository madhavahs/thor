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
    }
  }

  void performOTA(const String& url) {
    Serial.println("[GUARDIAN] Commencing OTA download from: " + url);
    WiFiClientSecure secClient;
    secClient.setInsecure();
    HTTPClient http;
    if (!http.begin(secClient, url)) return;
    int code = http.GET();
    if (code != HTTP_CODE_OK) { http.end(); return; }
    int size = http.getSize();
    if (!Update.begin(size)) { http.end(); return; }
    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);
    if (written == (size_t)size && Update.end(true)) {
      Serial.println("[GUARDIAN] OTA Complete! Rebooting into new firmware...");
      vTaskDelay(pdMS_TO_TICKS(500));
      ESP.restart();
    } else {
      Serial.println("[GUARDIAN] OTA update failed.");
      Update.abort();
    }
    http.end();
  }
};

extern GuardianAgentClass Guardian;
