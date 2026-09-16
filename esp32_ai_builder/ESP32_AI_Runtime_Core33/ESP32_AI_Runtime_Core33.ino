/*
  ESP32 AI DYNAMIC RUNTIME - Arduino-ESP32 Core 3.x
  Board: ESP32 DevKit V / ESP32-WROOM-32

  Text/voice -> Gemini -> JSON runtime program -> GPIO/sensors/actuators

  IMPORTANT:
  - This rewrites the RUNNING BEHAVIOR online without reflashing.
  - It does NOT compile arbitrary C++ source code on the ESP32.
  - For actual source-code OTA rewriting, a separate build server/CI + OTA
    mechanism is required.

  Libraries:
    ArduinoJson 7.x
    DHT sensor library by Adafruit
    Adafruit Unified Sensor
    ESP32Servo

  Arduino-ESP32 3.x LEDC API is used:
    ledcAttach(pin, frequency, resolution)
    ledcWrite(pin, duty)
*/

#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <SPIFFS.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <Update.h>

// Explicit forward declarations for Arduino-ESP32
void setupRoutes();
void checkOnlineFirmware();

// ============================================================
// CONFIGURATION
// ============================================================
const char* WIFI_SSID     = "wifi";
const char* WIFI_PASSWORD = "123456789";
const char* GEMINI_KEY = "YOUR_GEMINI_API_KEY";

String GEMINI_MODEL = "gemini-3.1-flash-lite";

// Online source-rewrite builder / OTA service. Keep this server private or protected.
const char* BUILDER_URL   = "https://esp32-ai-autobuilder.onrender.com";
const char* DEVICE_ID     = "esp32-01";
const char* DEVICE_TOKEN = "YOUR_DEVICE_TOKEN";
const unsigned long OTA_CHECK_MS = 30000;
unsigned long lastOtaCheck = 0;
String installedFirmwareVersion = "factory";

WebServer server(80);

// ============================================================
// LOGGING
// ============================================================
#define LOG_MAX 100
String logBuf[LOG_MAX];
int logHead = 0;
int logCnt  = 0;

void webLog(const String& msg) {
  Serial.println(msg);
  logBuf[logHead] = msg;
  logHead = (logHead + 1) % LOG_MAX;
  if (logCnt < LOG_MAX) logCnt++;
}

// ============================================================
// GPIO / RUNTIME MODEL
// ============================================================
#define MAX_TASKS 20
#define MAX_SERVOS 8

struct LoopTask {
  String type; // blink | dht11 | analog | digital_read | pwm | servo_sweep | servo
  int pin = -1;
  long interval_ms = 1000;
  int param = 128;       // duty / angle
  int param2 = 0;        // optional second value
  unsigned long lastRun = 0;
  bool toggle = false;
  bool used = false;
};

struct OneshotTask {
  String type; // gpio | pwm_set | digital_read | servo
  int pin = -1;
  String action; // on | off | toggle
  int param = 0;
  bool used = false;
};

struct Program {
  String name;
  String description;
  LoopTask loopTasks[MAX_TASKS];
  int loopCount = 0;
  OneshotTask oneshots[MAX_TASKS];
  int oneshotCount = 0;
};

Program curr;
bool progActive = false;

// DHT is dynamically created because the pin is selected by AI/user.
DHT* dhtSensor = nullptr;
int dhtPin = -1;

// Servo pool. ESP32Servo supports attaching to arbitrary suitable GPIOs.
Servo servoPool[MAX_SERVOS];
int servoPins[MAX_SERVOS];
bool servoUsed[MAX_SERVOS];

// ============================================================
// GPIO VALIDATION
// ============================================================
// ESP32-WROOM-32 has GPIO 0..39 exposed by the chip, but not all are
// equally safe/usable on every DevKit. GPIO 6..11 are normally SPI flash.
// GPIO 34..39 are input-only. GPIO 0/2/12/15 are boot strapping pins.
// GPIO 1/3 are USB/serial pins when Serial is active.
// We allow the full 0..39 range in the command parser, but reject pins
// that are physically unavailable for normal GPIO operation.

bool isRealGPIO(int pin) {
  return pin >= 0 && pin <= 39 && !(pin >= 6 && pin <= 11);
}

bool isInputOnlyGPIO(int pin) {
  return pin >= 34 && pin <= 39;
}

bool isStrappingGPIO(int pin) {
  return pin == 0 || pin == 2 || pin == 4 || pin == 5 || pin == 12 || pin == 15;
}

bool isSerialGPIO(int pin) {
  return pin == 1 || pin == 3;
}

bool canOutput(int pin) {
  return isRealGPIO(pin) && !isInputOnlyGPIO(pin);
}

