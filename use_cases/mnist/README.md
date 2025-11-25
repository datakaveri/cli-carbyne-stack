# MNIST Use Case

This use case demonstrates inference on the MNIST dataset using Carbyne Stack.

## Files included
- `mnist.mpc` — MPC logic for secure inference
- `generateinputimage.py` — Script to prepare input data
- `input.sh`- Script to run when you are running on Carbynestack

## Explanation

The generateinputimage.py is a python script that downloads the test images. Note that you already need to have downloaded the mnist dataset from kaggle in your system. You can refer to this link- https://www.kaggle.com/datasets/hojjatk/mnist-dataset. 

After running this you will have the input images, which can be copied to a text file named input.txt. The input.sh script actually generates a secret for the text file and then we can run it on carbynestack. 


## How to run

1. You have to compile the file using- 
```bash
./compile.py -F 64 mnist
```
2. After compilation, we need to run the Fake-Offline- 
```bash 
./Fake-Offline.x 2 
```
3. Run the online mode-
```bash 
./Player-Online.x -p 0 -N 2 mnist
```
and on a seperate terminal- 
```bash 
./Player-Online.x -p 1 -N 2 mnist
```