## Summary of all the files 

1. brain.py- prints the shape of all the weights and biases for both the convolution as well as the dense layers for the brain tumor model. 

2. brainsummary.py- this script will just print the summary of the brain tumor model. It will show the convolution layers, maxpool layers and everything possible. 

3. braintumorhugginface.py - This is the file, which accepts the hugging face link as an input and prints the entire summary as well as the layers and their parameters. 

4.  brainweight.py- This script loads a JPG image, converts it to RGB, resizes it to 150×150, and converts it into a NumPy array of shape (150,150,3). It then flattens the image into a 1D array of 67,500 pixel values and prints the list of raw 0–255 integers.

5.  brainweightsget.py- This script loads a Keras .h5 model file, extracts specific layer weights, flattens each weight tensor into a 1-D array of int64, and writes all weights sequentially into a single binary file (weights.bin). It also prints each layer’s name, shape, and number of elements written for verification.

6. getmnistinputimage.py - this script is for the mnist dataset, wherein we have already downloaded the test dataset from kaggle and then we are getting the 784 numbers as well as their labels from the test dataset. (v v imp script to get input for testing of mnist) 

7.  getpatientdata.py- This file is responsible for creating data being used for the histogram operation. Here, the age is being randomized from 1 to 100 and we have a list of names, city and other parameters that have to be selected randomly. We then prepare the csv file and the processed output file- which is used on carbynestack for generating the secret. 

8. mnist_dataset_trained.py- This script loads the HuggingFace MNIST MLP model, extracts all weights and biases from its state_dict, scales them by 
2^16 for sfix fixed-point representation, and flattens everything. It then saves all parameters as 64-bit integers into a single binary file (mnist_weights_all.bin).

9. mnist784.py- This python script generates the 784 values from an mnist image. Here we pass the image as an input and get the array of 784 numbers (28*28) as the output. 

10. mnistviasocket.py- this Python script is used for sending an mnist input via sockets. This is used when you have a mpc file and wnat to accept input via sockets, you can use this script to send an input. 

11. spacetoarray.py- A script that converts numbers seperated by spaces (required while giving an input on cabynestack) to an array and also prints its length. 

12. testmnist.py- This script loads a pretrained MNIST MLP model from Hugging Face and attaches forward hooks to extract activations from each layer during inference. It then takes a 28×28 pixel image (flattened), normalizes it, runs it through the network, and stores the intermediate outputs. Finally, it prints the activations of each layer and the predicted digit label.
