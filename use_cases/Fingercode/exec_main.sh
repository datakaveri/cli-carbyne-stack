#!/bin/bash
export PROBE_ID=$(cat probe_id.txt)
jar_path="../cs.jar"
echo "--- STEP 2: DATABASE UUIDS ---"
java -jar "$jar_path" amphora get-secrets > all_secrets.txt
mapfile -t db_uuids < <(grep -Eo '([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})' all_secrets.txt | grep -v "$PROBE_ID")

db_count=${#db_uuids[@]}
echo "Found $db_count secrets in the database (excluding probe)."

if [[ $db_count -eq 0 ]]; then
    echo "WARNING: No database UUIDs found. Comparison might fail."
fi

echo "--- STEP 3: ARGUMENT BUILDING ---"
input_args=("-i" "$PROBE_ID")
for uuid in "${db_uuids[@]}"; do
    input_args+=("-i" "$uuid")
    echo "Added DB UUID to args: $uuid"
done

echo "Final input_args count: ${#input_args[@]} (including -i flags)"
echo "Input arguments: ${input_args[@]}"

echo "--- STEP 4: PARAMETERS & MATH ---"
feature_count=1280
half_count=640
total_elements=$(( (1 + db_count) * feature_count ))

echo "Feature Count: $feature_count"
echo "Half Count:    $half_count"
echo "Total expected elements in MPC: $total_elements"

echo "--- READY FOR EXECUTION ---"
# 5. Create the distance.mpc file
cat << EOF > distance.mpc
###THIS VERSION IS ONLY FOR 1-to-1 COMPARISON OF FINGERPRINTS FOR TESTING PURPOSE ONLY
port = regint(10000)
listen(port)
socket_id = regint()
acceptclientconnection(socket_id, port)

# Load the entire dataset
v = sint.read_from_socket(socket_id,$feature_count*2)

# Split the probe into its two constituent codes
# v[0:640] is fingercode1, v[640:1280] is fingercode2
probe1 = sint(v[0:640])
probe2 = sint(v[640:1280])
global min_dist,counter
min_dist = sint(8000000)
# Each DB entry also has two codes
db_f1 = sint(v[1280 : 1280 + 640])
db_f2 = sint(v[1280 + 640 : 1280 + 1280])
counter =0

@for_range($db_count)
def _(i):
    # Offset starts after the probe (index 1280, 2560, etc.)
    global counter, min_dist
    offset = (1+counter) * $feature_count
    counter = counter +1
    diff1 = probe1 - db_f1
    sqdiff1 = diff1*diff1
    fp1 = sum(sqdiff1)
    diff2 = probe2 - db_f2
    sqdiff2 = diff2*diff2
    fp2 = sum(sqdiff2)

    # Find the better match of the two
    local_min = (fp1 < fp2).if_else(fp1, fp2)

    # Update global minimum (min_dist is updated in-place as a register)
    
    min_dist = (local_min < min_dist).if_else(local_min, min_dist)


final_sfix =min_dist
resp = Array(1, sint)
resp[0] = sint(final_sfix)
sint.write_to_socket(socket_id,resp)
EOF

# 6. Execute
cat distance.mpc | java -jar "$jar_path" --debug ephemeral execute \
  -i $PROBE_ID \
  -i ${db_uuids[0]}\
  ephemeral-generic.default \
  | tail -n +2 \
  | sed 's/[][]//g'
