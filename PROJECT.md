---
title: "ESP32 USB Ethernet to Wi-Fi Router"
type: "project-specification"
status: "planning"
version: "1.0.0"
tags:
  - esp32
  - router
  - ethernet
  - usb
  - wifi
  - networking
  - embedded
  - esp-idf
  - lwip
  - obsidian
---

# ESP32 USB Ethernet → Wi-Fi Router

> [!abstract] Project Purpose
> Build a functional router using **ESP32 + the user's existing USB Ethernet adapter**, with **no additional networking hardware**.
>
> The ESP32 receives network traffic through the USB Ethernet adapter and provides a Wi-Fi network for clients.
>
> **Target architecture:**
>
> `USB Ethernet Adapter → ESP32 USB Host → Routing/NAT → ESP32 Wi-Fi AP → Wi-Fi Clients`

---

## 1. Project Goal

### Primary Objective

Build an embedded router that performs:

- USB Ethernet network input
- Wi-Fi Access Point
- IP routing
- NAT/NAPT
- DHCP
- DNS handling
- Basic firewall
- Connection tracking
- Network monitoring
- Serial CLI
- Persistent configuration
- Diagnostics
- Testing
- Deployment

### Hardware Constraint

> [!important]
> **No additional networking hardware may be added.**
>
> The only networking hardware allowed is:
>
> 1. ESP32 board
> 2. Existing USB Ethernet adapter
>
> Do **not** add:
>
> - W5500
> - LAN8720
> - ENC28J60
> - external Ethernet PHY
> - second Wi-Fi module
> - external router module
> - additional networking adapters

---

# 2. Target Architecture

```text
                         INTERNET
                            │
                            │ Ethernet
                            ▼
                  ┌────────────────────┐
                  │ USB Ethernet       │
                  │ Adapter            │
                  │ Existing Hardware  │
                  └─────────┬──────────┘
                            │ USB
                            ▼
                  ┌────────────────────┐
                  │       ESP32        │
                  │                    │
                  │ USB Host           │
                  │ Ethernet Driver    │
                  │                    │
                  │ IP Stack / lwIP     │
                  │ Routing            │
                  │ NAT/NAPT           │
                  │ Firewall           │
                  │ DHCP               │
                  │ DNS                │
                  │                    │
                  │ Wi-Fi AP           │
                  └─────────┬──────────┘
                            │
                           Wi-Fi
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
           Laptop         Phone          IoT
```

---

# 3. Critical Hardware Feasibility Check

## 3.1 Why This Check Is Required

A USB Ethernet adapter is not automatically compatible with every ESP32.

The ESP32 must be able to:

1. Operate as a USB Host.
2. Supply/handle the USB connection appropriately.
3. Enumerate the USB Ethernet adapter.
4. Communicate with the adapter's chipset.
5. Have a compatible USB Ethernet driver.
6. Pass Ethernet frames between USB and the TCP/IP stack.

Therefore the project **must not assume compatibility**.

---

## 3.2 Required Information

Before implementation, identify:

```text
ESP32 board:
ESP32 variant:
ESP-IDF version:
USB capability:
USB connector type:
USB Host capability:

USB Ethernet adapter:
Manufacturer:
Model:
USB chipset:
VID:
PID:
USB speed:
Ethernet speed:
Driver/chipset family:
```

---

## 3.3 Common USB Ethernet Chipsets

The CLI agent must identify the actual chipset before writing the driver.

Possible examples include:

```text
ASIX AX88179 / AX88179A
ASIX AX88772
Realtek RTL8152
Realtek RTL8153
Microchip/SMSC LAN95xx
Other USB Ethernet controllers
```

> [!warning]
> Do **not** assume that an adapter is compatible just because it works on Windows/Linux.
>
> A desktop OS may have a driver that ESP-IDF does not have.

---

# 4. Mandatory Hardware Gate

The CLI agent must perform this before implementing router functionality.

### Gate 1

Identify ESP32 variant.

### Gate 2

Verify USB Host support.

### Gate 3

Identify USB Ethernet adapter chipset.

### Gate 4

Verify whether ESP-IDF has a compatible USB Ethernet implementation/driver.

### Gate 5

Verify USB electrical/power requirements.

### Gate 6

Create:

`docs/HARDWARE.md`

If compatibility cannot be established:

> [!danger]
> STOP.
>
> Do not invent a driver.
>
> Do not proceed to NAT/routing implementation until USB Ethernet communication is proven or a technically valid driver path is established.

