#!/bin/bash

# Script to upload a single fingerprint embedding to amphora
# Usage: ./upload_single_embedding.sh <embeddings_file.txt> [variable_name]

# Check if input file is provided
if [ $# -lt 1 ]; then
    echo "Usage: $0 <embeddings_file.txt> [variable_name]"
    echo "Example: $0 101_3_embeddings.txt FINGERPRINT_ID"
    echo "If variable_name is not provided, defaults to FINGERPRINT_DATA_ID"
    exit 1
fi

# Input file with data (one number per line)
input_file="$1"

# Variable name for export (optional, defaults to FINGERPRINT_DATA_ID)
export_var="${2:-FINGERPRINT_DATA_ID}"

# Check if file exists
if [ ! -f "$input_file" ]; then
    echo "Error: File '$input_file' not found"
    exit 1
fi

# Read all values into an array
values=($(cat "$input_file"))

# ---- FIXED-POINT TRANSFORMATION (float → int) ----
# Scale floats by 1e6 so Amphora can parse them as BigInteger
scaled_values=()
for v in "${values[@]}"; do
    scaled=$(printf "%.0f" "$(echo "$v * 1000000" | bc -l)")
    scaled_values+=("$scaled")
done

# Join all scaled values into a single space-separated string
all_values="${scaled_values[*]}"
# --------------------------------------------------

# Construct the command
cmd="java -jar cs.jar amphora create-secret $all_values \
    -t fingerprint=fingerprint1 -t accessPolicy=carbynestack.def \
    -t authorizedPrograms=ephemeral-generic"

# Echo the command before running it
echo "Uploading embedding from: $input_file"
echo "Running: export $export_var=\$($cmd)"

# Actually run and export
export "$export_var=$($cmd)"

# Print the result
echo "$export_var: ${!export_var}"
