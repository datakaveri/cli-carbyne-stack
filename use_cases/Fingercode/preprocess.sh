#!/bin/bash

src_dir="DB1_B"

# Ensure we are looking inside the directory
for file in "$src_dir"/*features.txt; do
    # Check if files exist to avoid errors
    [ -e "$file" ] || continue

    # Read file contents into a single-line string
    value=($(cat "$file"))
    values="${value[*]}"
    
    # Extract only the filename (e.g., 'sample_features.txt') 
    # and remove the directory prefix ('DB1_B/')
    filename=$(basename "$file")
    
    # Create the new file directly in the parent directory
    echo "$values" > "extracted_features_preprocessed/preprocessed_$filename"
done
