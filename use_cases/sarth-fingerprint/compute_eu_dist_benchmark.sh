#!/bin/bash

# Script to run cosine similarity N times for benchmarking
# Usage: ./compute_cosine_similarity_benchmark.sh [N] [uuid1] [uuid2]
#   N = number of runs (default: 5). If first arg is a number, it's N; rest are UUIDs.

FINGERPRINT_SIZE=512

# Parse N: if first argument is a number, use it and shift
if [[ "$1" =~ ^[0-9]+$ ]]; then
    N=$1
    shift
else
    N=5
fi

# Function to get UUIDs if not provided
get_uuids() {
    if [ $# -lt 2 ]; then
        echo "Getting all secrets from amphora..."
        java -jar cs.jar amphora get-secrets > input.txt
        
        echo "Available secrets:"
        mapfile -t uuids < <(grep -Eo '([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})' input.txt)
        
        if [ ${#uuids[@]} -lt 2 ]; then
            echo "Error: Need at least 2 secrets in amphora"
            exit 1
        fi
        
        echo "Found ${#uuids[@]} secrets"
        echo "Using first two UUIDs:"
        echo "  UUID1: ${uuids[0]}"
        echo "  UUID2: ${uuids[1]}"
        
        uuid1="${uuids[0]}"
        uuid2="${uuids[1]}"
    else
        uuid1="$1"
        uuid2="$2"
    fi
}

# Get UUIDs (once, same for all runs)
get_uuids "$@"

# Total input length: 2 fingerprints * 512 elements each = 1024
input_length=$((2 * FINGERPRINT_SIZE))

echo "UUID1: $uuid1"
echo "UUID2: $uuid2"
echo "Total input length: $input_length"
echo "Running $N times for benchmark."
echo ""

# Create the eu_distance.mpc file (with N repetitions inside MPC)
# All calculations in sint only (no sfix) to avoid tuple usage - see MP-SPDZ High-Level Interface
cat << EOF > eu_distance.mpc
# Prologue to read in the inputs
port = regint(10000)
listen(port)
socket_id = regint()
acceptclientconnection(socket_id, port)

# Read 1024 integer values (scaled embeddings; client uses SCALE=1000000)
v_sint = sint.read_from_socket(socket_id, 1024)

# Keep as sint arrays (no sfix conversion)
fingerprint1 = [v_sint[i] for i in range(512)]
fingerprint2 = [v_sint[i + 512] for i in range(512)]

# Initialize result BEFORE the loop
sum_sq = sint(0)

@for_range($N)
def _(bench_i):
    global sum_sq  # Need to declare global for modification
    
    # Compute euclidean distance
    temp_sum = sint(0)
    for i in range(512):
        diff = fingerprint1[i] - fingerprint2[i]
        temp_sum += diff * diff
    
    sum_sq = temp_sum  # Update result

ans = sum_sq
sint.write_to_socket(socket_id, ans)
EOF

echo "Created cosine_similarity.mpc file"

# Build the -i arguments for the two UUIDs
input_args=("-i" "$uuid1" "-i" "$uuid2")

# Execute the ephemeral task once (MPC code runs cosine similarity N times internally)
echo "Executing MPC computation ($N iterations inside .mpc)..."
start_time=$(date +%s%N)

export RESULT_ID=$(cat eu_distance.mpc | java -jar cs.jar ephemeral execute \
  "${input_args[@]}" \
  ephemeral-generic.default \
  | tail -n +2 \
  | sed 's/[][]//g')

end_time=$(date +%s%N)
elapsed_ms=$(( (end_time - start_time) / 1000000 ))
echo "Total time taken: ${elapsed_ms}ms"

# Print the result ID
echo "Result ID: $RESULT_ID"
echo "$RESULT_ID" > result_id.txt

# Get and display the result
echo "Fetching cosine similarity result..."
#java -jar cs.jar amphora get-secret $RESULT_ID
