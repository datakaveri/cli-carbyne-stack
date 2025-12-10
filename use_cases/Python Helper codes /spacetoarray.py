# read a line of numbers separated by spaces
line = input("Enter numbers separated by spaces:\n")

# convert the line into a list of ints
arr = list(map(int, line.strip().split()))

# print the array and its length
print("Array:", arr)
print("Length:", len(arr))
