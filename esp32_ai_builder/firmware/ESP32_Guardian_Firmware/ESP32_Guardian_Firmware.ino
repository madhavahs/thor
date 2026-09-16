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
  // Core 1 baseline blink idle loop
  digitalWrite(2, HIGH);
  delay(1000);
  digitalWrite(2, LOW);
  delay(1000);
}
