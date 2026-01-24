#!/usr/bin/env python3
"""
Extract DeepPrint embeddings from all fingerprint images in a directory.
Processes all images in DB2_B folder and saves embeddings to a separate output folder.
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
from flx.data.transformed_image_loader import TransformedImageLoader
from flx.image_processing.binarization import LazilyAllocatedBinarizer
from flx.data.image_helpers import pad_and_resize_to_deepprint_input_size
from flx.data.embedding_loader import EmbeddingLoader


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


def extract_embeddings_batch(input_dir: str, output_dir: str):
    """
    Extract DeepPrint embeddings from all fingerprint images in input_dir.
    Saves embeddings to output_dir.
    
    Args:
        input_dir: Directory containing fingerprint images (.tif files)
        output_dir: Directory where embeddings will be saved
    """
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Load model once (more efficient for batch processing)
    model_path = os.path.abspath(".") if os.path.exists("best_model.pyt") else os.path.abspath("example-model")
    extractor = get_DeepPrint_TexMinu(num_training_subjects=8000, num_dims=256)
    extractor.load_best_model(model_path)
    print(f"Model loaded from: {model_path}")
    
    # Get all image files from input directory
    input_path = Path(input_dir)
    image_files = sorted(input_path.glob("*.tif")) + sorted(input_path.glob("*.tiff")) + \
                  sorted(input_path.glob("*.png"))
    
    if not image_files:
        print(f"No image files found in {input_dir}")
        return
    
    print(f"Found {len(image_files)} image files to process")
    
    # Set up image loader for the input directory
    # Determine file extension from first file
    first_ext = image_files[0].suffix.lower()
    if first_ext == ".tif" or first_ext == ".tiff":
        base_loader = TifLoader(str(input_path))
        transforms = [LazilyAllocatedBinarizer(5.0), pad_and_resize_to_deepprint_input_size]
    else:
        base_loader = SFingeLoader(str(input_path))
        transforms = [LazilyAllocatedBinarizer(5.0), pad_and_resize_to_deepprint_input_size]
    
    image_loader = TransformedImageLoader(
        images=base_loader,
        poses=None,
        transforms=transforms,
    )
    
    # Get all identifiers from the loader
    all_ids = list(image_loader.ids)
    print(f"Loaded {len(all_ids)} images from directory")
    
    # Create dataset and extract all embeddings at once (more efficient)
    image_dataset = Dataset(image_loader, image_loader.ids)
    print("Extracting embeddings...")
    texture_embeddings, minutia_embeddings = extractor.extract(image_dataset)
    
    # Combine embeddings
    combined = EmbeddingLoader.combine(texture_embeddings, minutia_embeddings)
    
    # Convert to numpy
    if hasattr(combined, 'numpy'):
        all_embeddings = combined.numpy()
    elif isinstance(combined, np.ndarray):
        all_embeddings = combined
    else:
        all_embeddings = np.array(combined)
    
    # Ensure 2D shape
    if all_embeddings.ndim == 1:
        all_embeddings = all_embeddings.reshape(1, -1)
    elif all_embeddings.ndim > 2:
        all_embeddings = all_embeddings.reshape(all_embeddings.shape[0], -1)
    
    # Create a mapping from Identifier to index for quick lookup
    id_to_idx = {}
    for idx, img_id in enumerate(all_ids):
        id_to_idx[(img_id.subject, img_id.impression)] = idx
    
    # Process each image file and save its embedding
    successful = 0
    failed = 0
    
    for image_file in image_files:
        try:
            # Parse identifier from filename (e.g., "101_3.tif" -> Identifier(100, 2))
            image_name = image_file.stem
            parts = image_name.split("_")
            if len(parts) < 2:
                print(f"Warning: Skipping {image_file.name} - invalid filename format")
                failed += 1
                continue
            
            target_subject = int(parts[0]) - 1
            target_impression = int(parts[1]) - 1
            target_id = Identifier(target_subject, target_impression)
            
            # Find matching index
            key = (target_id.subject, target_id.impression)
            if key not in id_to_idx:
                print(f"Warning: Could not find {target_id} in loaded IDs for {image_file.name}")
                failed += 1
                continue
            
            matching_idx = id_to_idx[key]
            
            # Get embedding for this image
            embedding = all_embeddings[matching_idx]
            
            # Save embedding to output directory
            output_file = output_path / f"{image_name}_embeddings.txt"
            np.savetxt(output_file, embedding, fmt="%.6f")
            
            successful += 1
            if successful % 10 == 0:
                print(f"Processed {successful} images...")
                
        except Exception as e:
            print(f"Error processing {image_file.name}: {e}")
            failed += 1
            continue
    
    print(f"\nBatch processing complete!")
    print(f"Successfully processed: {successful} images")
    print(f"Failed: {failed} images")
    print(f"Embeddings saved to: {output_dir}")


if __name__ == "__main__":
    import sys
    
    # Default to DB2_B if no argument provided
    if len(sys.argv) < 2:
        input_directory = "DB2_B"
    else:
        input_directory = sys.argv[1]
    
    # Default output directory
    if len(sys.argv) < 3:
        output_directory = "DB2_B_embeddings"
    else:
        output_directory = sys.argv[2]
    
    if not os.path.exists(input_directory):
        print(f"Error: Input directory '{input_directory}' does not exist")
        sys.exit(1)
    
    extract_embeddings_batch(input_directory, output_directory)
