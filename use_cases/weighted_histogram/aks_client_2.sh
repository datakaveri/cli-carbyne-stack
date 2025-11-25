#!/bin/bash
python3 client2.py

# Input file with data (one number per line)
input_file="processed_output_2.txt"

# Read all values into an array
values=($(cat "$input_file"))

# Counter for naming export variables
counter=1

# Total number of values
total=${#values[@]}

# Loop over all values, 4 at a time
for ((i=0; i<total; i+=4)); do
    val1=${values[i]:-}
    val2=${values[i+1]:-}
    val3=${values[i+2]:-}
    val4=${values[i+3]:-}

    cmd="java -jar cs.jar amphora create-secret"
    [[ -n $val1 ]] && cmd+=" $val1"
    [[ -n $val2 ]] && cmd+=" $val2"
    [[ -n $val3 ]] && cmd+=" $val3"
    [[ -n $val4 ]] && cmd+=" $val4"
    cmd+=" -t hospital=Ramaiah"

    export_var="RAMAIAH_DATA_ID_$counter"

    # Echo the command before running it
    echo "Running: export $export_var=\$($cmd)"

    # Actually run and export
    export "$export_var=$($cmd)"
    echo "$export_var: ${!export_var}"

    ((counter++))
done

