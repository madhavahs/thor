#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiServer.h>
#include <DNSServer.h>

// ============================================================================
// --- Wi-Fi Hotspot (AP) Configuration ---
// ============================================================================
const char* AP_SSID     = "ESP32-USB-Router";
const char* AP_PASS     = "12345678";
const int   AP_CHANNEL  = 1;
const int   MAX_CLIENTS = 8;

IPAddress ap_ip(192, 168, 4, 1);
IPAddress ap_gw(192, 168, 4, 1);
IPAddress ap_mask(255, 255, 255, 0);

DNSServer dnsServer;
const byte DNS_PORT = 53;

// Port 8080: HTTP/HTTPS Proxy Server
WiFiServer proxyServer(8080);
// Port 80: Direct Diagnostic Status Page
WiFiServer statusServer(80);

// ============================================================================
// --- Serial Framing Protocol ---
// Header: [0xAA, 0x55, CMD(1B), CID(2B), LEN(2B)] + [PAYLOAD]
// ============================================================================
#define MAGIC_1         0xAA
#define MAGIC_2         0x55

#define CMD_DATA        0x03
#define CMD_CLOSE       0x04

#define MAX_SESSIONS    16
#define RX_BUF_SIZE     1024

struct Session {
  bool active;
  uint16_t cid;
  WiFiClient client;
  unsigned long last_active;
};

Session sessions[MAX_SESSIONS];
uint16_t next_cid = 1;
unsigned long total_bytes_rx = 0;
unsigned long total_bytes_tx = 0;

// Non-blocking Serial Parser State Machine
enum RxState {
  STATE_MAGIC1,
  STATE_MAGIC2,
  STATE_HEADER,
  STATE_PAYLOAD
};

RxState rx_state = STATE_MAGIC1;
uint8_t rx_header[5]; // CMD(1), CID(2), LEN(2)
uint8_t rx_header_idx = 0;
uint8_t rx_cmd = 0;
uint16_t rx_cid = 0;
uint16_t rx_len = 0;
uint16_t rx_payload_idx = 0;
uint8_t rx_payload[RX_BUF_SIZE];

// ============================================================================
// --- Helper Functions ---
// ============================================================================
void send_serial_frame(uint8_t cmd, uint16_t cid, const uint8_t* payload, uint16_t len) {
  uint8_t header[7];
  header[0] = MAGIC_1;
  header[1] = MAGIC_2;
  header[2] = cmd;
  header[3] = (uint8_t)((cid >> 8) & 0xFF);
  header[4] = (uint8_t)(cid & 0xFF);
  header[5] = (uint8_t)((len >> 8) & 0xFF);
  header[6] = (uint8_t)(len & 0xFF);

  Serial.write(header, 7);
  if (len > 0 && payload != NULL) {
    Serial.write(payload, len);
    total_bytes_tx += len;
  }
}

Session* find_session_by_cid(uint16_t cid) {
  for (int i = 0; i < MAX_SESSIONS; i++) {
    if (sessions[i].active && sessions[i].cid == cid) {
      return &sessions[i];
    }
  }
  return NULL;
}

void close_session(int slot) {
  if (sessions[slot].active) {
    send_serial_frame(CMD_CLOSE, sessions[slot].cid, NULL, 0);
    sessions[slot].client.stop();
    sessions[slot].active = false;
  }
}

void dispatch_frame(uint8_t cmd, uint16_t cid, const uint8_t* payload, uint16_t len) {
  Session* s = find_session_by_cid(cid);
  if (!s || !s->active) return;

  if (cmd == CMD_DATA && len > 0) {
    if (s->client.connected()) {
      s->client.write(payload, len);
      s->last_active = millis();
      total_bytes_rx += len;
    }
  } else if (cmd == CMD_CLOSE) {
    s->client.stop();
    s->active = false;
  }
}

// Process incoming Serial bytes non-blockingly
void process_serial_rx() {
  while (Serial.available() > 0) {
    uint8_t b = Serial.read();

    switch (rx_state) {
      case STATE_MAGIC1:
        if (b == MAGIC_1) rx_state = STATE_MAGIC2;
        break;

      case STATE_MAGIC2:
        if (b == MAGIC_2) {
          rx_state = STATE_HEADER;
          rx_header_idx = 0;
        } else if (b != MAGIC_1) {
          rx_state = STATE_MAGIC1;
        }
        break;

      case STATE_HEADER:
        rx_header[rx_header_idx++] = b;
        if (rx_header_idx == 5) {
          rx_cmd = rx_header[0];
          rx_cid = ((uint16_t)rx_header[1] << 8) | rx_header[2];
          rx_len = ((uint16_t)rx_header[3] << 8) | rx_header[4];

          if (rx_len > sizeof(rx_payload)) {
            // Buffer overflow guard -> reset
            rx_state = STATE_MAGIC1;
          } else if (rx_len == 0) {
            dispatch_frame(rx_cmd, rx_cid, NULL, 0);
            rx_state = STATE_MAGIC1;
          } else {
            rx_state = STATE_PAYLOAD;
            rx_payload_idx = 0;
          }
        }
        break;

      case STATE_PAYLOAD:
        rx_payload[rx_payload_idx++] = b;
        if (rx_payload_idx == rx_len) {
          dispatch_frame(rx_cmd, rx_cid, rx_payload, rx_len);
          rx_state = STATE_MAGIC1;
        }
        break;
    }
  }
}

