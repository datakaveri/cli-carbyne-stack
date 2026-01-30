
# Biometric Feature Processing & Registration Pipeline

This repository contains a pipeline for preparing biometric feature data, registering it as secrets and calculating euclidean distance between each feature to find a match in the database in a **Carbynestack** MPC (Multi-Party Computation) environment.

----------

## Prerequisites

Before running the pipeline, make sure you have:

-   MATLAB
    
-   Bash shell (Linux / macOS recommended)

-   A deployed Carbynestack
    
-   Proper permissions to upload secrets and feature vectors

-   Extract `DB1_B.zip`
    

----------


## Directory Structure

    `FingerCode/
    ├── matlab/
    │ └── extract_features.m
    ├── Probe_feature_vector/
    │   └── preprocess_*_features.txt
    ├── extracted_features_preprocessed/
    │   └── preprocess_*_features.txt
    ├── DB1_B/
    │   └── *.tif
    └── README.md`

----------

## Step 1: Generate Feature Vectors Using MATLAB

Run the MATLAB script to extract feature vectors from the input data.

1.  Open MATLAB.
    
2.  Navigate to the `matlab/` directory.
    
3.  Run:
    

`Feature_vector_extraction.m` (You can change the file_name expression w.r.t your database file names)

**Inputs:**

-   Raw input data located in `DB1_B/`
    

**Outputs:**

-   Feature vectors saved to `DB1_B/`


----------

## Step 2: Run Bash Preprocessing Script

**NOTE:** In each script, Change the update the "jar_path" with the path of your cs.jar file.

Preprocess the generated feature vectors and prepare them for upload.

From the project root, run:

`./preprocess.sh` 

**Inputs:**

-   Feature vectors from `DB1_B/`
    

**Outputs:**

-   Preprocessed data saved to `extracted_features_preprocessed/`
    

----------

## Step 3: Upload Secrets to CarbyneStack

Upload required secrets to the Carbyne stack.

Run:

`./execute1.sh` 

----------

## Step 4: Upload Probe Feature Vector

Upload the probe feature vector that will be used for matching or inference.

Run:

`./execute2.sh` 

**Inputs:**

-   Probe feature vector located in `Probe_feature_vector/`
    

**Outputs:**

-   Probe vector registered in the Carbyne stack
    

----------

## Step 5: Run Main Computation Script

Execute the main computation or matching pipeline.

Run:

`./exec_main.sh` 

**Outputs:**

-   Final result's UUID is displayed and can be revealed using `java -jar cs.jar amphora get-secret <UUID>`
    

----------

## Troubleshooting

-   **MATLAB errors:** Verify toolbox versions and input paths. If the issue persist, update the `userpath` to your `matlab/` folder.
    
-   **Permission issues:** Check execution permissions for bash scripts:
    
    `chmod +x scripts/*.sh` 
    
-   **Upload failures:** Confirm secrets are correctly uploaded and accessible.

-   **Directory location issues:** Cross-check the locations of directories hardcoded in the bashscript.
    

----------

## Notes

-   Steps must be run **in order**.
    
-   Re-running Step 3 is only required if secrets change.

-   Re-running Step 4 can lead to increase and database size and eventually leading to incorrect results.
    
-   Feature vectors must be regenerated if raw data changes.
    

----------