---

# 5. Technology Stack

## 5.1 ESP-IDF

Use **ESP-IDF** as the primary firmware framework.

### Why?

ESP-IDF provides:

- ESP32 hardware drivers
- Wi-Fi
- USB Host support on supported ESP32 variants
- FreeRTOS
- networking integration
- lwIP
- NVS
- logging
- build system
- flashing tools
- diagnostics

---

## 5.2 lwIP

Use the ESP-IDF-integrated **lwIP** networking stack.

### Why?

lwIP provides the embedded TCP/IP foundation required for:

- IPv4
- TCP
- UDP
- ICMP
- ARP
- routing-related networking
- DHCP integration
- sockets
- network interfaces

---

## 5.3 FreeRTOS

Use the FreeRTOS environment provided by ESP-IDF.

### Why?

The firmware needs controlled concurrent activities such as:

```text
USB Host
Network processing
Wi-Fi
Router control
CLI
Monitoring
Configuration
Logging
```

Tasks must be designed carefully because ESP32 resources are limited.

---

# 6. System Layers

```text
┌───────────────────────────────────────┐
│              Serial CLI               │
├───────────────────────────────────────┤
│        Configuration / Monitor        │
├───────────────────────────────────────┤
│       Router Control Plane            │
│ DHCP | DNS | Firewall | Conntrack    │
├───────────────────────────────────────┤
│          Forwarding Plane             │
│ Routing | NAT/NAPT | Packet Flow     │
├───────────────────────────────────────┤
│                 lwIP                  │
├───────────────────┬───────────────────┤
│ USB Ethernet      │ Wi-Fi              │
│ Network Interface │ Access Point       │
├───────────────────┼───────────────────┤
│ USB Host Stack    │ ESP32 Wi-Fi Driver │
├───────────────────┴───────────────────┤
│               ESP32                   │
└───────────────────────────────────────┘
```

---

# 7. Network Topology

Use two separate networks.

## WAN

The USB Ethernet interface is the WAN side.

Example:

```text
WAN subnet:
192.168.1.0/24

ESP32 WAN:
DHCP or static

Upstream gateway:
192.168.1.1
```

## LAN

The ESP32 Wi-Fi AP is the LAN side.

Example:

```text
LAN subnet:
192.168.4.0/24

ESP32 gateway:
192.168.4.1

DHCP range:
192.168.4.10 - 192.168.4.100
```

---

# 8. Packet Flow

## 8.1 Outbound

```text
Wi-Fi Client
     │
     ▼
ESP32 Wi-Fi
     │
     ▼
IP Stack
     │
     ▼
Firewall
     │
     ▼
NAT/NAPT
     │
     ▼
Routing
     │
     ▼
USB Ethernet
     │
     ▼
Upstream Network
```

## 8.2 Return Traffic

```text
Upstream Network
     │
     ▼
USB Ethernet
     │
     ▼
IP Stack
     │
     ▼
NAT State
     │
     ▼
Firewall
     │
     ▼
Routing
     │
     ▼
Wi-Fi
     │
     ▼
Original Client
```

---

# 9. Address Translation Example

Without NAT:

```text
Wi-Fi client:
192.168.4.10

Destination:
8.8.8.8:443
```

ESP32 translates the connection to the WAN side.

Conceptually:

```text
Before:

192.168.4.10:50000
        ↓
8.8.8.8:443

After:

WAN_IP:41000
        ↓
8.8.8.8:443
```

Return packets use the stored NAT state to restore the internal destination.

> [!important]
> The actual NAT implementation must be based on APIs and facilities available in the selected ESP-IDF/lwIP version. The CLI agent must inspect the installed SDK rather than assuming an API exists.

---

# 10. Functional Requirements

## FR-01 — USB Host

The ESP32 shall:

- initialize USB Host
- detect USB Ethernet adapter
- enumerate the device
- identify VID/PID
- initialize the correct driver
- establish Ethernet communication
- report errors

---

## FR-02 — Ethernet Network Interface

The firmware shall expose the USB Ethernet adapter as a network interface.

It must support:

- link detection
- MAC address
- IP configuration
- DHCP client
- static IP configuration
- gateway
- DNS
- RX/TX statistics

---

## FR-03 — Wi-Fi Access Point

The ESP32 shall create a Wi-Fi AP.

Example:

```text
SSID:
ESP32-ROUTER

Security:
WPA2 or WPA3 where supported

Gateway:
192.168.4.1
```

Credentials must be configurable.

