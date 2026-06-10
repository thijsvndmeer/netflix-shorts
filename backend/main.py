import os
import random
import csv
from fastapi import FastAPI, HTTPException

app = FastAPI()

# Bepaal het pad naar de map met je CSV-bestanden
CSV_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "datacsv"))
YT_CSV_PATH = os.path.join(CSV_DIR, "yt2imdb.csv")
IMDB_CSV_PATH = os.path.join(CSV_DIR, "imdb_metadata.csv")

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
                    "imdb_id": row.get("imdb_id", "")
                })
                
    return yt_data, imdb_titles

@app.get("/")
def home():
    return {"message": "Netflix Shorts Backend draait op localhost!"}

@app.get("/api/random-short")
def get_random_short():
    try:
        # Laad de data (YouTube lijst + IMDb titels dictionary)
        yt_data, imdb_titles = load_data()
    except FileNotFoundError as e:
        return {"error": str(e)}
    
    # Check of we daadwerkelijk YouTube IDs hebben
    if not yt_data:
        return {"error": "Geen YouTube IDs gevonden in het CSV-bestand."}
    
    # Kies een willekeurige video uit de lijst
    random_clip = random.choice(yt_data)
    yt_id = random_clip["yt_id"]
    imdb_id = random_clip["imdb_id"]
    
    # Zoek de titel op basis van de imdb_id (geef "Titel onbekend" terug als hij ontbreekt)
    movie_title = imdb_titles.get(imdb_id, "Titel onbekend")
    
    # Stuur alles netjes terug naar de frontend
    return {
        "yt_id": yt_id,
        "imdb_id": imdb_id,
        "title": movie_title
    }