bool canADC(int pin) {
  return pin == 32 || pin == 33 || (pin >= 34 && pin <= 39);
}

bool validatePinFor(const String& type, int pin, String& reason) {
  if (!isRealGPIO(pin)) {
    reason = "GPIO " + String(pin) + " is not an available ESP32 GPIO (6-11 are flash pins).";
    return false;
  }

  if ((type == "blink" || type == "pwm" || type == "gpio" || type == "pwm_set" ||
       type == "servo" || type == "servo_sweep") && !canOutput(pin)) {
    reason = "GPIO " + String(pin) + " is input-only on ESP32; use an output-capable GPIO.";
    return false;
  }

  if (type == "analog" && !canADC(pin)) {
    reason = "GPIO " + String(pin) + " is not an ADC1 pin. Use GPIO 32-39.";
    return false;
  }

  if (isSerialGPIO(pin)) {
    reason = "Warning: GPIO " + String(pin) + " is used by USB/UART Serial; using it may interfere with Serial Monitor.";
  } else if (isStrappingGPIO(pin)) {
    reason = "Warning: GPIO " + String(pin) + " is a boot-strapping pin. Do not force an unsafe level during reset.";
  } else {
    reason = "";
  }
  return true;
}

// ============================================================
// SERVO HELPERS
// ============================================================
int findServo(int pin) {
  for (int i = 0; i < MAX_SERVOS; i++) {
    if (servoUsed[i] && servoPins[i] == pin) return i;
  }
  return -1;
}

int ensureServo(int pin) {
  int existing = findServo(pin);
  if (existing >= 0) return existing;

  for (int i = 0; i < MAX_SERVOS; i++) {
    if (!servoUsed[i]) {
      if (servoPool[i].attach(pin, 500, 2400) == 0) {
        webLog("[SERVO] Failed to attach GPIO " + String(pin));
        return -1;
      }
      servoPins[i] = pin;
      servoUsed[i] = true;
      servoPool[i].write(90);
      webLog("[SERVO] Attached GPIO " + String(pin));
      return i;
    }
  }
  webLog("[SERVO] Pool full");
  return -1;
}

void detachAllServos() {
  for (int i = 0; i < MAX_SERVOS; i++) {
    if (servoUsed[i]) {
      servoPool[i].detach();
      servoUsed[i] = false;
      servoPins[i] = -1;
    }
  }
}

// ============================================================
// CLEAR / STOP
// ============================================================
void clearProgram(bool log = true) {
  if (log && progActive) webLog("[STOP] " + curr.name);

  // Stop outputs created by the current runtime program.
  for (int i = 0; i < curr.loopCount; i++) {
    LoopTask& t = curr.loopTasks[i];
    if (!t.used) continue;

    if (t.type == "blink") {
      if (canOutput(t.pin)) digitalWrite(t.pin, LOW);
    } else if (t.type == "pwm" && canOutput(t.pin)) {
      ledcWrite(t.pin, 0);
      ledcDetach(t.pin);
    }
  }

  for (int i = 0; i < curr.oneshotCount; i++) {
    OneshotTask& o = curr.oneshots[i];
    if (!o.used) continue;
    if (o.type == "pwm_set" && canOutput(o.pin)) {
      ledcWrite(o.pin, 0);
      ledcDetach(o.pin);
    }
  }

  detachAllServos();

  if (dhtSensor) {
    delete dhtSensor;
    dhtSensor = nullptr;
    dhtPin = -1;
  }

  curr = Program();
  progActive = false;
}

void ensureDHT(int pin) {
  if (dhtPin == pin && dhtSensor) return;
  if (dhtSensor) delete dhtSensor;
  dhtSensor = new DHT(pin, DHT11);
  dhtSensor->begin();
  dhtPin = pin;
  webLog("[DHT11] Initialized GPIO " + String(pin));
}

