import os
import re
import tensorflow as tf
from huggingface_hub import snapshot_download

def extract_repo_id(url: str):
   
    pattern = r"https?://huggingface\.co/([^/]+)/([^/]+)"
    match = re.match(pattern, url.strip())
    if not match:
        raise ValueError("Invalid Hugging Face model URL.")
    return f"{match.group(1)}/{match.group(2)}"


def inspect_hf_keras_model_from_link(link: str):
    repo_id = extract_repo_id(link)
    print(f"\n📥 Downloading model: {repo_id}\n")

    local_dir = snapshot_download(repo_id)

    # automatically find .h5 file
    h5_file = None
    for f in os.listdir(local_dir):
        if f.endswith(".h5"):
            h5_file = os.path.join(local_dir, f)
            break

    if h5_file is None:
        raise FileNotFoundError("❌ No .h5 file found in the repo.")

    print(f"📦 Found model file: {h5_file}")
    print("🔄 Loading model...\n")

    model = tf.keras.models.load_model(h5_file)  
    print("📌 MODEL SUMMARY")
    model.summary()
    print("📦 LAYER WEIGHTS")

    total_params = 0

    for layer in model.layers:
        weights = layer.get_weights()
        if not weights:
            continue

        print(f"\n🔹 Layer: {layer.name} ({layer.__class__.__name__})")

        for idx, w in enumerate(weights):
            print(f"   Weight#{idx}: shape={w.shape}, params={w.size}, dtype={w.dtype}")
            total_params += w.size

    print(f"TOTAL PARAMETERS: {total_params}")



if __name__ == "__main__":
    link = input("Paste Hugging Face model link: ")
    inspect_hf_keras_model_from_link(link)