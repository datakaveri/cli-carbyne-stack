#!/bin/bash

# Script to upload fingerprint embeddings to amphora
# Usage: ./upload_to_amphora.sh <embeddings_file.txt>

# Check if input file is provided
if [ $# -lt 1 ]; then
    echo "Usage: $0 <embeddings_file.txt>"
    echo "Example: $0 101_3_embeddings.txt"
    exit 1
fi

# Input file with data (one number per line)
input_file="$1"

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
cmd="java -jar cs.jar amphora create-secret $all_values -t fingerprint=fingerprint2 -t accessPolicy=carbynestack.def -t authorizedPrograms=ephemeral-generic"

# Name of the export variable
export_var="FINGERPRINT1_DATA_ID"

# Echo the command before running it
echo "Running: export $export_var=\$($cmd)"

# Actually run and export
export "$export_var=$($cmd)"

# Print the result
echo "$export_var: ${!export_var}"