// ============================================================
// RUNTIME EXECUTION
// ============================================================
void runProgram() {
  if (!progActive) return;
  unsigned long now = millis();

  for (int i = 0; i < curr.loopCount; i++) {
    LoopTask& t = curr.loopTasks[i];
    if (!t.used) continue;
    if (t.interval_ms < 1) t.interval_ms = 1;
    if (now - t.lastRun < (unsigned long)t.interval_ms) continue;
    t.lastRun = now;

    if (t.type == "blink") {
      t.toggle = !t.toggle;
      digitalWrite(t.pin, t.toggle ? HIGH : LOW);
      webLog("[BLINK] GPIO " + String(t.pin) + " -> " + (t.toggle ? "ON" : "OFF"));
    }
    else if (t.type == "dht11") {
      ensureDHT(t.pin);
      float temp = dhtSensor->readTemperature();
      float hum = dhtSensor->readHumidity();
      if (!isnan(temp) && !isnan(hum)) {
        webLog("[DHT11] GPIO " + String(t.pin) + " Temp=" + String(temp, 1) +
               "C Hum=" + String(hum, 1) + "%");
      } else {
        webLog("[DHT11] Read error on GPIO " + String(t.pin));
      }
    }
    else if (t.type == "analog") {
      int val = analogRead(t.pin);
      float volts = val * 3.3f / 4095.0f;
      webLog("[ADC] GPIO " + String(t.pin) + " = " + String(val) +
             " (" + String(volts, 3) + "V)");
    }
    else if (t.type == "digital_read") {
      int value = digitalRead(t.pin);
      webLog("[DIGITAL] GPIO " + String(t.pin) + " = " + String(value));
    }
    else if (t.type == "pwm") {
      ledcWrite(t.pin, constrain(t.param, 0, 255));
      webLog("[PWM] GPIO " + String(t.pin) + " duty=" + String(constrain(t.param, 0, 255)));
    }
    else if (t.type == "servo") {
      int idx = ensureServo(t.pin);
      if (idx >= 0) {
        int angle = constrain(t.param, 0, 180);
        servoPool[idx].write(angle);
        webLog("[SERVO] GPIO " + String(t.pin) + " angle=" + String(angle));
      }
    }
    else if (t.type == "servo_sweep") {
      int idx = ensureServo(t.pin);
      if (idx >= 0) {
        int minA = constrain(t.param, 0, 180);
        int maxA = constrain(t.param2, 0, 180);
        if (maxA < minA) { int x = minA; minA = maxA; maxA = x; }
        int range = maxA - minA;
        if (range == 0) {
          servoPool[idx].write(minA);
        } else {
          int steps = 20;
          int phase = (int)((now / max(1L, t.interval_ms)) % (2 * steps));
          int pos = phase <= steps ? phase : (2 * steps - phase);
          int angle = minA + (range * pos / steps);
          servoPool[idx].write(angle);
        }
      }
    }
  }
}

// ============================================================
// PROGRAM PERSISTENCE
// ============================================================
bool saveProgram() {
  if (!SPIFFS.begin(true)) return false;

  File f = SPIFFS.open("/program.json", FILE_WRITE);
  if (!f) return false;

  JsonDocument doc;
  doc["name"] = curr.name;
  doc["description"] = curr.description;
  doc["model"] = GEMINI_MODEL;

  JsonArray loops = doc["loop_tasks"].to<JsonArray>();
  for (int i = 0; i < curr.loopCount; i++) {
    LoopTask& t = curr.loopTasks[i];
    JsonObject x = loops.add<JsonObject>();
    x["type"] = t.type;
    x["pin"] = t.pin;
    x["interval_ms"] = t.interval_ms;
    x["param"] = t.param;
    x["param2"] = t.param2;
  }

  JsonArray shots = doc["oneshots"].to<JsonArray>();
  for (int i = 0; i < curr.oneshotCount; i++) {
    OneshotTask& o = curr.oneshots[i];
    JsonObject x = shots.add<JsonObject>();
    x["type"] = o.type;
    x["pin"] = o.pin;
    x["action"] = o.action;
    x["param"] = o.param;
  }

  serializeJson(doc, f);
  f.close();
  return true;
}

bool loadSavedProgram() {
  if (!SPIFFS.begin(true)) return false;
  File f = SPIFFS.open("/program.json", FILE_READ);
  if (!f) return false;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) return false;

  if (doc["model"].is<String>()) GEMINI_MODEL = doc["model"].as<String>();

  Program p;
  p.name = doc["name"] | "Saved Program";
  p.description = doc["description"] | "";

  JsonArray loops = doc["loop_tasks"].as<JsonArray>();
  for (JsonObject x : loops) {
    if (p.loopCount >= MAX_TASKS) break;
    LoopTask& t = p.loopTasks[p.loopCount++];
    t.type = x["type"] | "blink";
    t.pin = x["pin"] | 2;
    t.interval_ms = x["interval_ms"] | 1000;
    t.param = x["param"] | 128;
    t.param2 = x["param2"] | 0;
    t.used = true;
  }

  JsonArray shots = doc["oneshots"].as<JsonArray>();
  for (JsonObject x : shots) {
    if (p.oneshotCount >= MAX_TASKS) break;
    OneshotTask& o = p.oneshots[p.oneshotCount++];
    o.type = x["type"] | "gpio";
    o.pin = x["pin"] | 2;
    o.action = x["action"] | "off";
    o.param = x["param"] | 0;
    o.used = true;
  }

  curr = p;
  return true;
}

