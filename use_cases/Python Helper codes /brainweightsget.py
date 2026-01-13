import h5py
import numpy as np

OUTPUT_FILE = "weights.bin"

def flatten_and_write(arr, f):
    flat = arr.astype(np.int64).flatten()
    f.write(flat.tobytes())
    return len(flat)

model = h5py.File("brain_tumor_model.h5", "r")

# Correct exact layer paths
layers = [
    "model_weights/conv2d/sequential/conv2d/kernel",
    "model_weights/conv2d/sequential/conv2d/bias",

    "model_weights/conv2d_1/sequential/conv2d_1/kernel",
    "model_weights/conv2d_1/sequential/conv2d_1/bias",

    "model_weights/conv2d_2/sequential/conv2d_2/kernel",
    "model_weights/conv2d_2/sequential/conv2d_2/bias",

    "model_weights/dense/sequential/dense/kernel",
    "model_weights/dense/sequential/dense/bias",

    "model_weights/dense_1/sequential/dense_1/kernel",
    "model_weights/dense_1/sequential/dense_1/bias",
]

counts = []

with open(OUTPUT_FILE, "wb") as f:
    for layer in layers:
        arr = model[layer][()]          # load dataset
        count = flatten_and_write(arr, f)
        counts.append((layer, arr.shape, count))

print("\nSaved weights to weights.bin\n")
print("Layer shapes + element counts:")
for name, shape, c in counts:
    print(f"{name:60s}  shape={shape}  count={c}")