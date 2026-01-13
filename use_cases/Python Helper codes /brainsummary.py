from huggingface_hub import hf_hub_download
import tensorflow as tf

# Download the .h5 model from the repo
model_path = hf_hub_download(
    repo_id="jawadskript/brain_tumor_detection_CNN_DeepLearning",
    filename="models/brain_tumor_model.h5"
)

# Load the Keras model
model = tf.keras.models.load_model(model_path)

# Print the model summary (this shows all layers)
model.summary()