// ============================================================
// APPLY PROGRAM
// ============================================================
bool loadProgram(const Program& p, bool clearOld, String& error) {
  if (clearOld) clearProgram();

  // Validate first so a bad AI response cannot partially configure hardware.
  for (int i = 0; i < p.loopCount; i++) {
    const LoopTask& t = p.loopTasks[i];
    String reason;
    if (!validatePinFor(t.type, t.pin, reason)) {
      error = reason;
      return false;
    }
  }
  for (int i = 0; i < p.oneshotCount; i++) {
    const OneshotTask& o = p.oneshots[i];
    String reason;
    if (!validatePinFor(o.type, o.pin, reason)) {
      error = reason;
      return false;
    }
  }

  curr = p;

  for (int i = 0; i < curr.loopCount; i++) {
    LoopTask& t = curr.loopTasks[i];
    if (!t.used) continue;

    t.interval_ms = max(1L, t.interval_ms);
    t.lastRun = 0;
    t.toggle = false;

    if (t.type == "blink") {
      pinMode(t.pin, OUTPUT);
      digitalWrite(t.pin, LOW);
    }
    else if (t.type == "analog") {
      pinMode(t.pin, INPUT);
    }
    else if (t.type == "digital_read") {
      pinMode(t.pin, INPUT);
    }
    else if (t.type == "pwm") {
      pinMode(t.pin, OUTPUT);
      if (!ledcAttach(t.pin, 5000, 8)) {
        error = "Could not attach PWM to GPIO " + String(t.pin);
        curr = Program();
        return false;
      }
      ledcWrite(t.pin, constrain(t.param, 0, 255));
    }
    else if (t.type == "dht11") {
      ensureDHT(t.pin);
    }
    else if (t.type == "servo" || t.type == "servo_sweep") {
      if (ensureServo(t.pin) < 0) {
        error = "Could not attach servo to GPIO " + String(t.pin);
        curr = Program();
        return false;
      }
    }
  }

  for (int i = 0; i < curr.oneshotCount; i++) {
    OneshotTask& o = curr.oneshots[i];
    if (!o.used) continue;

    if (o.type == "gpio") {
      pinMode(o.pin, OUTPUT);
      bool on = o.action == "on";
      if (o.action == "toggle") on = !digitalRead(o.pin);
      digitalWrite(o.pin, on ? HIGH : LOW);
      webLog("[GPIO] GPIO " + String(o.pin) + " -> " + (on ? "ON" : "OFF"));
    }
    else if (o.type == "pwm_set") {
      pinMode(o.pin, OUTPUT);
      if (!ledcAttach(o.pin, 5000, 8)) {
        error = "Could not attach PWM to GPIO " + String(o.pin);
        return false;
      }
      int duty = constrain(o.param, 0, 255);
      ledcWrite(o.pin, duty);
      webLog("[PWM] GPIO " + String(o.pin) + " duty=" + String(duty));
    }
    else if (o.type == "digital_read") {
      pinMode(o.pin, INPUT);
      webLog("[DIGITAL] GPIO " + String(o.pin) + " = " + String(digitalRead(o.pin)));
    }
    else if (o.type == "servo") {
      int idx = ensureServo(o.pin);
      if (idx < 0) {
        error = "Could not attach servo to GPIO " + String(o.pin);
        return false;
      }
      int angle = constrain(o.param, 0, 180);
      servoPool[idx].write(angle);
      webLog("[SERVO] GPIO " + String(o.pin) + " angle=" + String(angle));
    }
  }

  progActive = (curr.loopCount > 0 || curr.oneshotCount > 0);
  if (progActive) webLog("[START] " + curr.name + " - " + curr.description);
  saveProgram();
  return true;
}

