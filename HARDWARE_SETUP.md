# 🔧 Oil Lamp Voice Control — Hardware Setup Guide

> Step-by-step guide to light 11 physical oil lamps from the web app via an ESP32.

---

## Overview

```
┌─────────────┐      WiFi       ┌──────────┐     GPIO      ┌──────────────────┐    Power     ┌────────────────────────┐
│  Web App    │  ──────────►   │  ESP32   │  ──────────►  │ 16-Channel Relay │  ──────────► │ Nichrome Wire (×11)    │
│  (Browser)  │   HTTP GET     │ (Server) │   HIGH/LOW    │ (11 channels used)│   Switch     │ (Lights 11 Oil Lamps)  │
└─────────────┘                └──────────┘               └──────────────────┘              └────────────────────────┘
```

---

## Step 1 — Buy the Hardware

| Item | Qty | Notes |
|------|-----|-------|
| **ESP32 DevKit** (WROOM-32 or ESP32-S3) | 1 | Any variant works |
| **16-Channel Relay Module** (5V, optocoupler isolated) | 1 | Only 11 channels used |
| **Nichrome Wire** | 11 | Positioned at the wick of each oil lamp |
| **Oil Lamps** | 11 | Traditional oil lamps |
| **Jumper wires** (male-to-female, 20cm) | 15+ | For ESP32 → Relay |
| **5V 2A USB power supply** (for ESP32) | 1 | Micro-USB or USB-C |
| **High Current DC Power Supply** | 1 | For heating the nichrome wires (e.g., 12V 10A+ depending on wire specs) |

---

## Step 2 — Wiring

### GPIO → Relay Pin Mapping

| Oil Lamp | ESP32 GPIO | Relay Input |
|----------|-----------|-------------|
| 1 | GPIO 2 | IN1 |
| 2 | GPIO 4 | IN2 |
| 3 | GPIO 5 | IN3 |
| 4 | GPIO 12 | IN4 |
| 5 | GPIO 13 | IN5 |
| 6 | GPIO 14 | IN6 |
| 7 | GPIO 15 | IN7 |
| 8 | GPIO 16 | IN8 |
| 9 | GPIO 17 | IN9 |
| 10 | GPIO 18 | IN10 |
| 11 | GPIO 19 | IN11 |

### ESP32 → Relay Module

```
ESP32                    Relay Module
─────                    ────────────
GPIO 2  ──────────────►  IN1
GPIO 4  ──────────────►  IN2
GPIO 5  ──────────────►  IN3
GPIO 12 ──────────────►  IN4
GPIO 13 ──────────────►  IN5
GPIO 14 ──────────────►  IN6
GPIO 15 ──────────────►  IN7
GPIO 16 ──────────────►  IN8
GPIO 17 ──────────────►  IN9
GPIO 18 ──────────────►  IN10
GPIO 19 ──────────────►  IN11
GND     ──────────────►  GND
5V (VIN)──────────────►  VCC
```

### Relay → Nichrome Wire (Power Side)

Each relay channel has 3 screw terminals: **COM**, **NO** (Normally Open), **NC** (Normally Closed).

```
DC Power LIVE (+) ──────► COM (relay)
                           NO (relay) ──────► Nichrome Wire terminal 1
DC Power GND (-)  ──────────────────────────► Nichrome Wire terminal 2
```

> ⚠️ **DANGER: Nichrome wire gets extremely hot!**
> - Make sure the wire is securely positioned near the wick.
> - High currents are required; use appropriately rated thick wires from the power supply to the relay and nichrome.
> - Ensure your DC power supply can handle the load if multiple lamps are lit simultaneously.

---

## Step 3 — Flash the ESP32 Firmware

### 3a. Install Arduino IDE

