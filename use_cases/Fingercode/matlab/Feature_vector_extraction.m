clc;
close all;
global immagine n_bands h_bands n_arcs h_radius h_lato n_sectors matrice num_disk


n_bands=5;
h_bands=20;
n_arcs=16;
h_radius=12;
h_lato=h_radius+(n_bands*h_bands*2)+16;
if mod(h_lato,2)==0
    h_lato=h_lato-1;
end
n_sectors=n_bands*n_arcs;
matrice=zeros(h_lato);
for ii=1:(h_lato*h_lato)
    matrice(ii)=whichsector(ii);
end
num_disk=8;
myDir = "../DB1_B/"
filepattern = fullfile(myDir, '*.tif');
files = dir(filepattern);
for k=1:length(files)
    baseFileName = files(k).name;
    fullFileName = fullfile(files(k).folder, baseFileName);
    if baseFileName~=0
        [img,map]=imread(strcat(fullFileName));
    else
        disp('Select a grayscale image');
    end
    if (any(baseFileName~=0) && (~isgray(img)))
        disp('Select a grayscale image');
    end
    
    immagine=double(img);
    
    if isa(img,'uint8')
        graylevmax=2^8-1;
    end
    if isa(img,'uint16')
        graylevmax=2^16-1;
    end
    if isa(img,'uint32')
        graylevmax=2^32-1;
    end
    fingerprint = immagine;
    
    N=h_lato;
    
    [BinarizedPrint,XofCenter,YofCenter]=centralizing(fingerprint,0);
    [CroppedPrint]=cropping(XofCenter,YofCenter,fingerprint);
    [NormalizedPrint,vector]=sector_norm(CroppedPrint,0);
    
    for (angle=0:1:num_disk-1)    
        gabor=gabor2d_sub(angle,num_disk);
        ComponentPrint=conv2fft(NormalizedPrint,gabor,'same');
        [disk,vector]=sector_norm(ComponentPrint,1);    
        finger_code1{angle+1}=vector(1:n_sectors);
    end
    
    
    img=imrotate(img,180/(num_disk*2));
    fingerprint=double(img);
    
    [BinarizedPrint,XofCenter,YofCenter]=centralizing(fingerprint,0);
    [CroppedPrint]=cropping(XofCenter,YofCenter,fingerprint);
    [NormalizedPrint,vector]=sector_norm(CroppedPrint,0);
    
    for (angle=0:1:num_disk-1)    
        gabor=gabor2d_sub(angle,num_disk);
        ComponentPrint=conv2fft(NormalizedPrint,gabor,'same');
        [disk,vector]=sector_norm(ComponentPrint,1);    
        finger_code2{angle+1}=vector(1:n_sectors);
    end
    % 1. Flatten the cell arrays
    flat_code1 = int64(round(cell2mat(finger_code1)*100));
    flat_code2 = int64(round(cell2mat(finger_code2)*100));
    combined_features = [flat_code1, flat_code2];
    disp(size(flat_code1))
    % 3. Extract the name only (e.g., 'fingerprint1') from the filename
    [~, nameOnly, ~] = fileparts(baseFileName);
    uniqueFileName = ['extracted_features/',nameOnly, '_features.txt'];

    % 4. Save to the text file
    fileID = fopen(uniqueFileName, 'w');
    fprintf(fileID, '%d\n', combined_features);
    fclose(fileID);

    fprintf('Saved features to: %s\n', uniqueFileName);
    
   
end