// ============================================================
// GEMINI
// ============================================================
String askGemini(const String& userCmd) {
  if (String(GEMINI_KEY) == "YOUR_GEMINI_API_KEY" || strlen(GEMINI_KEY) < 10) {
    return "{\"error\":\"Set GEMINI_KEY first\"}";
  }

  WiFiClientSecure client;
  client.setInsecure(); // For simple hobby use. Production should verify CA.
  client.setTimeout(20);

  HTTPClient https;
  String url = "https://generativelanguage.googleapis.com/v1beta/models/" +
               GEMINI_MODEL + ":generateContent?key=" + GEMINI_KEY;
  if (!https.begin(client, url)) return "{\"error\":\"HTTPS begin failed\"}";
  https.addHeader("Content-Type", "application/json");
  https.setTimeout(20000);

  String prompt =
    "You are the control brain of an ESP32 DevKit V / ESP32-WROOM-32 dynamic runtime.\n"
    "Translate the user's natural-language TEXT OR VOICE transcript into a safe JSON hardware program.\n\n"
    "The user can rewrite the RUNNING BEHAVIOR at any time. A new command may replace the previous program.\n"
    "Never return C++ code. Return ONLY JSON matching the schema below.\n\n"
    "CURRENT PROGRAM: " + (progActive ? curr.name : "none") + "\n"
    "CURRENT DESCRIPTION: " + (progActive ? curr.description : "idle") + "\n\n"
    "AVAILABLE ONESHOT TASKS:\n"
    "gpio: {type:'gpio', pin:N, action:'on'|'off'|'toggle'}\n"
    "pwm_set: {type:'pwm_set', pin:N, param:0..255}\n"
    "digital_read: {type:'digital_read', pin:N}\n"
    "servo: {type:'servo', pin:N, param:0..180}\n\n"
    "AVAILABLE LOOP TASKS:\n"
    "blink: {type:'blink', pin:N, interval_ms:positive integer}\n"
    "dht11: {type:'dht11', pin:N, interval_ms:positive integer}\n"
    "analog: {type:'analog', pin:N, interval_ms:positive integer}\n"
    "digital_read: {type:'digital_read', pin:N, interval_ms:positive integer}\n"
    "pwm: {type:'pwm', pin:N, interval_ms:positive integer, param:0..255}\n"
    "servo: {type:'servo', pin:N, interval_ms:positive integer, param:0..180}\n"
    "servo_sweep: {type:'servo_sweep', pin:N, interval_ms:positive integer, param:minimum angle 0..180, param2:maximum angle 0..180}\n\n"
    "GPIO RULES:\n"
    "- ESP32 GPIO numbering is 0..39. GPIO 6..11 are normally flash and must NOT be used.\n"
    "- GPIO 34..39 are input-only. Never use them for output, PWM or servo.\n"
    "- ADC input should use GPIO 32..39.\n"
    "- GPIO 0,2,4,5,12,15 are boot-strapping pins; they are usable but warn in message if relevant.\n"
    "- GPIO 1 and 3 are UART pins; warn if relevant.\n"
    "- If the user explicitly specifies a valid GPIO, use it. Do not silently substitute another pin.\n"
    "- If the user does not specify a pin, choose a reasonable output GPIO such as 2 or 4.\n"
    "- For 'stop', 'clear', 'reset', return empty arrays and clear_previous=true.\n"
    "- For a command that only changes one GPIO, clear_previous=false unless the user asks to replace the program.\n"
    "- For a new mode/sensor/automation, clear_previous=true.\n"
    "- Keep intervals reasonable; DHT11 should normally be >=2000ms.\n"
    "- The message must be concise and describe what was applied.\n\n"
    "JSON SCHEMA:\n"
    "{\n"
    "  \"program\": {\n"
    "    \"name\": \"short name\",\n"
    "    \"description\": \"one line\",\n"
    "    \"loop_tasks\": [],\n"
    "    \"oneshots\": []\n"
    "  },\n"
    "  \"clear_previous\": true,\n"
    "  \"message\": \"friendly result\"\n"
    "}\n\n"
    "USER COMMAND: " + userCmd;

  JsonDocument req;
  JsonArray contents = req["contents"].to<JsonArray>();
  JsonObject c = contents.add<JsonObject>();
  JsonArray parts = c["parts"].to<JsonArray>();
  JsonObject part = parts.add<JsonObject>();
  part["text"] = prompt;

  String body;
  serializeJson(req, body);

  int code = https.POST(body);
  String raw = https.getString();
  https.end();

  if (code != 200) {
    webLog("[GEMINI] HTTP " + String(code) + ": " + raw.substring(0, 300));
    return "{\"error\":\"Gemini HTTP " + String(code) + "\"}";
  }

  JsonDocument resp;
  if (deserializeJson(resp, raw)) return "{\"error\":\"Gemini response parse failed\"}";

  String text = resp["candidates"][0]["content"]["parts"][0]["text"] | "";
  text.replace("```json", "");
  text.replace("```", "");
  text.trim();
  return text;
}

