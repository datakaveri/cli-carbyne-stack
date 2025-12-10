import torch
import numpy as np
from transformers import AutoModel

# Load model
model = AutoModel.from_pretrained("dacorvo/mnist-mlp", trust_remote_code=True)
model.eval()

# Storage for intermediate outputs
activations = {}

# Hook helper
def save_activation(name):
    def hook(module, input, output):
        activations[name] = output.detach().cpu()
    return hook

# Attach hooks to the actual layers
model.input_layer.register_forward_hook(save_activation("input_layer_output"))
model.mid_layer.register_forward_hook(save_activation("mid_layer_output"))
model.output_layer.register_forward_hook(save_activation("output_layer_logits"))

# Input pixels
pixel_values = """0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 22 192 134 32 0 0 0 0 0 0 0 0 15 77 5 0 0 0 0 0 0 0 0 0 0 0 0 17 235 250 169 0 0 0 0 0 0 0 0 15 220 241 37 0 0 0 0 0 0 0 0 0 0 0 20 189 253 147 0 0 0 0 0 0 0 0 0 139 253 100 0 0 0 0 0 0 0 0 0 0 0 0 70 253 253 21 0 0 0 0 0 0 0 0 43 254 173 13 0 0 0 0 0 0 0 0 0 0 0 22 153 253 96 0 0 0 0 0 0 0 0 43 231 254 92 0 0 0 0 0 0 0 0 0 0 0 0 163 255 204 11 0 0 0 0 0 0 0 0 104 254 158 0 0 0 0 0 0 0 0 0 0 0 0 0 162 253 178 5 0 0 0 0 0 0 9 131 237 253 0 0 0 0 0 0 0 0 0 0 0 0 0 0 162 253 253 191 175 70 70 70 70 133 197 253 253 169 0 0 0 0 0 0 0 0 0 0 0 0 0 0 51 228 253 253 254 253 253 253 253 254 253 253 219 35 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 17 65 137 254 232 137 137 137 44 253 253 161 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 34 254 206 21 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 160 253 69 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 85 254 241 50 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 158 254 165 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 231 244 50 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 104 254 232 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 208 253 157 0 13 30 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 208 253 154 91 204 161 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 208 253 254 253 154 29 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 61 190 128 23 6 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
"""

arr = np.array([float(x) for x in pixel_values.split()], dtype=np.float32)
if len(arr) != 784:
    raise ValueError(f"Expected 784 values, got {len(arr)}")

# normalize
arr = arr / 255.0
#arr = (arr - 0.1307) / 0.3081
tensor = torch.tensor(arr).view(1, 784)

# Forward pass
with torch.no_grad():
    logits = model(tensor)
    predicted_label = int(torch.argmax(logits, dim=1))

# Print results
print("After input_layer (784 → 256) ")
print(activations["input_layer_output"])

print("\n After mid_layer (256 → 256) ")
print(activations["mid_layer_output"])

print("\n Final logits (256 → 10) ")
print(activations["output_layer_logits"])

print("\nPredicted Label:", predicted_label)
