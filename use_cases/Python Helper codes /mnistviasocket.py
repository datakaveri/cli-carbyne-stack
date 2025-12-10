import socket
import struct
import numpy as np

# Configuration
HOST = "localhost"   
PORT = 10000        
INPUT_SIZE = 28 * 28

# Prepare an MNIST input vector
x = np.random.randint(0, 256, size=(INPUT_SIZE,), dtype=np.int64)

print(f"Sending {INPUT_SIZE} values to MPC server at {HOST}:{PORT} ...")

# Connect to MPC socket and send data
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.connect((HOST, PORT))

    # Convert to bytes; Carbyne/MP-SPDZ expects 8-byte ints by default
    for val in x:
        s.sendall(struct.pack("<q", int(val)))   

print("✅ Successfully sent MNIST input.")