bool parseGeminiResponse(const String& json, Program& out, bool& clearPrev, String& message, String& error) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    error = "Invalid JSON from Gemini: " + String(err.c_str());
    return false;
  }

  if (doc["error"].is<const char*>()) {
    error = doc["error"].as<String>();
    return false;
  }

  clearPrev = doc["clear_previous"] | true;
  message = doc["message"] | "Done";

  JsonObject prog = doc["program"].as<JsonObject>();
  if (prog.isNull()) {
    error = "Gemini JSON has no program object";
    return false;
  }

  out = Program();
  out.name = prog["name"] | "Unnamed";
  out.description = prog["description"] | "";

  JsonArray loops = prog["loop_tasks"].as<JsonArray>();
  for (JsonObject x : loops) {
    if (out.loopCount >= MAX_TASKS) break;
    LoopTask& t = out.loopTasks[out.loopCount++];
    t.type = x["type"] | "blink";
    t.pin = x["pin"] | 2;
    t.interval_ms = x["interval_ms"] | 1000;
    t.param = x["param"] | 128;
    t.param2 = x["param2"] | 0;
    t.used = true;
  }

  JsonArray shots = prog["oneshots"].as<JsonArray>();
  for (JsonObject x : shots) {
    if (out.oneshotCount >= MAX_TASKS) break;
    OneshotTask& o = out.oneshots[out.oneshotCount++];
    o.type = x["type"] | "gpio";
    o.pin = x["pin"] | 2;
    o.action = x["action"] | "off";
    o.param = x["param"] | 0;
    o.used = true;
  }

  return true;
}

// ============================================================
// WEB UI
// ============================================================
const char HTML[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 AI Runtime</title>
<style>
:root{--bg:#070b14;--card:#111d2e;--border:#22314a;--text:#e5e7eb;--muted:#8190a8;--accent:#6366f1;--good:#22c55e;--bad:#ef4444;--warn:#f59e0b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:620px;margin:auto;padding:14px;display:grid;gap:12px}header,.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}header{display:flex;gap:10px;align-items:center}h1{font-size:18px;margin:0}.sub{font-size:12px;color:var(--muted);margin-top:3px}.grow{flex:1}.row{display:flex;gap:8px}.row>*{min-width:0}input,select,button{font:inherit}input,select{background:#0b1422;color:var(--text);border:1px solid var(--border);border-radius:10px;padding:11px}input{flex:1}button{border:0;border-radius:10px;padding:11px 14px;background:var(--accent);color:white;font-weight:600;cursor:pointer}.mic{width:78px;height:78px;border-radius:50%;font-size:30px;display:block;margin:6px auto 8px}.mic.rec{background:var(--bad)}.center{text-align:center}.label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.status{padding:9px 11px;border-radius:9px;background:#0b1422;font-size:13px}.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}.log{height:230px;overflow:auto;background:#050810;border-radius:10px;padding:10px;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap}.quick{display:grid;grid-template-columns:1fr 1fr;gap:8px}.quick button{background:#19243a;text-align:left}.small{font-size:12px;color:var(--muted)}@media(max-width:430px){.quick{grid-template-columns:1fr}header{align-items:flex-start}}
</style>
</head>
<body><main>
<header><div style="font-size:28px">⚡</div><div class="grow"><h1>ESP32 AI Runtime</h1><div class="sub" id="ip">Connecting...</div></div><select id="model"><option value="gemini-2.0-flash">Gemini 2.0 Flash</option><option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option><option value="gemini-1.5-flash">Gemini 1.5 Flash</option><option value="gemini-1.5-pro">Gemini 1.5 Pro</option></select></header>
<div class="card"><div class="label">Running behavior</div><div class="status" id="running">Idle</div></div>
<div class="card center"><button class="mic" id="mic">🎤</button><div id="micText" class="small">Tap to speak</div></div>
<div class="row"><input id="cmd" placeholder='Try: "turn GPIO 25 on"'><button id="send">➤</button></div>
<div class="card"><div class="label">Quick commands</div><div class="quick"><button data-cmd="blink GPIO 2 every 500 milliseconds">💡 Blink GPIO 2</button><button data-cmd="read DHT11 on GPIO 4 every 2 seconds">🌡 DHT11 GPIO 4</button><button data-cmd="turn GPIO 25 on">⚡ GPIO 25 ON</button><button data-cmd="stop everything and clear">🛑 Stop All</button></div></div>
<div class="card"><div class="label">Result</div><div id="result" class="status">Ready for text or voice.</div></div>
<div class="card"><div class="label">Live log</div><div id="log" class="log">Waiting...</div></div>
<div class="small">Behavior can be rewritten online without reflash. Arbitrary C++ source rewriting requires an external build/OTA server.</div>
</main>
<script>
const $=id=>document.getElementById(id);let rec=null,listening=false,lastLog='';
$('ip').textContent='http://'+location.host;
$('model').addEventListener('change',async()=>{await fetch('/model',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'model='+encodeURIComponent($('model').value)});});
async function sendCmd(c){if(!c)return;$('cmd').value=c;$('result').className='status';$('result').textContent='⏳ Processing...';try{let r=await fetch('/command',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'cmd='+encodeURIComponent(c)});let d=await r.json();$('result').className='status '+(d.ok?'good':'bad');$('result').textContent=(d.ok?'✅ ':'❌ ')+(d.message||'Done');loadStatus();loadLogs();}catch(e){$('result').className='status bad';$('result').textContent='Connection error';}}
$('send').onclick=()=>sendCmd($('cmd').value.trim());$('cmd').onkeydown=e=>{if(e.key==='Enter')sendCmd($('cmd').value.trim())};document.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>sendCmd(b.dataset.cmd));
function stopMic(){listening=false;$('mic').classList.remove('rec');$('mic').textContent='🎤';$('micText').textContent='Tap to speak';}
$('mic').onclick=()=>{if(listening){rec&&rec.stop();return}let SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){$('result').textContent='Speech recognition is not supported by this browser. Use text mode.';return}rec=new SR();rec.lang='en-US';rec.interimResults=false;rec.onstart=()=>{listening=true;$('mic').classList.add('rec');$('mic').textContent='🔴';$('micText').textContent='Listening...';};rec.onresult=e=>{let t=e.results[0][0].transcript;$('cmd').value=t;sendCmd(t);};rec.onerror=e=>{$('result').textContent='Mic error: '+e.error;stopMic()};rec.onend=stopMic;rec.start();};
async function loadStatus(){try{let r=await fetch('/status');let d=await r.json();$('model').value=d.model||$('model').value;$('running').innerHTML=d.active?'<b class="good">● '+d.name+'</b><br><span class="small">'+d.description+'</span>':'Idle — no program running';}catch(e){}}
async function loadLogs(){try{let r=await fetch('/logs');let d=await r.json();let s=d.logs.join('\n');if(s!==lastLog){lastLog=s;$('log').textContent=s;$('log').scrollTop=$('log').scrollHeight;}}catch(e){}}
loadStatus();loadLogs();setInterval(loadStatus,3000);setInterval(loadLogs,2000);
</script></body></html>
)rawliteral";

