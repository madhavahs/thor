#include <WiFi.h>
#include <PubSubClient.h>

// ====================== 1. CONFIGURATION ======================
const char* WIFI_SSID     = "wifi";              // Your Wi-Fi SSID
const char* WIFI_PASSWORD = "123456789";         // Your Wi-Fi Password

const char* MQTT_BROKER   = "broker.emqx.io";    // Fast & reliable public broker
const int   MQTT_PORT     = 1883;

// Topics (Case-Sensitive)
const char* TOPIC_COMMAND = "iot_lab_esp32_xyz/led/set";     // Subscribed (App -> ESP32)
const char* TOPIC_STATUS  = "iot_lab_esp32_xyz/led/status";  // Published  (ESP32 -> App)

#define LED_PIN 2  // On-board LED on most ESP32 boards

// ====================== 2. GLOBAL OBJECTS =====================
WiFiClient espClient;
PubSubClient client(espClient);

enum LedMode { MODE_OFF, MODE_ON, MODE_BLINK_SLOW, MODE_BLINK_FAST };
LedMode currentMode = MODE_OFF;
unsigned long lastBlinkTime = 0;
bool ledState = false;

// ====================== 3. FUNCTIONS ==========================

void connectWiFi() {
  Serial.printf("\n[WiFi] Connecting to %s...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
}

void publishStatus(const char* status) {
  if (client.connected()) {
    client.publish(TOPIC_STATUS, status, true); // retain = true for instant sync
    Serial.printf("[MQTT] Status -> %s\n", status);
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0';
  String msg = String((char*)payload);
  msg.trim();
  Serial.printf("[MQTT] Received: [%s] -> %s\n", topic, msg.c_str());

  if (msg.equalsIgnoreCase("ON")) {
    currentMode = MODE_ON;
    digitalWrite(LED_PIN, HIGH);
    publishStatus("ON");
  } 
  else if (msg.equalsIgnoreCase("OFF")) {
    currentMode = MODE_OFF;
    digitalWrite(LED_PIN, LOW);
    publishStatus("OFF");
  } 
  else if (msg.equalsIgnoreCase("TOGGLE")) {
    if (currentMode == MODE_ON || digitalRead(LED_PIN) == HIGH) {
      currentMode = MODE_OFF;
      digitalWrite(LED_PIN, LOW);
      publishStatus("OFF");
    } else {
      currentMode = MODE_ON;
      digitalWrite(LED_PIN, HIGH);
      publishStatus("ON");
    }
  } 
  else if (msg.equalsIgnoreCase("BLINK_SLOW")) {
    currentMode = MODE_BLINK_SLOW;
    publishStatus("BLINK_SLOW");
  } 
  else if (msg.equalsIgnoreCase("BLINK_FAST")) {
    currentMode = MODE_BLINK_FAST;
    publishStatus("BLINK_FAST");
  }
}

void connectMQTT() {
  while (!client.connected()) {
    Serial.print("[MQTT] Connecting to broker...");
    String clientId = "ESP32-Client-" + String(random(0xffff), HEX);
    
    // Connect with Last Will & Testament (LWT)
    if (client.connect(clientId.c_str(), TOPIC_STATUS, 1, true, "OFFLINE")) {
      Serial.println(" Connected!");
      client.subscribe(TOPIC_COMMAND);
      publishStatus(currentMode == MODE_OFF ? "OFF" : (currentMode == MODE_ON ? "ON" : "BLINKING"));
    } else {
      Serial.printf(" Failed (rc=%d), retrying in 3s...\n", client.state());
      delay(3000);
    }
  }
}

void handleBlink() {
  unsigned long interval = (currentMode == MODE_BLINK_SLOW) ? 1000 : 
                           (currentMode == MODE_BLINK_FAST) ? 200 : 0;
  if (interval == 0) return;

  if (millis() - lastBlinkTime >= interval) {
    lastBlinkTime = millis();
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
  }
}

// ====================== 4. MAIN SETUP & LOOP ==================

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  connectWiFi();
  client.setServer(MQTT_BROKER, MQTT_PORT);
  client.setCallback(onMqttMessage);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!client.connected()) connectMQTT();
  
  client.loop();
  handleBlink();
}
