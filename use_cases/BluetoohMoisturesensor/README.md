
# Bluetooth Soil Sensor Integration

This project enables real-time soil moisture monitoring by connecting an ESP32 sensor to a web interface via Bluetooth Serial (RFCOMM). Data is processed and managed through a **CarbyneStack** cloud environment.

### 📋 Prerequisites

-   **CarbyneStack:** Ensure your stack is running and you are currently logged in.
    
-   **Hardware:** ESP32 Development Board, Soil Moisture Sensor.
    
-   **Software:** Node.js (for the web interface), Arduino IDE.
    

----------

## 🛠 Setup Instructions

### 1. Hardware Pairing & Binding

First, you need to create a serial bridge between your PC and the ESP32.

1.  **Identify MAC Address:** Find your ESP32's Bluetooth MAC address.
    
2.  **Bind the Device:** Run the following command in your terminal (replace with your ESP32's actual MAC address):
    
    Bash
    
    ```
    sudo rfcomm bind 0 AA:BB:CC:DD:EE:FF
    
    ```
    
3.  **Verify Connection:** Check that the communication port was created successfully:
    
    Bash
    
    ```
    ls /dev/ | grep rfcomm
    
    ```
    
    > **Note:** You should see `/dev/rfcomm0`. If the number differs, use that specific name in the following steps.
    

### 2. ESP32 Configuration

1.  Open the `espcode.ino` file in the **Arduino IDE**.
    
2.  **Update MAC Address:** Locate the section for the target MAC address and replace it with your **PC's Bluetooth MAC address**.
    
3.  **Upload:** Connect your ESP32 via USB and upload the code.
    

### 3. Launching the Application

1.  **Enable Bluetooth:** Ensure your PC's Bluetooth is turned on.
    
2.  **Initialize Node.js:** Open your terminal, navigate to the `bluetooth-soilsensor` folder, and start the server:
    
    Bash
    
    ```
    npm start
    
    ```
    
3.  **Access Web UI:** Open your browser and navigate to: [http://localhost:3000/](https://www.google.com/search?q=http://localhost:3000/&authuser=1)
    

----------

## 🖥 Using the Interface

Once the web page is loaded:

1.  **Select Port:** Choose your Bluetooth port from the dropdown menu (e.g., `/dev/rfcomm0`).
    
2.  **Connect:** Click the **Connect to Bluetooth** button.
    
3.  **Monitor:** Data should now begin streaming from the ESP32 to your local dashboard and CarbyneStack instance.
    

----------

## ⚠️ Troubleshooting

-   **Permission Denied:** If you cannot access `/dev/rfcomm0`, try running `sudo chmod 666 /dev/rfcomm0`.
    
-   **Port Not Found:** Ensure the `rfcomm bind` command was successful and the ESP32 is powered on.
    
-   **CarbyneStack Errors:** Verify your CLI login status by running `cs login`.
