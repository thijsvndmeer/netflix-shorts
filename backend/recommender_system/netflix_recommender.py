import pandas as pd
import h5py
import numpy as np


def restructure_features(input_file, output_file):
    #step 1
    with h5py.File(input_file, 'r') as f:
        with h5py.File(output_file, 'w') as new_file:
            for name, obj in f.items():
                new_group = new_file.create_group(name)
                for n2, o2 in obj.items():
                    if n2 != 'text_features':
                        new_file.copy(o2, new_group, name=n2)

    #step 2
    with h5py.File(output_file, 'r+') as f:
        current_vid = None
        datasets = []
        groups = []
        start = True
        video = None
        p = False
        weight = 0


        for name, obj in f.items():
            #check if the object is a group or a dataset (usefull for repeat sweeps)
            if isinstance(obj, h5py.Dataset):
                continue

            #step 1: get the name of the group, and thus, the video
            video = name.split('_')[1:-1]

            if len(video) > 1:
                video = ['_'.join(video)]
            video = video[0]


            #step 1.1: if this group is a new video, aggregate the datasets and remove the useless groups
            #step 1.2: Set the current video as the new current vid
            if video != current_vid:
                if start == False:
                    average_vector = np.mean([np.array(vec) for vec in datasets], axis=0)
                    weight = len(datasets)

                    if current_vid not in f:
                        dataset = f.create_dataset(current_vid, data=average_vector)
                        dataset.attrs['weight'] = weight

                    else:
                        dataset = f[current_vid]
                        weights = [dataset.attrs.get('weight'), weight]
                        new_average = np.average(np.array([dataset[:], average_vector]), axis=0, weights=weights)
                        dataset[...] = new_average
                        dataset.attrs['weight'] = sum(weights)



                    #deleting redundant groups containing the old data (which is now a duplicate)
                    for group in groups:
                        del f[group]

                    datasets = []
                    groups = []
                else: start = False
                current_vid = video




            #step 2: add the data and group to the variable
            for title, value in obj.items():
                datasets.append(value[:])
            groups.append(name)


        average_vector = np.mean([np.array(vec) for vec in datasets], axis=0)
        weight = len(datasets)

        if current_vid not in f:
            dataset = f.create_dataset(current_vid, data=average_vector)
            dataset.attrs['weight'] = weight

        else:
            dataset = f[current_vid]
            weights = [dataset.attrs.get('weight'), weight]
            new_average = np.average(np.array([dataset[:], average_vector]), axis=0, weights=weights)
            dataset[...] = new_average
            dataset.attrs['weight'] = sum(weights)

        for group in groups:
                del f[group]
