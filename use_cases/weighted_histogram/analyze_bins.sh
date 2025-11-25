#!/bin/bash

# Read RESULT_ID from file
RESULT_ID=$(<result_id.txt)

# Run the Java command and store the output
OUTPUT=$(java -jar cs.jar amphora get-secret $RESULT_ID)

# Pass the output to Python for processing and plotting
python3 - <<EOF
import matplotlib.pyplot as plt
from datetime import datetime
import re

# Raw output from Bash
raw_output = """$OUTPUT"""

# Extract data using regex
counts = list(map(int, re.search(r"\[(.*?)\]", raw_output).group(1).split(',')))
creation_date_ms = int(re.search(r"creation-date\s*->\s*(\d+)", raw_output).group(1))

# Define age bins
age_bins = ["0–20", "20–40", "40–60", "60–80", "80–100"]

# Format creation date
creation_date = datetime.fromtimestamp(creation_date_ms / 1000).strftime("%Y-%m-%d %H:%M:%S")

# Pretty print summary
print("📊 Age Distribution Summary\n")
for bin_label, count in zip(age_bins, counts):
    print(f"- {bin_label} years: {count} patients")
print(f"📅 Creation Date: {creation_date}\n")

# Plot the graph
plt.figure(figsize=(8, 5))
bars = plt.bar(age_bins, counts, color="#4C9F70")

for bar in bars:
    yval = bar.get_height()
    plt.text(bar.get_x() + bar.get_width()/2, yval + 0.5, yval, ha='center', va='bottom')

plt.title(f"Age Distribution of Patients\nCreated on {creation_date}")
plt.xlabel("Age Range")
plt.ylabel("Number of Patients")
plt.grid(axis='y', linestyle='--', alpha=0.6)
plt.tight_layout()
plt.show()
EOF

