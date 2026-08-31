#!/usr/bin/env python3
"""
PC-Side High-Speed Internet Gateway for ESP32 (460,800 Baud)
------------------------------------------------------------
Tunnels internet traffic from PC across the Micro-USB Data Cable to ESP32 Wi-Fi.
"""

import sys
import time
import socket
import select
import argparse
import threading

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("[!] Missing 'pyserial' library. Install via: pip install pyserial")
    sys.exit(1)

MAGIC_1 = 0xAA
MAGIC_2 = 0x55
CMD_DATA  = 0x03
CMD_CLOSE = 0x04

BUFFER_SIZE = 4096


class PCGateway:
    def __init__(self, port, baud=460800):
        self.port = port
        self.baud = baud
        self.ser = None
        self.running = False
        self.sessions = {}         # cid -> socket
        self.session_buffers = {}  # cid -> bytearray
        self.lock = threading.Lock()

    def connect_serial(self):
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baud,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.05
            )
            print(f"[+] Connected to ESP32 on {self.port} at {self.baud} baud!")
            return True
        except serial.SerialException as e:
            print(f"[-] Failed to open {self.port}: {e}")
            print("    Make sure the Arduino Serial Monitor is closed.")
            return False

    def send_frame(self, cmd, cid, payload=b""):
        """Atomically sends a framed packet to ESP32 over serial."""
        header = bytearray([
            MAGIC_1, MAGIC_2, cmd,
            (cid >> 8) & 0xFF, cid & 0xFF,
            (len(payload) >> 8) & 0xFF, len(payload) & 0xFF
        ])
        packet = header + payload if payload else header
        with self.lock:
            if self.ser and self.ser.is_open:
                try:
                    self.ser.write(packet)
                except Exception:
                    pass

    def handle_remote_socket(self, cid, sock, host_info):
        """Reads data from the internet server and sends it to ESP32."""
        bytes_total = 0
        sock.setblocking(False)

        while self.running:
            try:
                r, _, _ = select.select([sock], [], [], 0.05)
                if r:
                    chunk = sock.recv(BUFFER_SIZE)
                    if not chunk:
                        break
                    bytes_total += len(chunk)
                    # Forward in 512-byte slices
                    for i in range(0, len(chunk), 512):
                        self.send_frame(CMD_DATA, cid, chunk[i:i+512])
            except Exception:
                break

        print(f"[✓] [{cid}] Finished: {host_info} ({bytes_total / 1024:.1f} KB transferred)")
        self.close_session(cid)

    def close_session(self, cid):
        with self.lock:
            sock = self.sessions.pop(cid, None)
            self.session_buffers.pop(cid, None)
        if sock:
            try:
                sock.close()
            except Exception:
                pass
        self.send_frame(CMD_CLOSE, cid)

    def process_incoming_request(self, cid, raw_data):
        if cid not in self.session_buffers:
            self.session_buffers[cid] = bytearray()

        buf = self.session_buffers[cid]
        buf.extend(raw_data)

        # Check if HTTP/HTTPS headers are complete
        if b"\r\n\r\n" in buf or b"\n\n" in buf:
            header_text = buf.decode("latin1", errors="ignore")
            lines = header_text.splitlines()
            if not lines:
                self.close_session(cid)
                return

            first_line = lines[0].split()
            if len(first_line) < 2:
                self.close_session(cid)
                return

            method, target = first_line[0].upper(), first_line[1]
            target_host = ""
            target_port = 80
            is_connect = (method == "CONNECT")

            if is_connect:
                # HTTPS Tunnel (e.g. CONNECT www.google.com:443 HTTP/1.1)
                parts = target.split(":")
                target_host = parts[0]
                target_port = int(parts[1]) if len(parts) > 1 else 443
            else:
                # HTTP Request (e.g. GET http://example.com/ HTTP/1.1)
                if target.startswith("http://"):
                    target = target[7:]
                    target_host = target.split("/")[0]
                else:
                    for line in lines:
                        if line.lower().startswith("host:"):
                            target_host = line.split(":", 1)[1].strip()
                            break

                if ":" in target_host:
                    target_host, p = target_host.split(":")
                    target_port = int(p)
                else:
                    target_port = 80

            if not target_host or target_host in ("192.168.4.1", "esp32.local"):
                # Internal test ping
                resp = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK"
                self.send_frame(CMD_DATA, cid, resp)
                self.close_session(cid)
                return

            # Open TCP Socket to the remote internet server
            try:
                target_sock = socket.create_connection((target_host, target_port), timeout=8)
                target_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

                with self.lock:
                    self.sessions[cid] = target_sock

                if is_connect:
                    # Reply 200 Connection Established to client
                    established_resp = b"HTTP/1.1 200 Connection Established\r\n\r\n"
                    self.send_frame(CMD_DATA, cid, established_resp)
                else:
                    # Forward initial HTTP request
                    target_sock.sendall(buf)

                self.session_buffers[cid] = bytearray()
                host_info = f"{target_host}:{target_port}"
                print(f"[-->] [{cid}] Fetching: {host_info} ({method})")

                # Launch listener thread for this socket
                t = threading.Thread(target=self.handle_remote_socket, args=(cid, target_sock, host_info), daemon=True)
                t.start()

            except Exception as e:
                print(f"[-] [{cid}] Connection Failed to {target_host}:{target_port} -> {e}")
                self.close_session(cid)

    def run(self):
        self.running = True
        print("\n=======================================================")
        print(f"  ESP32 Internet Gateway Running ({self.baud} Baud)")
        print("  - Micro-USB Data Cable Link : ACTIVE on " + self.port)
        print("  - Wi-Fi Hotspot SSID        : ESP32-USB-Router")
        print("  - Wi-Fi Password            : 12345678")
        print("  - Proxy Setting on Phone    : 192.168.4.1 : 8080")
        print("  - Test Page in Browser      : http://192.168.4.1")
        print("=======================================================")
        print("[*] Waiting for traffic from ESP32... (Press Ctrl+C to stop)\n")

        rx_buffer = bytearray()

        while self.running:
            try:
                waiting = self.ser.in_waiting
                if waiting > 0:
                    rx_buffer.extend(self.ser.read(waiting))

                while len(rx_buffer) >= 7:
                    # Sync to magic bytes 0xAA 0x55
                    if rx_buffer[0] != MAGIC_1 or rx_buffer[1] != MAGIC_2:
                        del rx_buffer[0]
                        continue

                    cmd = rx_buffer[2]
                    cid = (rx_buffer[3] << 8) | rx_buffer[4]
                    length = (rx_buffer[5] << 8) | rx_buffer[6]

                    if len(rx_buffer) < 7 + length:
                        break  # Wait for full payload to arrive

                    payload = rx_buffer[7:7+length]
                    del rx_buffer[:7+length]

                    if cmd == CMD_DATA and length > 0:
                        with self.lock:
                            sock = self.sessions.get(cid)
                        if sock:
                            try:
                                sock.sendall(payload)
                            except Exception:
                                self.close_session(cid)
                        else:
                            self.process_incoming_request(cid, payload)

                    elif cmd == CMD_CLOSE:
                        self.close_session(cid)

                time.sleep(0.001)

            except (serial.SerialException, OSError):
                break
            except Exception:
                time.sleep(0.001)

        print("\n[+] Gateway stopped.")


def list_com_ports():
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("[-] No COM ports detected. Please plug in your ESP32 with a data cable.")
        return []
    print("\n--- Detected COM Ports ---")
    for idx, port in enumerate(ports):
        print(f"  [{idx + 1}] {port.device} - {port.description}")
    return ports


def select_com_port():
    ports = list_com_ports()
    if not ports:
        sys.exit(1)
    if len(ports) == 1:
        print(f"[+] Auto-selected port: {ports[0].device}")
        return ports[0].device
    while True:
        try:
            choice = input(f"\nSelect port [1-{len(ports)}]: ").strip()
            idx = int(choice) - 1
            if 0 <= idx < len(ports):
                return ports[idx].device
        except ValueError:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ESP32 Internet Gateway")
    parser.add_argument("-p", "--port", type=str, help="COM port (e.g. COM3)")
    parser.add_argument("-b", "--baud", type=int, default=460800, help="Baud rate (default: 460800)")
    args = parser.parse_args()

    port = args.port or select_com_port()
    gateway = PCGateway(port=port, baud=args.baud)
    if gateway.connect_serial():
        try:
            gateway.run()
        except KeyboardInterrupt:
            gateway.running = False