---

## FR-04 — DHCP Server

The Wi-Fi LAN must provide DHCP.

Each client should receive:

```text
IP address
Subnet mask
Gateway
DNS
Lease
```

---

## FR-05 — Routing

The ESP32 must route packets between:

```text
Wi-Fi LAN
      ↕
Router
      ↕
USB Ethernet WAN
```

Do not accidentally implement a transparent bridge if the project is intended to be a routed NAT router.

---

## FR-06 — NAT/NAPT

Implement or integrate NAT/NAPT required for normal router operation.

Required state information:

```text
Protocol
Internal IP
Internal port
External IP
External port
Translated port
Destination
State
Timeout
```

---

## FR-07 — Firewall

Default policy:

```text
LAN → WAN       ALLOW
WAN → LAN       DENY
Established     ALLOW
Management      LAN ONLY
```

Firewall must prevent unsolicited inbound connections unless explicitly allowed.

---

## FR-08 — DNS

Provide a practical DNS solution for LAN clients.

Possible architecture:

```text
Client
  ↓
ESP32 DNS handling
  ↓
Upstream DNS
```

or another validated DHCP-compatible design.

---

# 11. Router CLI

Create a serial CLI.

Example:

```text
ESP32 Router CLI
Type 'help' for commands.

router>
```

## Commands

```text
help
status

usb status
usb devices
usb ethernet

wan status
wan ip
wan gateway

wifi status
wifi clients

lan status
dhcp leases

route list
nat list
firewall list

dns status

stats
memory
uptime

ping <ip>

config show
config save
config reset

log level

reboot
factory-reset
```

---

# 12. Configuration System

Use ESP-IDF NVS.

Configuration areas:

```text
WIFI
LAN
WAN
DHCP
DNS
NAT
FIREWALL
SYSTEM
LOGGING
```

Example:

```ini
[wifi]
ssid=ESP32-ROUTER
password=<secret>
channel=6

[lan]
ip=192.168.4.1
mask=255.255.255.0
dhcp_start=192.168.4.10
dhcp_end=192.168.4.100

[wan]
mode=dhcp

[dns]
primary=1.1.1.1
secondary=8.8.8.8
```

> [!danger]
> Never commit real Wi-Fi passwords or secrets to Git.

---

# 13. Logging

Use ESP-IDF logging facilities.

Levels:

```text
ERROR
WARN
INFO
DEBUG
VERBOSE
```

Examples:

```text
[INFO] USB Host initialized
[INFO] USB Ethernet adapter detected
[INFO] Ethernet interface started
[INFO] WAN DHCP completed
[INFO] Wi-Fi AP started
[INFO] DHCP server started
[INFO] NAT initialized
[WARN] Ethernet link down
[ERROR] USB Ethernet driver failure
```

Avoid per-packet logs in production.

---

# 14. Monitoring

Track:

```text
Uptime
Free heap
Minimum free heap
USB device state
Ethernet link
WAN IP
WAN gateway
Wi-Fi clients
RX packets
TX packets
RX bytes
TX bytes
Dropped packets
NAT entries
Firewall drops
DHCP leases
DNS status
```

---

# 15. Error Recovery

## USB Adapter Disconnect

```text
USB disconnect
      ↓
Detect event
      ↓
Stop WAN interface
      ↓
Clear invalid state
      ↓
Attempt controlled recovery
      ↓
Re-enumerate adapter
      ↓
Restart network interface
```

## Ethernet Link Down

```text
Link DOWN
   ↓
Mark WAN unavailable
   ↓
Stop forwarding
   ↓
Wait for link
   ↓
Recover
```

## Wi-Fi Failure

```text
Detect failure
      ↓
Restart AP
      ↓
Restore configuration
      ↓
Report event
```

The router must not enter an infinite blocking state.

---

# 16. Security Requirements

Implement:

- WPA-protected Wi-Fi
- configurable credentials
- LAN-only management
- input validation
- bounds checking
- safe configuration handling
- firewall defaults
- rate limiting where practical
- controlled logging
- watchdog/recovery
- no embedded production passwords

---

# 17. Project Directory

