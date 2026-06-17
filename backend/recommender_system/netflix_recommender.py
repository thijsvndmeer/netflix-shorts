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

class recommender():
    def __init__(self, data_file, n: int = 5, k: int = 3, like_strenght: bool = 1.4, threshold: bool = 1.3, method: str = 'top'):
        self.n = n
        self.k = k
        self.like = like_strenght
        self.feature_file = data_file
        self.threshold = threshold
        print(f'recommender enabled with video embeddings from {self.feature_file}')

    def change_file(self, data_file):
        self.feature_file = data_file
        print(f'changed datafile to {self.feature_file}')

######################################################################################################################################################################################################################################################################################################################################################################################

    def recommend(self, user_data):
        #step 1: Construct sim_matrix based on user data
        sim_matrix = pd.DataFrame(columns=user_data['videos'])


        #loop over each column and calculate the similarity score.
        for column in sim_matrix:
            content = []
            index = []

            with h5py.File(self.feature_file, 'r') as f:
                feature_one = f[column][:]


                #calculate the cosine_sim between each video in the dataset  (include a random factor to maybe reduce compute if necessary)
                for video, obj in f.items():
                    #skips to the next video if it is in the user data, thereby insuring that a video is never recommende twice (can maybe be changed later idk)
                    if video in user_data['videos'].values:
                        continue
                    feature_two = obj[:]
                    cos_sim = np.dot(feature_one, feature_two) / (np.linalg.norm(feature_one) * np.linalg.norm(feature_two))
                    content.append(cos_sim)
                    index.append(video)


            sim_matrix[column] = content
            sim_matrix.index = index

        #step 2: find the k nearest neighbours for each video and vote
        recommend = pd.Series()

        for video, data in sim_matrix.iterrows():
            k_nearest = data.nlargest(self.k)
            video_value = sum([user_data.loc[user_data['videos'] == video, 'watched'].item() * (1 + ((self.like - 1)* user_data.loc[user_data['videos'] == video, 'liked'].item())) * k_nearest[video] for video in k_nearest.index]) / k_nearest.sum()

            if video_value > self.threshold: recommend[video] = video_value


        #step 3: randomly select videos to recommend
        return([video for video, value in recommend.nlargest(self.n).items()])

def user_example():
    data = {
    'videos': ['--Jiv5iYqT8', '-JhNO_E3aEE', '0AspXDFcGlw', '29YDqiuyaOU', 'Gh9kc9DiDnE'],
    'liked': [1, 0, 0, 0, 0],
    'watched': [0.8, 0.02, 0.05, 0.9, 1.9]
    }
    user_data = pd.DataFrame(data)
    return(user_data)
