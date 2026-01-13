# Secure IRIS Classification using MP-SPDZ

This project implements a 2-layer fully-secure MLP classifier for the IRIS dataset using fixed-point MPC in MP-SPDZ.  
All inference is computed securely under MPC, and only the final predicted class is revealed.

## Overview

The program:

- Loads a hardcoded, quantized 2-layer neural network (MLP).
- Listens on a socket and securely receives a 4-dimensional IRIS feature vector (scaled integers).
- Performs a secure forward pass using fixed-point arithmetic (`sfix`).
- Computes the predicted class using a fully secure argmax.
- Reveals only the final prediction and sends it back to the client.

