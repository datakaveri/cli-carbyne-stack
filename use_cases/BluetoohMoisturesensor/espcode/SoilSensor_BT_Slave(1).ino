/*
 * SoilSensor_BT_Slave.ino
 *
 * Single ESP32 soil sensor — Bluetooth Classic SLAVE mode.
 *
 * The PC pairs with this device and gets a virtual serial port
 * (/dev/rfcomm0 on Linux). The server reads that port exactly
 * like it used to read /dev/ttyUSB0.
 *
 * MAC addresses:
 *   PC  (master) : 10:91:D1:07:BD:1C
 *   ESP32 (this) : E0:8C:FE:32:D8:9E
 *
 * Data sent every 1 s:
 *   DATA:<analog_reading>\n
 *   e.g.  DATA:1843
 *
 * Wiring:
 *   Soil sensor signal pin → GPIO 34 (RPIN)
 *   Built-in LED           → GPIO 2  (LED_PIN)
 */

#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

#define RPIN    34   // ADC input from soil sensor
#define LED_PIN  2   // built-in LED

// ESP32 Bluetooth MAC address: E0:8C:FE:32:D8:9E
// This is set in hardware — listed here for reference only.
// The PC (master) MAC that will connect: 10:91:D1:07:BD:1C

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  // Start in SLAVE mode with a fixed device name.
  // The ESP32 will advertise as "SoilSensor" (MAC E0:8C:FE:32:D8:9E).
  // On the PC side, bind with:
  //   sudo rfcomm bind 0 E0:8C:FE:32:D8:9E
  SerialBT.begin("SoilSensor");

  Serial.println("=========================================");
  Serial.println("  SoilSensor Bluetooth Slave");
  Serial.println("  ESP32 MAC : E0:8C:FE:32:D8:9E");
  Serial.println("  PC MAC    : 10:91:D1:07:BD:1C");
  Serial.println("  Waiting for PC to connect...");
  Serial.println("=========================================");
}

void loop() {
  // Blink LED slowly while waiting for a connection
  if (!SerialBT.connected()) {
    digitalWrite(LED_PIN, millis() % 1000 < 100 ? HIGH : LOW);
    delay(10);
    return;
  }

  // Solid LED when connected
  digitalWrite(LED_PIN, HIGH);

  int currentReading = analogRead(RPIN);

  // Send in the format the server's parseSerialLine() expects:
  //   "DATA:<value>"
  SerialBT.print("DATA:");
  SerialBT.println(currentReading);

  // Mirror to USB serial for debugging
  Serial.print("BT → DATA:");
  Serial.println(currentReading);

  delay(1000);
}
