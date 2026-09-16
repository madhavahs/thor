#include "GuardianConfig.h"
#include "GuardianAgent.h"

GuardianAgentClass Guardian;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("[BOOT] Starting ESP32 AI Dynamic Runtime Factory Image...");

  // Launches the permanent cloud tunnel on Core 0
  Guardian.begin();
  
  // Built-in status LED indicator
  pinMode(2, OUTPUT);
}

void loop() {
  // Core 1 user logic loop (idle by default, fully controllable via web UI and OTA)
  vTaskDelay(pdMS_TO_TICKS(100));
}
