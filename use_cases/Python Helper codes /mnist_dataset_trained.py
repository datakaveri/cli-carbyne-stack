import torch
import numpy as np
from transformers import AutoModel

# Parameters
MODEL_NAME = "dacorvo/mnist-mlp"
OUTPUT_FILE = "mnist_weights_all.bin"
PRECISION = 16  # sfix precision for MP-SPDZ

# Load HuggingFace custom MLP
print(f"Downloading and loading model '{MODEL_NAME}'...")
model = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True)
state_dict = model.state_dict()

print("Model loaded successfully.")
print("Flattening weights and converting to sfix integers...")

# Flatten all weights/biases
weights_flat = []
for name, param in state_dict.items():
    param_np = param.detach().numpy().flatten()
    param_sfix = [int(x * 2**PRECISION) for x in param_np]
    weights_flat.extend(param_sfix)
    print(f"{name}: shape {param_np.shape} -> {len(param_sfix)} values")


# Save to single binary file
np.array(weights_flat, dtype=np.int64).tofile(OUTPUT_FILE)
print(f"Saved all weights to '{OUTPUT_FILE}' ({len(weights_flat)} total values)")