```text
esp32-usb-router/
│
├── PROJECT.md
├── README.md
├── LICENSE
├── .gitignore
│
├── CMakeLists.txt
├── sdkconfig.defaults
│
├── main/
│   ├── CMakeLists.txt
│   ├── app_main.c
│   │
│   ├── usb/
│   │   ├── usb_host.c
│   │   ├── usb_host.h
│   │   ├── usb_ethernet.c
│   │   └── usb_ethernet.h
│   │
│   ├── wan/
│   │   ├── wan.c
│   │   └── wan.h
│   │
│   ├── wifi/
│   │   ├── wifi_ap.c
│   │   └── wifi_ap.h
│   │
│   ├── router/
│   │   ├── router.c
│   │   ├── router.h
│   │   ├── forwarding.c
│   │   └── forwarding.h
│   │
│   ├── nat/
│   │   ├── nat.c
│   │   └── nat.h
│   │
│   ├── firewall/
│   │   ├── firewall.c
│   │   └── firewall.h
│   │
│   ├── dhcp/
│   │   ├── dhcp.c
│   │   └── dhcp.h
│   │
│   ├── dns/
│   │   ├── dns.c
│   │   └── dns.h
│   │
│   ├── cli/
│   │   ├── cli.c
│   │   └── cli.h
│   │
│   ├── config/
│   │   ├── config.c
│   │   └── config.h
│   │
│   ├── monitor/
│   │   ├── monitor.c
│   │   └── monitor.h
│   │
│   └── utils/
│       ├── router_log.c
│       └── router_log.h
│
├── components/
│   └── usb_ethernet/
│       ├── CMakeLists.txt
│       ├── include/
│       └── src/
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── network/
│
├── scripts/
│   ├── build.ps1
│   ├── flash.ps1
│   ├── monitor.ps1
│   └── test.ps1
│
├── docs/
│   ├── HARDWARE.md
│   ├── ARCHITECTURE.md
│   ├── NETWORK.md
│   ├── USB_ETHERNET.md
│   ├── TESTING.md
│   ├── SECURITY.md
│   ├── DEPLOYMENT.md
│   └── TROUBLESHOOTING.md
│
└── config/
    └── example-config.ini
```

---

# 18. Development Stages

> [!tip] Development Rule
> Complete and test each stage before starting the next stage.

---

## Stage 00 — Hardware Discovery

### Tasks

- [ ] Identify ESP32 model
- [ ] Identify ESP32 board
- [ ] Identify USB connector
- [ ] Verify USB Host capability
- [ ] Identify USB Ethernet adapter
- [ ] Identify adapter chipset
- [ ] Record VID/PID
- [ ] Determine required USB speed
- [ ] Determine power requirements
- [ ] Check ESP-IDF support
- [ ] Create `HARDWARE.md`

### Gate

**Do not continue until USB Ethernet feasibility is established.**

---

# Stage 01 — Development Environment

Install/configure:

- [ ] Git
- [ ] ESP-IDF
- [ ] Python environment
- [ ] CMake
- [ ] Ninja
- [ ] USB/serial tools

Verify:

```bash
idf.py --version
```

Acceptance:

```text
ESP-IDF detected
Project can build
```

---

# Stage 02 — Minimal Firmware

Create:

```text
Hello Router
Firmware version
ESP32 information
Free heap
```

Acceptance:

- [ ] Builds
- [ ] Flashes
- [ ] Boots
- [ ] Serial output works
- [ ] No reboot loop

---

# Stage 03 — USB Host

Implement USB Host initialization.

Test:

```text
USB Host initialized
```

Acceptance:

- [ ] Host starts
- [ ] USB events are received
- [ ] No crashes
- [ ] Device insertion detected

---

# Stage 04 — USB Ethernet Enumeration

Connect the existing USB Ethernet adapter.

Required output:

```text
USB device connected
VID: XXXX
PID: XXXX
USB Ethernet adapter detected
```

Acceptance:

- [ ] Adapter enumerates
- [ ] Correct chipset identified
- [ ] Driver loads
- [ ] Ethernet interface created

> [!danger]
> If the adapter cannot be driven, stop here and document the incompatibility.

---

# Stage 05 — Ethernet Network Interface

Implement:

- [ ] MAC address
- [ ] Link state
- [ ] DHCP client
- [ ] Static IP
- [ ] Gateway
- [ ] DNS

Acceptance:

```text
WAN link UP
WAN IP acquired
Gateway reachable
```

---

# Stage 06 — Wi-Fi AP

Implement:

- [ ] Wi-Fi AP
- [ ] SSID
- [ ] Password
- [ ] Channel
- [ ] LAN IP

Acceptance:

```text
Client can connect to ESP32 AP.
```

---

# Stage 07 — DHCP Server

Implement LAN DHCP.

Acceptance:

