#!/usr/bin/env python3
"""
Extract DeepPrint embeddings from a single fingerprint image (.png).
Prints the extracted 2D array.
"""

import os
import numpy as np
from pathlib import Path
np.set_printoptions(suppress=True, precision=6)
from flx.extractor.fixed_length_extractor import get_DeepPrint_TexMinu, DeepPrintExtractor
from flx.data.dataset import Dataset
from flx.data.image_loader import SFingeLoader, ImageLoader
from flx.data.dataset import Identifier
import torch
import torchvision.transforms.functional as VTF
import cv2


class TifLoader(ImageLoader):
    """Loader for .tif fingerprint images with pattern <subject_id>_<impression_id>.tif"""
    @staticmethod
    def _extension() -> str:
        return ".tif"

    @staticmethod
    def _file_to_id_fun(_subdir: str, filename: str) -> Identifier:
        subject_id, impression_id = filename.split("_")
        return Identifier(int(subject_id) - 1, int(impression_id) - 1)

    @staticmethod
    def _load_image(filepath: str) -> torch.Tensor:
        img = cv2.imread(filepath, cv2.IMREAD_GRAYSCALE)
        return VTF.to_tensor(img)
from flx.data.transformed_image_loader import TransformedImageLoader
from flx.image_processing.binarization import LazilyAllocatedBinarizer
from flx.data.image_helpers import pad_and_resize_to_deepprint_input_size
from flx.data.embedding_loader import EmbeddingLoader


def extract_embeddings(image_path: str):
    """Extract DeepPrint embeddings from a single .png fingerprint image."""
    # Load model
    model_path = os.path.abspath(".") if os.path.exists("best_model.pyt") else os.path.abspath("example-model")
    extractor = get_DeepPrint_TexMinu(num_training_subjects=8000, num_dims=256)
    extractor.load_best_model(model_path)
    
    # Load image
    image_path_obj = Path(image_path)
    parent_dir = str(image_path_obj.parent)
    
    # Choose loader based on file extension
    ext = image_path_obj.suffix.lower()
    if ext == ".tif" or ext == ".tiff":
        base_loader = TifLoader(parent_dir)
        transforms = [LazilyAllocatedBinarizer(5.0), pad_and_resize_to_deepprint_input_size]
    else:
        base_loader = SFingeLoader(parent_dir)
        transforms = [LazilyAllocatedBinarizer(5.0), pad_and_resize_to_deepprint_input_size]
    
    image_loader = TransformedImageLoader(
        images=base_loader,
        poses=None,
        transforms=transforms,
    )
    
    # Parse the target identifier from filename (e.g., "101_3" -> Identifier(100, 2))
    image_name = image_path_obj.stem
    parts = image_name.split("_")
    target_subject = int(parts[0]) - 1
    target_impression = int(parts[1]) - 1
    target_id = Identifier(target_subject, target_impression)
    
    # Find matching image index
    all_ids = list(image_loader.ids)
    matching_idx = None
    for i, img_id in enumerate(all_ids):
        if img_id.subject == target_id.subject and img_id.impression == target_id.impression:
            matching_idx = i
            break
    
    if matching_idx is None:
        print(f"Warning: Could not find {target_id} in loaded IDs")
        matching_idx = 0
    
    # Create dataset with all IDs (IdentifierSet) and extract
    image_dataset = Dataset(image_loader, image_loader.ids)
    texture_embeddings, minutia_embeddings = extractor.extract(image_dataset)
    
    # Combine first (while still EmbeddingLoader objects)
    combined = EmbeddingLoader.combine(texture_embeddings, minutia_embeddings)
    
    # Convert to numpy and filter to get only the matching image's embedding
    if hasattr(combined, 'numpy'):
        embeddings = combined.numpy()
    elif isinstance(combined, np.ndarray):
        embeddings = combined
    else:
        embeddings = np.array(combined)
    
    embeddings = embeddings[matching_idx:matching_idx+1]
    
    # Ensure 2D shape
    if embeddings.ndim == 1:
        embeddings = embeddings.reshape(1, -1)
    elif embeddings.ndim > 2:
        embeddings = embeddings.reshape(embeddings.shape[0], -1)
    
    return embeddings


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python extract_single_fingerprint.py <image.png>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    embeddings = extract_embeddings(image_path)
    
    print(embeddings[0])
    
    # Save embeddings to text file
    output_file = Path(image_path).stem + "_embeddings.txt"
    np.savetxt(output_file, embeddings[0], fmt="%.6f")
    print(f"\nEmbeddings saved to: {output_file}")