1. Download from [arduino.cc](https://www.arduino.cc/en/software)
2. Go to **File → Preferences → Additional Board Manager URLs**, add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Go to **Tools → Board → Boards Manager**, search `esp32`, install **ESP32 by Espressif**
4. Select your board: **Tools → Board → ESP32 Dev Module**

### 3b. Create a New Sketch & Paste This Code

```cpp
#include <WiFi.h>
#include <WebServer.h>

// ──── CHANGE THESE TO YOUR WIFI ────
const char* ssid     = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASS";

// ──── GPIO pins for lamps 1–11 ────
const int lampPins[11] = {2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19};
bool lampStates[11]    = {false};
unsigned long lampOnTimes[11] = {0};
const unsigned long FIRE_TIME_MS = 5000; // 5 seconds auto-off time

WebServer server(80);

void handleLamp() {
  // Allow cross-origin requests from the web app
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");

  if (!server.hasArg("id") || !server.hasArg("state")) {
    server.send(400, "text/plain", "Missing id or state param");
    return;
  }

  String idStr = server.arg("id");
  String state = server.arg("state");
  bool turnOn  = (state == "on");

  if (idStr == "all") {
    for (int i = 0; i < 11; i++) {
      lampStates[i] = turnOn;
      digitalWrite(lampPins[i], turnOn ? HIGH : LOW);
      if (turnOn) lampOnTimes[i] = millis();
    }
    server.send(200, "text/plain", turnOn ? "All lamps lit" : "All lamps off");
    Serial.println(turnOn ? "ALL ON" : "ALL OFF");
  } else {
    int id = idStr.toInt();
    if (id < 1 || id > 11) {
      server.send(400, "text/plain", "Invalid lamp id (1-11)");
      return;
    }
    int idx = id - 1;
    lampStates[idx] = turnOn;
    digitalWrite(lampPins[idx], turnOn ? HIGH : LOW);
    if (turnOn) lampOnTimes[idx] = millis();
    server.send(200, "text/plain", "Oil Lamp " + String(id) + (turnOn ? " lit" : " off"));
    Serial.println("Oil Lamp " + String(id) + (turnOn ? " lit" : " off"));
  }
}

void handleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.send(204);
}

void setup() {
  Serial.begin(115200);

  // Set all lamp pins as OUTPUT, start OFF
  for (int i = 0; i < 11; i++) {
    pinMode(lampPins[i], OUTPUT);
    digitalWrite(lampPins[i], LOW);
  }

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("✅ Connected! IP address: ");
  Serial.println(WiFi.localIP());   // ← WRITE THIS IP DOWN

  // Register HTTP routes
  server.on("/lamp", HTTP_GET, handleLamp);
  server.on("/lamp", HTTP_OPTIONS, handleOptions);
  server.on("/", []() {
    server.send(200, "text/plain", "Duothan Oil Lamp Controller OK");
  });

  server.begin();
  Serial.println("HTTP server started on port 80");
}

void loop() {
  server.handleClient();

  // Auto-off logic (Fire time safety limit)
  unsigned long currentMillis = millis();
  for (int i = 0; i < 11; i++) {
    if (lampStates[i] && (currentMillis - lampOnTimes[i] >= FIRE_TIME_MS)) {
      lampStates[i] = false;
      digitalWrite(lampPins[i], LOW);
      Serial.println("Auto-off Lamp " + String(i + 1) + " (5s fire time limit)");
    }
  }
}
```

### 3c. Upload to ESP32

1. Connect ESP32 to your laptop via USB
2. Select the correct **COM port** in **Tools → Port**
3. Click **Upload** (the → arrow button)
4. Open **Serial Monitor** (set baud rate to `115200`)
5. You'll see: `✅ Connected! IP address: 192.168.x.x`
6. **Write down this IP address** — you'll enter it in the web app

---

## Step 4 — Network Setup

Both your device (laptop/phone) and the ESP32 **must be on the same WiFi network**.

### Options for the event

| Option | Best for |
|--------|----------|
| **Mobile hotspot** | Quick testing, small setup |
| **Portable travel router** | Most reliable for live events |
| **Event venue WiFi** | Works if no captive portal or firewall |

> 💡 **Tip:** A portable router is the safest option — you control the network and avoid crowded venue WiFi.

---

## Step 5 — Run the Web App

### Option A: Local Dev Server (simplest)

```bash
cd voice-lamp
npm run dev
# or
bun dev
```

Open **http://localhost:3000** in **Google Chrome**.

### Option B: Deploy to Vercel

```bash
cd voice-lamp
npx vercel
```

> **Note:** Even if deployed to Vercel, your browser still sends HTTP requests directly to the ESP32's local IP. So your device must be on the **same WiFi** as the ESP32.

---

## Step 6 — Connect & Test

1. Open the web app in **Chrome**
2. In the **System** panel (sidebar), click the IP field and enter the ESP32's IP (e.g. `192.168.1.105`)
3. Click **Save**

### Test Checklist

- [ ] Click **Lamp 1** card → relay clicks, nichrome wire heats up, oil lamp lights.
- [ ] Click **All ON** → all 11 relays click and heat up.
- [ ] Click **All OFF** → all relays release, nichrome cools.
- [ ] Tap the **mic button** → say "light oil lamp three" → lamp 3 turns on
- [ ] Say "turn off all oil lamps" → all relays turn off

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Failed to reach ESP32" toast | Wrong IP, or devices not on same WiFi |
| Relay clicks but nichrome won't heat | Check DC wiring — use COM + NO terminals |
| Wire heats when it should be off | You might be wired to NC instead of NO |
| Voice not working | Use **Chrome** — Firefox/Safari don't support Web Speech API |
| Mic permission denied | Click the lock icon in the URL bar → Allow Microphone |
| ESP32 keeps disconnecting | Use a stable 5V power supply, not a weak USB port |
| Can't find ESP32 IP | Check your router's connected devices list |

---

## Optional Enhancements

### Static IP (so the IP never changes)

Add this to the firmware **before** `WiFi.begin()`:

```cpp
IPAddress staticIP(192, 168, 1, 200);   // Pick an unused IP
IPAddress gateway(192, 168, 1, 1);       // Your router's IP
IPAddress subnet(255, 255, 255, 0);
WiFi.config(staticIP, gateway, subnet);
```

### mDNS Hostname (access by name instead of IP)

```cpp
#include <ESPmDNS.h>

// Add this in setup() after WiFi connects:
MDNS.begin("duothan-lamp");
// Now access via: http://duothan-lamp.local
```

### Auto-reconnect WiFi

```cpp
// Add this to loop():
if (WiFi.status() != WL_CONNECTED) {
  Serial.println("WiFi lost, reconnecting...");
  WiFi.reconnect();
  delay(5000);
}
```

---

## API Reference

The web app sends these HTTP requests to the ESP32:

| Action | URL |
|--------|-----|
| Turn on lamp 3 | `GET http://<IP>/lamp?id=3&state=on` |
| Turn off lamp 7 | `GET http://<IP>/lamp?id=7&state=off` |
| All lamps on | `GET http://<IP>/lamp?id=all&state=on` |
| All lamps off | `GET http://<IP>/lamp?id=all&state=off` |
| Health check | `GET http://<IP>/` → returns `Duothan Oil Lamp Controller OK` |
