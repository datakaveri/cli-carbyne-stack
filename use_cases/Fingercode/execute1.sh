fp1=($(cat preprocessed_101_1_features.txt))
fp2=($(cat preprocessed_102_1_features.txt))
echo "loaded data"
v1="${fp1[*]}"
v2="${fp2[*]}"
echo "space seperated data"
SECRET_ID_1=$(java -jar cs.jar amphora create-secret $v1 -t fingerprint=database -t accessPolicy=carbynestack.def -t authorizedPrograms=ephemeral-generic)
SECRET_ID_2=$(java -jar cs.jar amphora create-secret $v2 -t fingerprint=database -t accessPolicy=carbynestack.def -t authorizedPrograms=ephemeral-generic)
echo "secret created"
export FP_ID_1=$SECRET_ID_1
export FP_ID_2=$SECRET_ID_2

echo "Secret 1 created with ID: $FP_ID_1"
echo "Secret 2 created with ID: $FP_ID_2"
