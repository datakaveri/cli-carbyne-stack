\#!/bin/bash

probe_file="preprocessed_110_8_features.txt"

# Check if file exists before proceeding
if [[ ! -f "$probe_file" ]]; then
    echo "ERROR: Probe file '$probe_file' not found."
    exit 1
fi

v_probe=$(cat "${probe_file}")
v_probe="${v_probe[*]}"
echo "--- STEP 1: PROBE DATA ---"
echo "Loaded probe data from: $probe_file"

echo "Registering probe secret..."
export SECRET_ID=$(java -jar cs.jar amphora create-secret $v_probe -t fingerprint=database -t accessPolicy=carbynestack.def -t authorizedPrograms=ephemeral-generic)

if [[ -z "$SECRET_ID" ]]; then
    echo "ERROR: Failed to create secret (SECRET_ID is empty)."
    exit 1
fi

export PROBE_ID=$SECRET_ID
echo "PROBE_ID set to: $PROBE_ID"
echo "$PROBE_ID" > probe_id.txt