// ============================================================================
// --- Setup ---
// ============================================================================
void setup() {
  // Expand hardware RX buffer to 8 KB
  Serial.setRxBufferSize(8192);
  
  // 460800 Baud: Perfectly stable on all USB cables & CP2102/CH340 chips
  Serial.begin(460800);
  delay(300);

  for (int i = 0; i < MAX_SESSIONS; i++) {
    sessions[i].active = false;
  }

  // 1. Wi-Fi SoftAP
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(ap_ip, ap_gw, ap_mask);
  WiFi.softAP(AP_SSID, AP_PASS, AP_CHANNEL, 0, MAX_CLIENTS);

  // 2. DNS Server (Redirects all domain queries to gateway)
  dnsServer.start(DNS_PORT, "*", ap_ip);

  // 3. Start Proxy & Status Servers
  proxyServer.begin();
  statusServer.begin();

  Serial.println("\n[+] ESP32 Router Ready! Baud: 460800");
}

// ============================================================================
// --- Main Loop ---
// ============================================================================
void loop() {
  // 1. Handle DNS queries
  dnsServer.processNextRequest();

  // 2. Handle Direct Status Webpage on Port 80 (http://192.168.4.1)
  if (statusServer.hasClient()) {
    WiFiClient statusClient = statusServer.available();
    if (statusClient) {
      String page = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n";
      page += "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
      page += "<title>ESP32 Router</title><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f4f6f9;}";
      page += ".card{background:white;padding:20px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);max-width:400px;margin:auto;}";
      page += ".badge{background:#28a745;color:white;padding:5px 12px;border-radius:20px;font-size:14px;}</style></head><body>";
      page += "<div class='card'><h2>ESP32 Router</h2><p><span class='badge'>ONLINE</span></p>";
      page += "<p><b>Proxy Server:</b> 192.168.4.1 : 8080</p>";
      page += "<p><b>Connected Wi-Fi Clients:</b> " + String(WiFi.softAPgetStationNum()) + "</p>";
      page += "<p><b>Data Transferred:</b> " + String((total_bytes_rx + total_bytes_tx) / 1024) + " KB</p>";
      page += "<hr><p style='color:#666;font-size:13px;'>Set your Wi-Fi Proxy to <b>192.168.4.1</b> and port <b>8080</b> to access the internet.</p></div></body></html>";
      statusClient.print(page);
      delay(5);
      statusClient.stop();
    }
  }

  // 3. Accept incoming Wi-Fi clients on Proxy Port 8080
  if (proxyServer.hasClient()) {
    WiFiClient newClient = proxyServer.available();
    if (newClient) {
      newClient.setNoDelay(true);
      int slot = -1;
      for (int i = 0; i < MAX_SESSIONS; i++) {
        if (!sessions[i].active) {
          slot = i;
          break;
        }
      }

      if (slot != -1) {
        sessions[slot].active = true;
        sessions[slot].cid = next_cid++;
        sessions[slot].client = newClient;
        sessions[slot].last_active = millis();
      } else {
        newClient.stop();
      }
    }
  }

  // 4. Forward outgoing data from Wi-Fi clients -> USB Serial to PC
  for (int i = 0; i < MAX_SESSIONS; i++) {
    if (sessions[i].active) {
      if (!sessions[i].client.connected()) {
        close_session(i);
        continue;
      }

      int avail = sessions[i].client.available();
      if (avail > 0) {
        uint8_t buf[512];
        int to_read = min(avail, 512);
        int bytes_read = sessions[i].client.read(buf, to_read);
        if (bytes_read > 0) {
          send_serial_frame(CMD_DATA, sessions[i].cid, buf, bytes_read);
          sessions[i].last_active = millis();
        }
      }

      // Cleanup idle zombie sessions after 45 seconds
      if (millis() - sessions[i].last_active > 45000) {
        close_session(i);
      }
    }
  }

  // 5. Non-blocking Serial Processing (PC -> ESP32 -> Wi-Fi)
  process_serial_rx();
}
