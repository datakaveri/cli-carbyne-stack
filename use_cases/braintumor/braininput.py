import numpy as np
from PIL import Image

# LOAD A JPG TEST IMAGE AND CONVERT TO 150x150x3 ARRAY
IMAGE_PATH = "test1brain.jpg"   # change this

# load and convert to RGB
img = Image.open(IMAGE_PATH).convert("RGB")

# resize to model input size
img = img.resize((150, 150))

# convert to numpy array (dtype uint8, values 0–255)
arr = np.array(img, dtype=np.uint8)

print("Shape:", arr.shape)     

# flatten it row-major
flat = arr.flatten()

print("Flattened length:", len(flat))   

# print as Python list
print("\nImage array (0–255 integers):")
print(flat.tolist())
