# ESP32 DevKit V1 USB-to-Wi-Fi Router (P1-Router)

This project routes your PC's active internet connection over the **Micro-USB Data Cable** into an **ESP32 DevKit V1**, which broadcasts it as a **Wi-Fi Hotspot** for your phone, laptop, or other devices.

---

## 📁 Files in This Folder

- [**`Arduino_code.ino`**](file:///D:/antigravity/Project1/ESP32/P1-Router/Arduino_code.ino): ESP32 firmware with non-blocking serial state machine, built-in DNS, status web server on port `80`, and proxy gateway on port `8080`.
- [**`pc_bridge.py`**](file:///D:/antigravity/Project1/ESP32/P1-Router/pc_bridge.py): PC-side internet gateway script running at a rock-solid `460,800` baud.

---

## 🚀 Step-by-Step Instructions

### Step 1: Upload to ESP32
1. Open [**`Arduino_code.ino`**](file:///D:/antigravity/Project1/ESP32/P1-Router/Arduino_code.ino) in Arduino IDE.
2. Select Board: **ESP32 Dev Module**.
3. Select your **COM Port** and click **Upload**.

### Step 2: Run the PC Internet Gateway
1. Close the Arduino Serial Monitor (to free the COM port).
2. Open PowerShell / Command Prompt in this folder:
   ```powershell
   cd D:\antigravity\Project1\ESP32\P1-Router
   python pc_bridge.py
   ```
   *(Select your ESP32's COM port when prompted)*

### Step 3: Connect Devices & Test

1. Connect your phone/laptop to the Wi-Fi:
   * **SSID**: `ESP32-USB-Router`
   * **Password**: `12345678`

2. **Verify Hardware Link (Diagnostic Page)**:
   * Open your browser and go to: `http://192.168.4.1`
   * You will see the **ESP32 Router Online** status page showing client count and live data statistics!

3. **Enable Internet Browsing**:
   * In your device's Wi-Fi Settings for `ESP32-USB-Router`:
     * Set **Proxy**: `Manual`
     * **Proxy Host / Server**: `192.168.4.1`
     * **Proxy Port**: `8080`
   * Now open Google, YouTube, or any website — all web traffic will flow through the Micro-USB cable to your PC!
