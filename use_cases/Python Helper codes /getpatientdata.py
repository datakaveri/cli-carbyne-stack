import random
import pandas as pd

# sample data
first = ["Arjun", "Krishna", "Reyansh", "Sai", "Aarav", "Vivaan", "Aditya", "Kabir", "Ishaan", "Rohan", "Om", "Yuvaan", "Atharv"]
last = ["Patel", "Singh", "Sharma", "Iyer", "Kumar", "Reddy", "Das", "Bose", "Ghosh", "Pandey", "Joshi", "Mehta"]
states = ["Maharashtra", "Karnataka", "Tamil Nadu", "Uttar Pradesh", "Gujarat", "Delhi", "Punjab", "Rajasthan"]
cities = ["Mumbai", "Pune", "Chennai", "Bangalore", "Lucknow", "Ahmedabad", "Delhi", "Jaipur"]
streets = ["MG Road", "Ring Road", "Station Road", "Brigade Road", "Park Street", "College Road"]
insurance_companies = ["Star Health", "Religare", "Max Bupa", "SBI Health", "HDFC Ergo", "ICICI Lombard"]

def random_address():
    return f"{random.randint(1,999)} {random.choice(streets)}, {random.choice(cities)}, {random.choice(states)}"

patients = []
output_values = []  # This will hold exactly 10,000 values

# Create 5,000 patients
for _ in range(5000):
    age = random.randint(1,100)
    label = random.randint(0,1)

    patients.append({
        "Name": f"{random.choice(first)} {random.choice(last)}",
        "Age": age,
        "Address": random_address(),
        "Has Pneumonia": bool(label),
        "Insurance Company": random.choice(insurance_companies)
    })

    # Add values to output in exact order
    output_values.append(age)
    output_values.append(label)

# Convert to DataFrame and save
df = pd.DataFrame(patients)
df.to_csv("patient_data_1_5000.csv", index=False)

# Save output values to .txt
with open("processed_output_5000.txt", "w") as f:
    f.write(" ".join(str(x) for x in output_values))

print("DONE!")
print("Length of output values:", len(output_values))  # should be 10000