```text
Client receives:

IP
Mask
Gateway
DNS
```

Client must be able to ping:

```text
192.168.4.1
```

---

# Stage 08 — Basic Routing

Implement forwarding between:

```text
Wi-Fi
  ↕
IP routing
  ↕
USB Ethernet
```

First validate forwarding in a controlled network.

Acceptance:

- [ ] Wi-Fi → WAN packet path
- [ ] WAN → Wi-Fi return path
- [ ] Routing decisions correct

---

# Stage 09 — NAT/NAPT

Implement NAT.

Test:

```text
Wi-Fi Client
      ↓
ESP32 NAT
      ↓
USB Ethernet
      ↓
Upstream Router
```

Test:

- [ ] ICMP
- [ ] TCP
- [ ] UDP
- [ ] DNS
- [ ] HTTPS
- [ ] Multiple clients

---

# Stage 10 — Firewall

Implement:

```text
LAN → WAN = ALLOW
WAN → LAN = DENY
Established = ALLOW
Management = LAN only
```

Test:

- [ ] outbound connections
- [ ] return connections
- [ ] unsolicited inbound
- [ ] invalid traffic
- [ ] firewall counters

---

# Stage 11 — DNS

Implement validated DNS handling.

Acceptance:

```bash
nslookup example.com
```

Expected:

```text
Successful resolution
```

---

# Stage 12 — Router CLI

Implement:

```text
help
status
usb status
wan status
wifi status
wifi clients
lan status
dhcp leases
route list
nat list
firewall list
dns status
stats
memory
uptime
ping
config show
config save
reboot
factory-reset
```

---

# Stage 13 — Persistent Configuration

Use NVS.

Test:

```text
Change config
↓
Save
↓
Reboot
↓
Verify configuration
```

Acceptance:

- [ ] Configuration persists
- [ ] Invalid config rejected
- [ ] Factory reset works
- [ ] No secrets exposed in logs

---

# Stage 14 — Monitoring

Implement:

- [ ] memory monitoring
- [ ] packet counters
- [ ] NAT counters
- [ ] firewall counters
- [ ] USB state
- [ ] WAN state
- [ ] Wi-Fi client list
- [ ] uptime

---

# Stage 15 — Failure Recovery

Test:

- [ ] USB unplug
- [ ] USB reconnect
- [ ] Ethernet cable unplug
- [ ] Ethernet cable reconnect
- [ ] upstream DHCP unavailable
- [ ] Wi-Fi restart
- [ ] ESP32 reboot
- [ ] invalid configuration

Expected:

```text
Controlled recovery
No firmware crash
No permanent networking lock
```

---

# Stage 16 — Security Hardening

Review:

- [ ] Wi-Fi security
- [ ] firewall defaults
- [ ] management exposure
- [ ] credentials
- [ ] memory safety
- [ ] input validation
- [ ] configuration validation
- [ ] logging
- [ ] watchdog

---

# Stage 17 — Unit Tests

Test:

```text
IP validation
CLI parsing
NAT allocation
NAT lookup
NAT timeout
Firewall rule matching
Configuration validation
Statistics
```

---

# Stage 18 — Hardware Integration Testing

Topology:

```text
             Internet
                 │
          Upstream Router
                 │
             Ethernet
                 │
        USB Ethernet Adapter
                 │
                 │ USB
                 ▼
              ESP32
                 │
                Wi-Fi
                 │
          ┌──────┼──────┐
          ▼      ▼      ▼
         PC    Phone    IoT
```

Test:

- [ ] USB detection
- [ ] WAN DHCP
- [ ] Wi-Fi AP
- [ ] LAN DHCP
- [ ] router ping
- [ ] NAT
- [ ] DNS
- [ ] Internet
- [ ] multiple clients

---

# Stage 19 — Network Testing

## Test 19.1 — Gateway

```text
Client → 192.168.4.1
```

Expected:

```text
PASS
```

## Test 19.2 — WAN Gateway

```text
Client → WAN gateway
```

Expected:

```text
PASS
```

## Test 19.3 — External IP

```text
Client → external IP
```

Expected:

```text
PASS
```

## Test 19.4 — DNS

```text
Client → domain
```

Expected:

```text
PASS
```

## Test 19.5 — Multiple Clients

Expected:

```text
Unique DHCP addresses
Simultaneous NAT connections
Stable connectivity
```

---

# Stage 20 — Performance Testing

Measure:

```text
Throughput
Latency
Packet loss
CPU utilization
Free heap
Minimum heap
NAT capacity
Maximum stable clients
USB Ethernet performance
Wi-Fi performance
```

