# BRainTumor MP-SPDZ classification code 

This use case demonstrates inference on the BrainTumor dataset using Carbyne Stack.

## Files included
- `braintumor.mpc` — MPC logic for secure inference
- `braininput.py` — Script to prepare input data

## Explanation

The braininput.py is a python script that downloads the test images. Note that you already need to have downloaded thedataset from kaggle in your system. You can refer to this link- https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset

After downloading this image, you will have a flattened array of 150*150*3 as your input to be given for the code. 
