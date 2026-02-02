#!/bin/bash

# Configuration
input_dir="extracted_features_preprocessed"  # Change this to the actual folder path
jar_path="../cs.jar"

# Counter for the exported ID names (FP_ID_1, FP_ID_2, etc.)
count=1

echo "Scanning $input_dir for preprocessed files..."

# Loop through every file starting with 'preprocessed_' in that folder
for file in "$input_dir"/preprocessed_*_features.txt; do
    
    # Check if any files actually match the pattern
    [ -e "$file" ] || { echo "No preprocessed files found."; exit 1; }

    echo "Reading: $(basename "$file")"

    # 1. Flatten the file content into a space-separated string
    # This reads the file into an array and joins it back with spaces
    fp_array=($(cat "$file"))
    v_data="${fp_array[*]}"

    # 2. Run the Java command and capture the output (the ID)
    echo "Registering with Carbine Stack..."
    SECRET_ID=$(java -jar "$jar_path" amphora create-secret $v_data \
        -t fingerprint=database \
        -t accessPolicy=carbynestack.def \
        -t authorizedPrograms=ephemeral-generic)

    # 3. Export the ID as FP_ID_1, FP_ID_2, etc.
    export "FP_ID_$count"="$SECRET_ID"
    
    echo "Success! FP_ID_$count=$SECRET_ID"
    
    # Increment counter for the next file
    ((count++))
done

echo "------------------------------------------------"
echo "Processing complete. $((count-1)) secrets created."