Do not invent performance numbers.

Record actual results.

Example:

```markdown
## Performance Result

| Metric | Result |
|---|---:|
| WAN throughput | TBD |
| LAN throughput | TBD |
| Latency | TBD |
| Packet loss | TBD |
| Maximum stable clients | TBD |
| Free heap | TBD |
| Minimum heap | TBD |
```

---

# Stage 21 — Long-Term Stability

Run:

```text
24-hour minimum
72-hour preferred
```

Monitor:

- [ ] crashes
- [ ] watchdog resets
- [ ] memory leaks
- [ ] USB disconnects
- [ ] Ethernet failures
- [ ] Wi-Fi failures
- [ ] NAT failures
- [ ] packet drops

---

# Stage 22 — Production Build

Before production:

- [ ] Version updated
- [ ] Debug logs reduced
- [ ] Secrets removed
- [ ] Configuration validated
- [ ] Tests passed
- [ ] Documentation updated

Build:

```bash
idf.py build
```

Flash:

```bash
idf.py flash
```

Monitor:

```bash
idf.py monitor
```

Combined:

```bash
idf.py flash monitor
```

---

# Stage 23 — Deployment

Deployment process:

```text
1. Build production firmware
2. Flash ESP32
3. Boot
4. Connect USB Ethernet adapter
5. Connect Ethernet cable
6. Verify WAN
7. Start Wi-Fi AP
8. Connect client
9. Verify DHCP
10. Verify NAT
11. Verify DNS
12. Verify Internet
13. Run smoke test
14. Record firmware version
```

---

# 19. Definition of Done

The project is complete only when:

- [ ] ESP32 USB Host verified
- [ ] USB Ethernet adapter identified
- [ ] USB Ethernet driver verified
- [ ] USB Ethernet network interface works
- [ ] WAN DHCP/static IP works
- [ ] Wi-Fi AP works
- [ ] LAN DHCP works
- [ ] Routing works
- [ ] NAT/NAPT works
- [ ] DNS works
- [ ] Firewall works
- [ ] Multiple clients tested
- [ ] USB disconnect recovery tested
- [ ] Ethernet disconnect recovery tested
- [ ] Wi-Fi recovery tested
- [ ] CLI works
- [ ] Configuration persists
- [ ] Monitoring works
- [ ] Security review completed
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Network tests pass
- [ ] Performance measured
- [ ] Stability test completed
- [ ] Deployment documented

---

# 20. Required Documentation

The CLI agent must create and maintain:

## `README.md`

Include:

- project purpose
- supported hardware
- features
- quick start
- build
- flash
- configuration
- testing
- limitations

## `docs/HARDWARE.md`

Include:

- ESP32 model
- board
- USB capabilities
- USB Ethernet adapter
- chipset
- VID/PID
- power
- USB speed
- compatibility
- pin/connector details

## `docs/USB_ETHERNET.md`

Include:

- USB Host architecture
- enumeration
- chipset
- driver
- USB events
- Ethernet frame path
- known limitations

## `docs/ARCHITECTURE.md`

Include:

- system architecture
- software layers
- tasks
- packet flow
- routing
- NAT
- firewall

## `docs/NETWORK.md`

Include:

- WAN
- LAN
- addressing
- DHCP
- DNS
- routing
- NAT

## `docs/TESTING.md`

Include:

- test topology
- test cases
- expected results
- actual results
- failures
- fixes
- performance results

## `docs/SECURITY.md`

Include:

- Wi-Fi security
- firewall
- management access
- credential handling
- memory safety
- attack surface

## `docs/DEPLOYMENT.md`

Include:

- build
- flash
- configuration
- first boot
- factory reset
- upgrade

## `docs/TROUBLESHOOTING.md`

Include:

- USB enumeration failures
- unsupported chipset
- Ethernet link failures
- DHCP failures
- Wi-Fi failures
- NAT failures
- DNS failures
- memory issues
- watchdog resets

---

# 21. Progress Tracking

Create:

`docs/PROGRESS.md`

Use:

