/*
 ==============================================================================
 STARK ARCHITECTURE - PRODUCTION ESP32-CAM STREAMER & CONTROLLER
 
 Architecture:
  - 100% Guaranteed Live Video Stream over STARK Cloud MQTT (broker.emqx.io)
  - Dedicated Hardware MJPEG Stream Server (Port 81)
  - Zero-Allocation Static Base64 Encoder for High FPS
  - Dynamic Resolution Switching (Pin V12: HQVGA, QVGA, CIF, VGA, SVGA, UXGA)
  - Hardware Camera Flip (vflip & hmirror) for normal upright view
  - Flashlight Control (GPIO 4 / Pin V11)
  - Multi-WiFi Auto-Roaming (WiFiMulti)
 ==============================================================================
*/

#define STARK_DEVICE_ID   "starl_dev_01"
#define STARK_AUTH_TOKEN  "blynk_tok_84f92bc31a0e" // Your active token

#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include <mbedtls/base64.h>

WiFiMulti wifiMulti;
WiFiClient espClient;
PubSubClient stark(espClient);

// Global Cloud Broker (Worldwide Reach)
const char* mqtt_broker = "broker.emqx.io";
const int   mqtt_port   = 1883;

#define FLASH_LED_PIN   4   // High-Power Flashlight LED
#define STATUS_LED_PIN  33  // Red Status LED on back

// AI-Thinker Camera Pin Mapping
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

String topicStream  = "stark/" + String(STARK_AUTH_TOKEN) + "/cam/frame";
String topicStatus  = "stark/" + String(STARK_AUTH_TOKEN) + "/status";
String topicCommand = "stark/" + String(STARK_AUTH_TOKEN) + "/write/#";
String topicCamUrl  = "stark/" + String(STARK_AUTH_TOKEN) + "/cam/url";

httpd_handle_t stream_httpd = NULL;

unsigned long lastFrameTime = 0;
const int frameIntervalMs = 60; // Smooth ~16-18 FPS cloud stream

// Static Pre-allocated Base64 Buffer (0ms malloc overhead)
static char base64Buffer[20480];

bool encodeBase64Fast(const uint8_t* data, size_t length) {
  const char prefix[] = "data:image/jpeg;base64,";
  const size_t prefixLen = sizeof(prefix) - 1;

  size_t requiredLen = 0;
  mbedtls_base64_encode(NULL, 0, &requiredLen, data, length);
  if (prefixLen + requiredLen + 1 >= sizeof(base64Buffer)) return false;

  memcpy(base64Buffer, prefix, prefixLen);
  size_t encodedLen = 0;
  mbedtls_base64_encode((unsigned char*)(base64Buffer + prefixLen), 
                        sizeof(base64Buffer) - prefixLen, 
                        &encodedLen, data, length);
  base64Buffer[prefixLen + encodedLen] = '\0';
  return true;
}

// ================= 1. LOCAL HTTP MJPEG STREAM (PORT 81) =============
#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t * _jpg_buf = NULL;
  char * part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      res = ESP_FAIL;
    } else {
      _jpg_buf_len = fb->len;
      _jpg_buf = fb->buf;
    }

    if (res == ESP_OK) {
      size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    if (fb) {
      esp_camera_fb_return(fb);
      fb = NULL;
      _jpg_buf = NULL;
    } else if (res != ESP_OK) {
      break;
    }
  }
  return res;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81;
  config.ctrl_port = 32768;

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("[STARK STREAM] Local HTTP Server running on Port 81 (/stream)");
  }
}

// ================= 2. MQTT COMMAND CALLBACK =========================
void onStarkCommand(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0';
  String msg = String((char*)payload);
  String t = String(topic);

  Serial.printf("[STARK COMMAND] %s -> %s\n", t.c_str(), msg.c_str());

  // V11: Remote Flashlight Control
  if (t.endsWith("/V11")) {
    int state = msg.toInt();
    digitalWrite(FLASH_LED_PIN, state == 1 ? HIGH : LOW);
    Serial.printf(">> Flashlight LED: %s\n", state == 1 ? "ON" : "OFF");
  }
  // V12: Dynamic Resolution Switching
  else if (t.endsWith("/V12")) {
    sensor_t * s = esp_camera_sensor_get();
    if (s) {
      if (msg == "UXGA")       s->set_framesize(s, FRAMESIZE_UXGA);
      else if (msg == "SVGA")  s->set_framesize(s, FRAMESIZE_SVGA);
      else if (msg == "VGA")   s->set_framesize(s, FRAMESIZE_VGA);
      else if (msg == "CIF")   s->set_framesize(s, FRAMESIZE_CIF);
      else if (msg == "QVGA")  s->set_framesize(s, FRAMESIZE_QVGA);
      else if (msg == "HQVGA") s->set_framesize(s, FRAMESIZE_HQVGA);
      else if (msg == "QQVGA") s->set_framesize(s, FRAMESIZE_QQVGA);
      Serial.printf(">> Resolution switched to: %s\n", msg.c_str());
    }
  }
}