// ============================================================
// ONLINE SOURCE-REWRITE OTA
// ============================================================
// The build server owns the Arduino source and dependencies. Gemini rewrites
// the source, Arduino CLI installs missing libraries and compiles it, then
// this device downloads the resulting firmware. The ESP32 never compiles C++.

bool otaConfigReady() {
  return String(BUILDER_URL).indexOf("YOUR_BUILD_SERVER") < 0 &&
         String(DEVICE_TOKEN).length() > 8 &&
         String(DEVICE_ID).length() > 0;
}

bool downloadAndFlash(const String& url) {
  WiFiClientSecure secure;
  secure.setInsecure(); // Replace with CA verification for production.
  HTTPClient http;
  if (!http.begin(secure, url)) return false;
  http.addHeader("Cache-Control", "no-cache");
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    webLog("[OTA] firmware HTTP " + String(code));
    http.end();
    return false;
  }
  int len = http.getSize();
  if (len <= 0) {
    webLog("[OTA] invalid firmware length");
    http.end();
    return false;
  }
  if (!Update.begin((size_t)len)) {
    webLog("[OTA] Update.begin failed");
    http.end();
    return false;
  }
  WiFiClient* stream = http.getStreamPtr();
  size_t written = Update.writeStream(*stream);
  bool ok = written == (size_t)len && Update.end(true);
  if (!ok) {
    webLog("[OTA] flash failed: " + String(Update.getError()));
    Update.abort();
  }
  http.end();
  if (ok) {
    webLog("[OTA] firmware installed; rebooting");
    delay(500);
    ESP.restart();
  }
  return ok;
}

void checkOnlineFirmware() {
  if (!otaConfigReady() || WiFi.status() != WL_CONNECTED) return;
  String base = String(BUILDER_URL);
  String manifestUrl = base + "/device/" + DEVICE_ID + "/manifest";
  HTTPClient http;
  WiFiClientSecure secure;
  secure.setInsecure();
  if (!http.begin(secure, manifestUrl)) return;
  int code = http.GET();
  if (code != HTTP_CODE_OK) { http.end(); return; }
  String body = http.getString();
  http.end();
  JsonDocument doc;
  if (deserializeJson(doc, body)) return;
  String version = doc["version"] | "";
  if (version.length() == 0 || version == installedFirmwareVersion) return;
  webLog("[OTA] new firmware " + version + " found");
  String fwUrl = base + "/device/" + DEVICE_ID + "/firmware?token=" + DEVICE_TOKEN;
  if (downloadAndFlash(fwUrl)) installedFirmwareVersion = version;
}

