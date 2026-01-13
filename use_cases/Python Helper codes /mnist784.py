from PIL import Image
import numpy as np

# Path to your image file
image_path = "mnist7.png"  # <-- change this to your image filename

# Open and convert to grayscale
img = Image.open(image_path).convert("L")

# Resize to 28x28 if needed
img = img.resize((28, 28))

# Convert to numpy array
arr = np.array(img)

# Flatten (28x28 -> 784)
flattened = arr.flatten()

# Convert to space-separated string
line = " ".join(map(str, flattened))

# Save to file
output_file = "mnist_points7.txt"
with open(output_file, "w") as f:
    f.write(line + "\n")

print(f"Saved 784 pixel values from '{image_path}' to '{output_file}'")
