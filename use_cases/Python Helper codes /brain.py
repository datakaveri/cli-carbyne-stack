from transformers import AutoModel
import numpy as np
from tensorflow import keras

model = keras.models.load_model("/home/user/Downloads/brain_tumor_model.h5")

for layer in model.layers:
    if "conv" in layer.name:
        w, b = layer.get_weights()
        print(layer.name, "weights:", w.shape, "bias:", b.shape)
    if "dense" in layer.name:
        w, b = layer.get_weights()
        print(layer.name, "dense:", w.shape, "bias:", b.shape)