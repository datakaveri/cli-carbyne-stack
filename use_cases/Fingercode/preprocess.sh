#!/bin/bash

for file in *features.txt; do
	value=($(cat "$file"))
	values="${value[*]}"
	echo "$values" > "preprocessed_$file"
done