// ============================================================
// WEB ROUTES
// ============================================================
void setupRoutes() {
  server.on("/", HTTP_GET, []() {
    server.send_P(200, "text/html", HTML);
  });

  server.on("/command", HTTP_POST, []() {
    if (!server.hasArg("cmd")) {
      server.send(400, "application/json", "{\"ok\":false,\"message\":\"Missing command\"}");
      return;
    }

    String cmd = server.arg("cmd");
    cmd.trim();
    if (!cmd.length()) {
      server.send(400, "application/json", "{\"ok\":false,\"message\":\"Empty command\"}");
      return;
    }

    webLog("----------------------------------------");
    webLog("CMD: " + cmd);

    String ai = askGemini(cmd);
    webLog("AI: " + ai.substring(0, min((int)ai.length(), 240)));

    Program p;
    bool clearPrev = true;
    String message;
    String error;

    if (!parseGeminiResponse(ai, p, clearPrev, message, error)) {
      JsonDocument out;
      out["ok"] = false;
      out["message"] = error;
      String json;
      serializeJson(out, json);
      server.send(200, "application/json", json);
      return;
    }

    if (!loadProgram(p, clearPrev, error)) {
      JsonDocument out;
      out["ok"] = false;
      out["message"] = error;
      String json;
      serializeJson(out, json);
      server.send(200, "application/json", json);
      return;
    }

    webLog("MSG: " + message);
    JsonDocument out;
    out["ok"] = true;
    out["message"] = message;
    String json;
    serializeJson(out, json);
    server.send(200, "application/json", json);
  });

  server.on("/model", HTTP_POST, []() {
    if (server.hasArg("model")) {
      String m = server.arg("model");
      // Only allow models from the UI list; this avoids arbitrary URL path input.
      if (m == "gemini-2.0-flash" || m == "gemini-2.0-flash-lite" ||
          m == "gemini-1.5-flash" || m == "gemini-1.5-pro") {
        GEMINI_MODEL = m;
        saveProgram();
        webLog("Model: " + GEMINI_MODEL);
      }
    }
    server.send(200, "application/json", "{\"ok\":true}");
  });

  server.on("/status", HTTP_GET, []() {
    JsonDocument out;
    out["active"] = progActive;
    out["name"] = curr.name;
    out["description"] = curr.description;
    out["model"] = GEMINI_MODEL;
    out["loop_tasks"] = curr.loopCount;
    out["oneshots"] = curr.oneshotCount;
    String json;
    serializeJson(out, json);
    server.send(200, "application/json", json);
  });

  server.on("/logs", HTTP_GET, []() {
    JsonDocument out;
    JsonArray arr = out["logs"].to<JsonArray>();
    int start = (logCnt >= LOG_MAX) ? logHead : 0;
    int count = min(logCnt, LOG_MAX);
    for (int i = 0; i < count; i++) arr.add(logBuf[(start + i) % LOG_MAX]);
    String json;
    serializeJson(out, json);
    server.send(200, "application/json", json);
  });

  server.onNotFound([]() {
    server.send(404, "text/plain", "Not found");
  });
}

// ============================================================
// SETUP / LOOP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  for (int i = 0; i < MAX_SERVOS; i++) {
    servoUsed[i] = false;
    servoPins[i] = -1;
  }

  webLog("");
  webLog("========================================");
  webLog(" ESP32 AI DYNAMIC RUNTIME - CORE 3.x");
  webLog("========================================");

  loadSavedProgram();
  if (GEMINI_MODEL.length() == 0) GEMINI_MODEL = "gemini-2.0-flash";

  webLog("Connecting WiFi: " + String(WIFI_SSID));
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
    if (++tries > 40) {
      webLog("WiFi timeout. Restarting...");
      delay(1000);
      ESP.restart();
    }
  }

  webLog("");
  webLog("WiFi connected");
  webLog("Open: http://" + WiFi.localIP().toString());
  webLog("Gemini model: " + GEMINI_MODEL);

  // Restore the saved runtime program after WiFi is available.
  if (curr.loopCount || curr.oneshotCount) {
    Program saved = curr;
    curr = Program();
    String error;
    if (!loadProgram(saved, true, error)) webLog("Restore failed: " + error);
    else webLog("Restored saved behavior: " + saved.name);
  }

  setupRoutes();
  server.begin();
  webLog("Web server started on port 80");
  webLog("Text/voice -> Gemini -> live hardware behavior");
}

void loop() {
  server.handleClient();
  runProgram();
  if (millis() - lastOtaCheck >= OTA_CHECK_MS) {
    lastOtaCheck = millis();
    checkOnlineFirmware();
  }
}