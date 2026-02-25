#!/bin/bash

# Script to compute cosine similarity between two fingerprint embeddings using MPC
# Usage: ./compute_cosine_similarity.sh <uuid1> <uuid2>
#   or: ./compute_cosine_similarity.sh (will prompt for UUIDs)

FINGERPRINT_SIZE=512

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

# Get UUIDs
get_uuids "$@"

# Total input length: 2 fingerprints * 512 elements each = 1024
input_length=$((2 * FINGERPRINT_SIZE))

echo "UUID1: $uuid1"
echo "UUID2: $uuid2"
echo "Total input length: $input_length"

# Create the cosine_similarity.mpc file
cat << EOF > cosine_similarity.mpc
# Prologue to read in the inputs
port = regint(10000)
listen(port)
socket_id = regint()
acceptclientconnection(socket_id, port)

# Read 1024 integer values (scaled embeddings)
v_sint = sint.read_from_socket(socket_id, 1024)

# Fixed-point scale (must match upload script)
SCALE = 1000000

# Split into two fingerprint arrays and SCALE DOWN
fingerprint1 = [sfix(v_sint[i]) / SCALE for i in range(512)]
fingerprint2 = [sfix(v_sint[i + 512]) / SCALE for i in range(512)]

# Compute dot product
# dot_prod = sfix(0)
# for i in range(512):
#     dot_prod += fingerprint1[i] * fingerprint2[i]

dot_prod = sfix.dot_product(fingerprint1, fingerprint2)


# Compute magnitude squared
magnitude1_squared = sfix(0)
for i in range(512):
    magnitude1_squared += fingerprint1[i] * fingerprint1[i]

magnitude2_squared = sfix(0)
for i in range(512):
    magnitude2_squared += fingerprint2[i] * fingerprint2[i]

denominator_squared = magnitude1_squared * magnitude2_squared

# cosine similarity squared
cosine_similarity_squared = (dot_prod * dot_prod) / denominator_squared

flag = cfix(0)

flag = cosine_similarity_squared.reveal()
# if cosine_similarity_squared.reveal() < cfix(0.3):
#     flag = sint(1)

# Return results
# resp = Array(4, sfix)
# resp[0] = dot_prod
# resp[1] = magnitude1_squared
# resp[2] = magnitude2_squared
# resp[3] = cosine_similarity_squared
# resp[4] = flag

ans = cosine_similarity_squared*sint(100)
ans = sint(ans)
sint.write_to_socket(socket_id, ans)
EOF

echo "Created cosine_similarity.mpc file"

# Build the -i arguments for the two UUIDs
input_args=("-i" "$uuid1" "-i" "$uuid2")

# Execute the ephemeral task
echo "Executing MPC computation..."
export RESULT_ID=$(cat cosine_similarity.mpc | java -jar cs.jar ephemeral execute \
  "${input_args[@]}" \
  ephemeral-generic.default \
  | tail -n +2 \
  | sed 's/[][]//g')

# Print the result ID
echo "Result ID: $RESULT_ID"
echo "$RESULT_ID" > result_id.txt

# Get and display the result
echo "Fetching cosine similarity result..."
java -jar cs.jar amphora get-secret $RESULT_ID

