#define RPIN 34 // GPIO 34 (Analog ADC1_CH6)
#define LED_PIN 2

int Value1, Value2;
int currentReading;

void setup() {
  // Initialize Serial at 115200 baud
  Serial.begin(115200);
  
  pinMode(RPIN, INPUT);
  pinMode(LED_PIN, OUTPUT); 

  Serial.println("--- Soil Sensor Serial Monitor ---");

  // --- Calibration Logic ---
  // Dry Calibration
  digitalWrite(LED_PIN, HIGH);
  Serial.print("Calibrating Dry Air... ");
  delay(3000); // Increased slightly for stability
  Value1 = analogRead(RPIN);
  Serial.println("Done.");
  digitalWrite(LED_PIN, LOW);
  
  delay(2000);
  
  // Wet Calibration
  digitalWrite(LED_PIN, HIGH);
  Serial.print("Calibrating Wet/Water... ");
  delay(3000);
  Value2 = analogRead(RPIN);
  digitalWrite(LED_PIN, LOW);

  Serial.println("\nCalibration Values:");
  Serial.print("Dry: "); Serial.println(Value1);
  Serial.print("Wet: "); Serial.println(Value2);
  Serial.println("---------------------------------");
  
  // Print a header for the data stream
  Serial.println("Current_Reading,Dry_Ref,Wet_Ref");
}

void loop() {
  currentReading = analogRead(RPIN);

  // Send data in a comma-separated format
  Serial.print(currentReading);
  Serial.print(",");
  Serial.print(Value1);
  Serial.print(",");
  Serial.println(Value2);

  delay(500); // Slowed down slightly for readability
}