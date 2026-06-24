import os
import random
import csv
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

from recommender_system.netflix_recommender import recommender

app = FastAPI()

# CORS — allow dev frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
CSV_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "datacsv"))
YT_CSV_PATH = os.path.join(CSV_DIR, "yt2imdb.csv")
IMDB_CSV_PATH = os.path.join(CSV_DIR, "imdb_metadata.csv")
FEATURES_PATH = os.path.join(CSV_DIR, "shortend_features.h5")

# Init recommender singleton
rec = recommender(data_file=FEATURES_PATH, n=5, k=3, threshold=0.5)


def load_data():
    """Leest beide CSV-files en combineert de data."""
    if not os.path.exists(YT_CSV_PATH):
        raise FileNotFoundError(f"YouTube CSV niet gevonden op: {YT_CSV_PATH}")
    if not os.path.exists(IMDB_CSV_PATH):
        raise FileNotFoundError(f"IMDb metadata CSV niet gevonden op: {IMDB_CSV_PATH}")

    # 1. Laad de IMDb metadata in een dictionary (voor supersnel zoeken)
    imdb_titles = {}
    with open(IMDB_CSV_PATH, mode='r', encoding='utf-8') as meta_file:
        meta_reader = csv.DictReader(meta_file)
        for row in meta_reader:
            if row.get("imdb_id") and row.get("title"):
                imdb_titles[row["imdb_id"]] = row["title"]

    # 2. Laad de YouTube IDs en hun bijbehorende IMDb IDs in een lijst
    yt_data = []
    with open(YT_CSV_PATH, mode='r', encoding='utf-8') as yt_file:
        yt_reader = csv.DictReader(yt_file)
        for row in yt_reader:
            if row.get("yt_id"):
                yt_data.append({
                    "yt_id": row["yt_id"],
                    "imdb_id": row.get("imdb_id", ""),
                    "clip_length": row.get("clip_length", "")
                })
                
    return yt_data, imdb_titles

@app.get("/")
def home():
    return {"message": "Netflix Shorts Backend draait op localhost!"}

@app.get("/api/random-short")
def get_random_short(excluded: str = ""):
    try:
        # Laad de data (YouTube lijst + IMDb titels dictionary)
        yt_data, imdb_titles = load_data()
    except FileNotFoundError as e:
        return {"error": str(e)}
    
    # Check of we daadwerkelijk YouTube IDs hebben
    if not yt_data:
        return {"error": "Geen YouTube IDs gevonden in het CSV-bestand."}
    
    excluded_set = set(excluded.split(",")) if excluded else set()
    
    # Filter yt_data
    valid_clips = [clip for clip in yt_data if clip["yt_id"] not in excluded_set]
    if not valid_clips:
        # If the user has literally watched everything, just pick from all
        valid_clips = yt_data

    # Kies een willekeurige video uit de lijst
    random_clip = random.choice(valid_clips)
    yt_id = random_clip["yt_id"]
    imdb_id = random_clip["imdb_id"]
    clip_length = random_clip.get("clip_length", "")
    
    # Zoek de titel op basis van de imdb_id (geef "Titel onbekend" terug als hij ontbreekt)
    movie_title = imdb_titles.get(imdb_id, "Titel onbekend")
    
    # Stuur alles netjes terug naar de frontend
    return {
        "yt_id": yt_id,
        "imdb_id": imdb_id,
        "title": movie_title,
        "clip_length": float(clip_length) if clip_length else None
    }


# ─── Recommendation endpoint ────────────────────────────────────────

class RecommendRequest(BaseModel):
    videos: List[str]
    liked: List[int]
    watched: List[float]
    excluded: List[str] = []

@app.post("/api/recommend")
def get_recommendations(body: RecommendRequest):
    print(f"API recommend request: {body.videos}")
    import h5py
    # Filter out videos not in h5 file to avoid KeyError in recommender
    valid_videos = []
    valid_liked = []
    valid_watched = []
    try:
        with h5py.File(FEATURES_PATH, 'r') as f:
            for vid, lk, wt in zip(body.videos, body.liked, body.watched):
                if vid in f:
                    valid_videos.append(vid)
                    valid_liked.append(lk)
                    valid_watched.append(wt)
    except Exception as e:
        print(f"Error checking h5 file: {e}")

    print(f"API valid videos: {valid_videos}")
    if not valid_videos:
        print("API return empty recommendations (no valid videos)")
        return {"recommendations": [], "fallback": True}

    # Build DataFrame the recommender expects
    user_data = pd.DataFrame({
        "videos": valid_videos,
        "liked": valid_liked,
        "watched": valid_watched,
    })
    
    print("\n=== INPUT DATAFRAME ===")
    print(user_data.to_string())
    print(f"Excluded count: {len(body.excluded)}")
    print("=======================\n")

    # Load metadata first to filter candidate video IDs
    try:
        yt_data, imdb_titles = load_data()
    except FileNotFoundError as e:
        return {"error": str(e)}

    allowed_videos = {row["yt_id"] for row in yt_data}

    if body.excluded:
        for ex in body.excluded:
            allowed_videos.discard(ex)

    try:
        rec_ids = rec.recommend(user_data, allowed_videos=allowed_videos)
        print(f"API recommender output: {rec_ids}")
    except Exception as e:
        # Fallback: if recommendation fails (e.g. video not in h5 file), return empty
        print(f"Recommendation error: {e}")
        return {"recommendations": [], "fallback": True}

    # Build lookup from yt_id -> row data
    yt_lookup = {row["yt_id"]: row for row in yt_data}

    results = []
    for yt_id in rec_ids:
        row = yt_lookup.get(yt_id, {})
        imdb_id = row.get("imdb_id", "")
        clip_length = row.get("clip_length", "")
        title = imdb_titles.get(imdb_id, "Titel onbekend")
        results.append({
            "yt_id": yt_id,
            "imdb_id": imdb_id,
            "title": title,
            "clip_length": float(clip_length) if clip_length else None,
        })

    return {"recommendations": results, "fallback": False}