// ================= 3. MQTT RECONNECT ================================
void connectStarkCloud() {
  while (!stark.connected() && wifiMulti.run() == WL_CONNECTED) {
    Serial.print("[STARK] Connecting to Global Cloud Broker (broker.emqx.io)...");
    if (stark.connect(STARK_DEVICE_ID, topicStatus.c_str(), 1, true, "offline")) {
      Serial.println(" CONNECTED!");
      stark.subscribe(topicCommand.c_str());
      stark.publish(topicStatus.c_str(), "online", true);

      // Send Stream URL
      String streamUrl = "http://" + WiFi.localIP().toString() + ":81/stream";
      stark.publish(topicCamUrl.c_str(), streamUrl.c_str(), true);
      
      digitalWrite(STATUS_LED_PIN, LOW); // Turn on red LED when connected
    } else {
      Serial.printf(" Failed (rc=%d), retrying in 2s...\n", stark.state());
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(2000);
    }
  }
}

// ================= 4. SETUP =========================================
void setup() {
  Serial.begin(115200);
  delay(400);

  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH);

  // OV2640 Hardware Configuration
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  
  config.xclk_freq_hz = 20000000;        // 20 MHz Fast Clock
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QVGA;  // 320x240 (Crisp & smooth)
  config.jpeg_quality = 18;              // ~2.5 KB lightweight frame
  config.fb_count     = 1;               // Single buffer prevents FIFO queue lag
  config.grab_mode    = CAMERA_GRAB_LATEST;

  // Initialize Camera Hardware
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[FATAL] Camera Init Failed: 0x%x\n", err);
    return;
  }

  // Camera Orientation Flip Fix (Upside down fix)
  sensor_t * s = esp_camera_sensor_get();
  if (s) {
    s->set_vflip(s, 1);     // Flip vertically
    s->set_hmirror(s, 1);   // Mirror horizontally
    s->set_brightness(s, 1);
    s->set_contrast(s, 1);
  }
  Serial.println("[STARK CAM] Camera Initialized Successfully!");

  // ================= 5. MULTI-WIFI CREDENTIALS ======================
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  
  wifiMulti.addAP("RRR", "123456789");     // Network 1: Home Wi-Fi
  wifiMulti.addAP("wifi", "123456789");    // Network 2: Mobile Hotspot
  wifiMulti.addAP("YOUR_OFFICE_WIFI", "OFFICE_PASSWORD");       // Network 3: Alternate Wi-Fi

  Serial.println("\n[STARK] Scanning & Connecting to Wi-Fi...");
  while (wifiMulti.run() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  Serial.printf("\n[STARK] Connected to: %s | IP: %s\n", 
                WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());

  // Start the Local HTTP Stream Server
  startCameraServer();
  Serial.printf("⚡ Local Stream: http://%s:81/stream\n", WiFi.localIP().toString().c_str());

  // Setup Cloud MQTT
  espClient.setNoDelay(true);
  stark.setBufferSize(32768);
  stark.setServer(mqtt_broker, mqtt_port);
  stark.setCallback(onStarkCommand);
}

// ================= 6. MAIN LOOP (PUMPS CLOUD MQTT STREAM) ===========
void loop() {
  if (wifiMulti.run() != WL_CONNECTED) {
    Serial.println("[STARK] Wi-Fi disconnected, reconnecting...");
    delay(1000);
    return;
  }

  if (!stark.connected()) {
    connectStarkCloud();
  }
  stark.loop();

  // Pump Live Camera Frames to Cloud Dashboard (stark/{token}/cam/frame)
  unsigned long now = millis();
  if (now - lastFrameTime >= frameIntervalMs) {
    lastFrameTime = now;

    camera_fb_t * fb = esp_camera_fb_get();
    if (fb) {
      if (fb->len < 14000) {
        if (encodeBase64Fast(fb->buf, fb->len)) {
          bool sent = stark.publish(topicStream.c_str(), base64Buffer, false);
          if (sent) {
            Serial.printf("[CAM STREAM] Live frame sent: %d bytes\n", fb->len);
          }
        }
      }
      esp_camera_fb_return(fb);
    }
  }
}
