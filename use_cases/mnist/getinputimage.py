import struct
import numpy as np


# Download the dataset from Kaggle and add paths for that here
TEST_IMAGES = "/home/user/Downloads/archive/t10k-images-idx3-ubyte/t10k-images-idx3-ubyte"
TEST_LABELS = "/home/user/Downloads/archive/t10k-labels-idx1-ubyte/t10k-labels-idx1-ubyte"

#total of 10,000 test images, we are downloading 10 as of now
NUM_IMAGES = 10
START = 0   
END = 10 


def load_idx_images(filename):
    with open(filename, "rb") as f:
        magic, num, rows, cols = struct.unpack(">IIII", f.read(16))
        data = np.frombuffer(f.read(), dtype=np.uint8)
        data = data.reshape(num, rows, cols)
        return data

def load_idx_labels(filename):
    with open(filename, "rb") as f:
        magic, num = struct.unpack(">II", f.read(8))
        labels = np.frombuffer(f.read(), dtype=np.uint8)
        return labels


# Load images + labels
images = load_idx_images(TEST_IMAGES)
labels = load_idx_labels(TEST_LABELS)

print(f"Loaded {images.shape[0]} test images and {labels.shape[0]} labels")

# Print 10 images with labels
for i in range(START,END):
    label = labels[i]
    flat = images[i].reshape(-1)
    pixel_line = " ".join(str(x) for x in flat)

    print(f"\nImage {i+1}  Label: {label}")
    print(pixel_line)

