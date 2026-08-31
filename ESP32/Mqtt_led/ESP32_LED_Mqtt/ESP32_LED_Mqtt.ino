#include <WiFi.h>
#include <PubSubClient.h>

/*
 ==============================================================================
 Project:     ESP32 MQTT Remote LED Controller
 File:        ESP32_LED_Mqtt.ino
 Description: Connects ESP32 to Wi-Fi and a public MQTT broker, allowing
              bidirectional control and real-time status feedback for LED blinking.
 ==============================================================================
*/

// ======================= 1. NETWORK & BROKER CONFIG =========================
const char* WIFI_SSID     = "wifi";      // Replace with your Wi-Fi SSID
const char* WIFI_PASSWORD = "123456789";  // Replace with your Wi-Fi Password

// Public MQTT Broker (EMQX is rock-solid and prevents rc=-2 connection timeout)
const char* MQTT_BROKER   = "broker.emqx.io";
const int   MQTT_PORT     = 1883;

// Topic Configuration (Change prefix to make them unique to your project)
const char* TOPIC_COMMAND = "iot_lab_esp32_xyz/led/set";     // ESP32 Subscribes to this
const char* TOPIC_STATUS  = "iot_lab_esp32_xyz/led/status";  // ESP32 Publishes state to this

// ======================= 2. HARDWARE & STATE DEFINITIONS ====================
#define LED_PIN 2  // GPIO 2 is standard on-board LED for most ESP32 Dev Kits

enum LedMode {
  MODE_OFF,
  MODE_ON,
  MODE_BLINK_SLOW,
  MODE_BLINK_FAST
};

LedMode currentMode = MODE_OFF;
unsigned long lastBlinkMillis = 0;
bool ledOutputState = false;

// ======================= 3. CLIENT INSTANCES ================================
WiFiClient espWifiClient;
PubSubClient mqttClient(espWifiClient);

// ======================= 4. HELPER FUNCTIONS ================================

// Connect to Wi-Fi
void setupWiFi() {
  delay(100);
  Serial.println();
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("[WiFi] Connected successfully!");
  Serial.print("[WiFi] IP Address: ");
  Serial.println(WiFi.localIP());
}

// Publish LED state with retain flag = true for instant sync on new clients
void publishState(const char* state) {
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_STATUS, state, true);
    Serial.printf("[MQTT] State published: %s -> topic: %s\n", state, TOPIC_STATUS);
  }
}

// Callback triggered whenever an incoming MQTT message arrives
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();

  Serial.printf("[MQTT] Incoming [%s] -> %s\n", topic, message.c_str());

  if (message.equalsIgnoreCase("ON")) {
    currentMode = MODE_ON;
    digitalWrite(LED_PIN, HIGH);
    ledOutputState = true;
    publishState("ON");
  } 
  else if (message.equalsIgnoreCase("OFF")) {
    currentMode = MODE_OFF;
    digitalWrite(LED_PIN, LOW);
    ledOutputState = false;
    publishState("OFF");
  } 
  else if (message.equalsIgnoreCase("BLINK_SLOW")) {
    currentMode = MODE_BLINK_SLOW;
    publishState("BLINK_SLOW");
  } 
  else if (message.equalsIgnoreCase("BLINK_FAST")) {
    currentMode = MODE_BLINK_FAST;
    publishState("BLINK_FAST");
  } 
  else if (message.equalsIgnoreCase("TOGGLE")) {
    if (currentMode == MODE_ON || ledOutputState) {
      currentMode = MODE_OFF;
      digitalWrite(LED_PIN, LOW);
      ledOutputState = false;
      publishState("OFF");
    } else {
      currentMode = MODE_ON;
      digitalWrite(LED_PIN, HIGH);
      ledOutputState = true;
      publishState("ON");
    }
  }
}

// Reconnect to MQTT Broker with Last Will & Testament (LWT)
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Attempting connection...");
    
    // Generate randomized unique Client ID to avoid broker disconnection conflicts
    String clientId = "ESP32-LED-Client-" + String(random(0xffff), HEX);

    // Connect with Last Will & Testament (LWT)
    // If ESP32 abruptly disconnects/loses power, broker auto-publishes "OFFLINE" to status topic
    if (mqttClient.connect(clientId.c_str(), TOPIC_STATUS, 1, true, "OFFLINE")) {
      Serial.println(" Connected!");
      
      // Subscribe to command topic
      mqttClient.subscribe(TOPIC_COMMAND);
      Serial.printf("[MQTT] Subscribed to: %s\n", TOPIC_COMMAND);

      // Publish Online status
      publishState(currentMode == MODE_OFF ? "OFF" : (currentMode == MODE_ON ? "ON" : "BLINKING"));
    } else {
      Serial.print(" Failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(". Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

// Non-blocking LED blink handler using millis()
void handleLedBlinking() {
  unsigned long currentMillis = millis();
  unsigned long interval = 0;

  if (currentMode == MODE_BLINK_SLOW) {
    interval = 1000; // 1 second interval
  } else if (currentMode == MODE_BLINK_FAST) {
    interval = 200;  // 200 milliseconds interval
  } else {
    return; // Static ON or OFF, no need to cycle
  }

  if (currentMillis - lastBlinkMillis >= interval) {
    lastBlinkMillis = currentMillis;
    ledOutputState = !ledOutputState;
    digitalWrite(LED_PIN, ledOutputState ? HIGH : LOW);
  }
}

// ======================= 5. ARDUINO SETUP & LOOP ============================

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // Start with LED turned off

  setupWiFi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  // Ensure Wi-Fi stays connected
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }

  // Ensure MQTT client stays connected
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }

  // Process incoming MQTT packets & keepalive pings
  mqttClient.loop();

  // Handle periodic LED blinking without blocking loop()
  handleLedBlinking();
}