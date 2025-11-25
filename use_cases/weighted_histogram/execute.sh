#!/bin/bash

# Step 1: Get all secret UUIDs
java -jar cs.jar amphora get-secrets > input.txt

# Step 2: Read all UUIDs into an array
mapfile -t uuids < <(grep -Eo '([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})' input.txt)

# Step 3: Build the -i arguments for each UUID
input_args=()
for uuid in "${uuids[@]}"; do
  input_args+=("-i" "$uuid")
done

# Step 4: Calculate the total input length for the MPC program
count=${#uuids[@]}
input_length=$((count * 4))

echo "UUID count: $count"
echo "Total input length (4 * count): $input_length"

# Step 5: Create the binning.mpc file with dynamic input length
cat << EOF > binning.mpc
# Prologue to read in the inputs
port=regint(10000)
listen(port)
socket_id = regint()
acceptclientconnection(socket_id, port)
v = sint.read_from_socket(socket_id, $input_length)

# The logic
y = Array(5, sint)
z = Array(5, sint)
for i in range(5):
    for j in range(0, $input_length, 2):
        check = (0 + i*20 <= v[j]) 
        check2 = (v[j] < 20 + i*20)
        y[i] = y[i] + check*check2*v[j+1]

# Epilogue to return the outputs 
resp = Array(5, sint)
for i in range(5):
    resp[i] = y[i]

sint.write_to_socket(socket_id, resp)
EOF

# Step 6: Execute the ephemeral task using all -i arguments
export RESULT_ID=$(cat binning.mpc | java -jar cs.jar ephemeral execute \
  "${input_args[@]}" \
  ephemeral-generic.default \
  | tail -n +2 \
  | sed 's/[][]//g')

# Step 7: Print the result ID
echo "Result ID: $RESULT_ID"
echo "$RESULT_ID" > result_id.txt
java -jar cs.jar amphora get-secret $RESULT_ID
