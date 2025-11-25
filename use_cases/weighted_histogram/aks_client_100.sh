#!/bin/bash
#python3 client1.py

# Input file with data (one number per line)
input_file="processed_output_1.txt"

# Read all values into an array
values=($(cat "$input_file"))

# Join all values into a single space-separated string
all_values="${values[*]}"

# Construct the command

cmd="java -jar cs.jar amphora create-secret $all_values -t hospital=Fortis -t accessPolicy=carbynestack.def -t authorizedPrograms=ephemeral-generic" 

# Name of the export variable
export_var="FORTIS_DATA_ID"

# Echo the command before running it
echo "Running: export $export_var=\$($cmd)"

# Actually run
$cmd
