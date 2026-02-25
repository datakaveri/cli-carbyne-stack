#!/bin/bash

# Script to upload all fingerprint embeddings from DB2_B_embeddings folder to amphora
# Each embedding is uploaded with tag -t fingerprint=database
# Usage: ./upload_database_embeddings.sh [embeddings_dir] [output_file]

# Configuration
EMBEDDINGS_DIR="${1:-DB2_B_embeddings}"
OUTPUT_FILE="${2:-database_embedding_ids.txt}"
DELAY_BETWEEN_UPLOADS="${3:-1}"  # Delay in seconds between uploads (default: 1 second)

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Uploading Database Embeddings to Amphora ===${NC}"
echo -e "Processing one embedding at a time with ${DELAY_BETWEEN_UPLOADS}s delay between uploads"
echo ""

# Check if directory exists
if [ ! -d "$EMBEDDINGS_DIR" ]; then
    echo "Error: Directory '$EMBEDDINGS_DIR' not found"
    exit 1
fi

# Find all embedding files
embedding_files=($(find "$EMBEDDINGS_DIR" -name "*_embeddings.txt" | sort))

if [ ${#embedding_files[@]} -eq 0 ]; then
    echo "Error: No embedding files found in '$EMBEDDINGS_DIR'"
    echo "Expected files matching pattern: *_embeddings.txt"
    exit 1
fi

echo "Found ${#embedding_files[@]} embedding files to upload"
echo ""

# Create/clear output file
echo "# Database Embedding IDs - Generated on $(date)" > "$OUTPUT_FILE"
echo "# Format: filename:embedding_id" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Counter for progress
successful=0
failed=0
total=${#embedding_files[@]}
current=0

# Upload each embedding ONE AT A TIME to avoid buffer issues
for embedding_file in "${embedding_files[@]}"; do
    ((current++))
    filename=$(basename "$embedding_file")
    
    echo -e "${BLUE}[$current/$total]${NC} Processing: ${GREEN}$filename${NC}"
    
    # Read values one at a time to avoid buffer issues
    # Process the file line by line and scale immediately
    scaled_values=()
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines
        [ -z "$line" ] && continue
        
        # Scale the value immediately (no buffering)
        scaled=$(printf "%.0f" "$(echo "$line * 1000000" | bc -l)")
        scaled_values+=("$scaled")
    done < "$embedding_file"
    
    # Check if we got the expected number of values (512)
    if [ ${#scaled_values[@]} -ne 512 ]; then
        echo -e "  ${RED}✗${NC} Error: Expected 512 values, got ${#scaled_values[@]}"
        echo "# $filename: FAILED - Invalid value count" >> "$OUTPUT_FILE"
        ((failed++))
        echo ""
        continue
    fi
    
    # Join all scaled values into a single space-separated string
    # This is necessary for the command, but we've already processed them one by one
    all_values="${scaled_values[*]}"
    
    # Construct the command with database tag
    # Execute immediately without buffering
    cmd="java -jar cs.jar amphora create-secret $all_values \
        -t fingerprint=database -t accessPolicy=carbynestack.def \
        -t authorizedPrograms=ephemeral-generic"
    
    # Execute the command and capture the result immediately
    result=$($cmd 2>&1)
    exit_code=$?
    
    # Check if command was successful (result should be a UUID)
    if [ $exit_code -eq 0 ] && [[ $result =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
        echo -e "  ${GREEN}✓${NC} Uploaded successfully: $result"
        echo "$filename:$result" >> "$OUTPUT_FILE"
        ((successful++))
    else
        echo -e "  ${RED}✗${NC} Upload failed (exit code: $exit_code)"
        echo -e "  ${RED}  Error: $result${NC}"
        echo "# $filename: FAILED - $result" >> "$OUTPUT_FILE"
        ((failed++))
    fi
    
    # Clear the arrays to free memory before next iteration
    unset scaled_values
    unset all_values
    
    # Add delay between uploads to avoid overwhelming the server
    if [ $current -lt $total ] && [ "$DELAY_BETWEEN_UPLOADS" != "0" ]; then
        sleep "$DELAY_BETWEEN_UPLOADS"
    fi
    
    echo ""
done

# Summary
echo -e "${BLUE}=== Upload Summary ===${NC}"
echo -e "Total processed: $total"
echo -e "${GREEN}Successful: $successful${NC}"
if [ $failed -gt 0 ]; then
    echo -e "${RED}Failed: $failed${NC}"
fi
echo ""
echo "Embedding IDs saved to: $OUTPUT_FILE"
echo ""
echo "To use these IDs, you can source the file or read it programmatically:"
echo "  cat $OUTPUT_FILE"
echo ""
echo "Note: Each embedding was processed individually to avoid buffer issues."
