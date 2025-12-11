import torchvision
import numpy as np

mnist_test = torchvision.datasets.MNIST(root=".", train=False, download=True)
precision = 16
BATCH_SIZE = 100
all_images = []

for idx in range(BATCH_SIZE):
    img, label = mnist_test[idx]
    img_flat = np.array(img, dtype=np.float32).flatten() / 255.0
    img_sfix = [int(x * 2**precision) for x in img_flat]
    all_images.extend(img_sfix)

np.array(all_images, dtype=np.int64).tofile("mnist_test_batch.bin")
print(f"Saved {BATCH_SIZE} images to mnist_test_batch.bin")