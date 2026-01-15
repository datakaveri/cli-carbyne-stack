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
database_name = 'fp_data.json';
Dir = "C:\Users\samra\Downloads\DB1_B";
filepattern = fullfile(Dir,"*_2.tif");
files = dir(filepattern);
T = table('Size',[0 4], 'VariableNames',{'fp_number','fp_code1','fp_code2','file_name'}, 'VariableTypes',{'double','cell','cell','string'});
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
    disp(size(finger_code1)) % Displays contents of every cell
    if isempty(T)
        fp_number = 1;
    else
        fp_number = height(T) + 1; 
    end
    T(end+1, :) = {fp_number, {finger_code1}, {finger_code2}, baseFileName};
end
%% Creating and appending data to database
if exist(database_name, 'file') == 2
    Database= jsondecode(fileread(database_name));
    tableofdatabase=struct2table(Database, 'AsArray', true);
    T_combined = [tableofdatabase; T];
else
    T_combined = T;
end
final_struct = table2struct(T_combined, 'ToScalar', false); %
jsonStr = jsonencode(final_struct, 'PrettyPrint', true);
fid = fopen(database_name, 'w');
fprintf(fid, '%s', jsonStr);
fclose(fid);