```markdown
# Project Progress

## Hardware

- [ ] ESP32 identified
- [ ] USB Host verified
- [ ] USB Ethernet chipset identified
- [ ] Driver compatibility verified

## Firmware

- [ ] Stage 01 — Environment
- [ ] Stage 02 — Minimal firmware
- [ ] Stage 03 — USB Host
- [ ] Stage 04 — USB Ethernet
- [ ] Stage 05 — WAN
- [ ] Stage 06 — Wi-Fi
- [ ] Stage 07 — DHCP
- [ ] Stage 08 — Routing
- [ ] Stage 09 — NAT
- [ ] Stage 10 — Firewall
- [ ] Stage 11 — DNS
- [ ] Stage 12 — CLI
- [ ] Stage 13 — Configuration
- [ ] Stage 14 — Monitoring
- [ ] Stage 15 — Recovery
- [ ] Stage 16 — Security

## Testing

- [ ] Unit tests
- [ ] Integration tests
- [ ] Network tests
- [ ] Failure tests
- [ ] Performance tests
- [ ] Stability test

## Deployment

- [ ] Production build
- [ ] Deployment test
- [ ] Documentation complete
```

---

# 22. CLI Agent Operating Rules

> [!important]
> These rules are mandatory for any AI coding CLI working on this project.

### Rule 1

Read `PROJECT.md` before making changes.

### Rule 2

Inspect the real hardware before writing USB Ethernet code.

### Rule 3

Identify the actual USB Ethernet chipset.

### Rule 4

Inspect the installed ESP-IDF version.

### Rule 5

Do not invent APIs.

### Rule 6

Do not assume Linux/Windows drivers work on ESP-IDF.

### Rule 7

Do not add networking hardware.

### Rule 8

Do not jump directly to NAT.

### Rule 9

Build after every major stage.

### Rule 10

Test before marking a stage complete.

### Rule 11

Record failures in documentation.

### Rule 12

Never hide compiler errors.

### Rule 13

Never commit passwords.

### Rule 14

Do not claim measured performance without testing.

### Rule 15

Keep hardware drivers separate from router logic.

### Rule 16

Keep CLI code separate from networking code.

### Rule 17

Keep configuration separate from runtime state.

---

# 23. Recommended Development Workflow

```text
┌───────────────┐
│ Read PROJECT  │
└───────┬───────┘
        ▼
┌───────────────┐
│ Inspect HW    │
└───────┬───────┘
        ▼
┌───────────────┐
│ Verify USB    │
└───────┬───────┘
        ▼
┌───────────────┐
│ Build Minimal │
└───────┬───────┘
        ▼
┌───────────────┐
│ USB Host      │
└───────┬───────┘
        ▼
┌───────────────┐
│ USB Ethernet  │
└───────┬───────┘
        ▼
┌───────────────┐
│ WAN           │
└───────┬───────┘
        ▼
┌───────────────┐
│ Wi-Fi AP      │
└───────┬───────┘
        ▼
┌───────────────┐
│ DHCP          │
└───────┬───────┘
        ▼
┌───────────────┐
│ Routing       │
└───────┬───────┘
        ▼
┌───────────────┐
│ NAT/NAPT      │
└───────┬───────┘
        ▼
┌───────────────┐
│ Firewall      │
└───────┬───────┘
        ▼
┌───────────────┐
│ DNS           │
└───────┬───────┘
        ▼
┌───────────────┐
│ CLI + Config  │
└───────┬───────┘
        ▼
┌───────────────┐
│ Testing       │
└───────┬───────┘
        ▼
┌───────────────┐
│ Performance   │
└───────┬───────┘
        ▼
┌───────────────┐
│ Deployment    │
└───────────────┘
```

---

# 24. Testing Checklist

## USB

- [ ] USB Host starts
- [ ] Adapter enumerates
- [ ] VID/PID correct
- [ ] Driver starts
- [ ] RX works
- [ ] TX works
- [ ] Link detected
- [ ] Disconnect detected
- [ ] Reconnect works

## WAN

- [ ] DHCP works
- [ ] Static IP works
- [ ] Gateway works
- [ ] DNS configuration works

## Wi-Fi

- [ ] AP starts
- [ ] Client connects
- [ ] Client receives IP
- [ ] Client reaches gateway
- [ ] Multiple clients work

## Router

- [ ] Routing works
- [ ] NAT works
- [ ] Return traffic works
- [ ] TCP works
- [ ] UDP works
- [ ] ICMP works
- [ ] DNS works
- [ ] HTTPS works

## Security

- [ ] WAN cannot access management by default
- [ ] Firewall drops unsolicited traffic
- [ ] Password not exposed
- [ ] Configuration validated

## Reliability

- [ ] USB reconnect
- [ ] Ethernet reconnect
- [ ] Wi-Fi recovery
- [ ] Reboot recovery
- [ ] 24-hour test
- [ ] 72-hour test if possible

