import pandas as pd 
def process_csv(input_file, output_file):
    # Read the CSV file
    df = pd.read_csv(input_file)
    
    # Extract age and pneumonia status (convert to 1/0)
    df['Has Pneumonia'] = df['Has Pneumonia'].astype(int)
    
    # Write output in the required format
    with open(output_file, 'w') as f:
        f.write(' '.join(f"{age} {status}" for age, status in zip(df['Age'], df['Has Pneumonia'])))

# Example usage
input_csv = "patient_data_3_50.csv"  # Replace with the actual filename
output_txt = "processed_output_3.txt"
process_csv(input_csv, output_txt)
print(f"Processed data saved to {output_txt}")