---

# 25. Limitations

This project is an embedded router prototype.

It is **not automatically equivalent to a commercial router**.

Performance depends on:

- ESP32 variant
- CPU frequency
- RAM
- PSRAM availability
- Wi-Fi mode
- USB Ethernet chipset
- USB speed
- driver implementation
- lwIP configuration
- packet size
- NAT table size
- simultaneous connections
- thermal conditions

Therefore:

> [!warning]
> Never claim a specific Mbps throughput, client count, latency, or NAT capacity until it has been measured on the actual hardware.

---

# 26. Final Success Test

The final system must demonstrate:

```text
                     INTERNET
                         │
                  UPSTREAM ROUTER
                         │
                     Ethernet
                         │
                         ▼
              ┌─────────────────────┐
              │ USB Ethernet Adapter │
              └──────────┬──────────┘
                         │ USB
                         ▼
              ┌─────────────────────┐
              │        ESP32        │
              │                     │
              │ USB Host            │
              │ Ethernet Driver     │
              │ Routing             │
              │ NAT                 │
              │ Firewall            │
              │ DHCP                │
              │ DNS                 │
              │ Wi-Fi AP            │
              └──────────┬──────────┘
                         │
                        Wi-Fi
                         │
                ┌────────┼────────┐
                ▼        ▼        ▼
               PC      Phone      IoT
```

A real client must:

1. Connect to the ESP32 Wi-Fi AP.
2. Receive a LAN IP through DHCP.
3. Reach the ESP32 gateway.
4. Send traffic to the WAN.
5. Be translated through NAT where required.
6. Receive return traffic.
7. Resolve DNS.
8. Access the upstream network.
9. Survive normal disconnect/reconnect scenarios.

---

# 27. Final AI CLI Command

Use the following instruction as the starting command for the coding agent:

```text
You are the lead embedded networking engineer for this project.

Read PROJECT.md completely before modifying anything.

Your mission is to build the ESP32 USB Ethernet-to-Wi-Fi router described in this document.

Hardware constraint:
- ESP32
- existing USB Ethernet adapter
- no additional networking hardware

Do not assume hardware compatibility.

FIRST:
1. Identify the ESP32 variant and board.
2. Identify the USB Ethernet adapter.
3. Identify its chipset, VID and PID.
4. Inspect the installed ESP-IDF version.
5. Verify USB Host capability.
6. Verify USB Ethernet driver compatibility.
7. Document the findings in docs/HARDWARE.md.
8. STOP if the hardware/driver path is not technically valid.

THEN:
Follow the development stages sequentially.

For every stage:
1. Explain the implementation plan.
2. Inspect the relevant ESP-IDF APIs/source.
3. Implement the smallest working version.
4. Build.
5. Report compiler errors honestly.
6. Flash when hardware testing is required.
7. Test.
8. Record the result in docs/PROGRESS.md.
9. Update documentation.
10. Only then proceed to the next stage.

Do not implement NAT before USB Ethernet, WAN, Wi-Fi and basic routing are proven.

Do not invent APIs.

Do not add external networking hardware.

Do not commit credentials.

Do not claim functionality that has not been tested.

The final deliverable must be a reproducible ESP32 router firmware project with:
USB Ethernet WAN → routing/NAT/firewall → Wi-Fi LAN,
plus DHCP, DNS, CLI, configuration, monitoring, testing and deployment documentation.
```

---

# 28. Project Status

**Current status:** 🟡 Planning

**Next action:** Hardware discovery

**Required before coding:**

```text
ESP32 model:
ESP32 board:
USB Ethernet adapter model:
USB Ethernet chipset:
VID:
PID:
ESP-IDF version:
```

> [!danger]
> **Do not begin router implementation until these hardware details are verified.**

---

# 29. Engineering Principle

> [!quote]
> **Build from the physical interface upward. Prove USB communication first, prove Ethernet second, prove Wi-Fi third, then build routing, NAT, firewall and higher-level router features.**

The project must remain **measurable, reproducible, testable and documented at every stage**.

---

# End

**Project:** ESP32 USB Ethernet → Wi-Fi Router  
**Architecture:** USB Ethernet WAN → ESP32 → Wi-Fi LAN  
**External networking hardware:** None beyond the existing USB Ethernet adapter  
**Framework:** ESP-IDF  
**Network stack:** lwIP  
**Development model:** Stage-by-stage build → test → document → deploy
