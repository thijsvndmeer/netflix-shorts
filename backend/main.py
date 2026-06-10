import os
import random
import csv
from fastapi import FastAPI, HTTPException

app = FastAPI()

# Bepaal het juiste pad naar je CSV-bestand
CSV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "datacsv", "yt2imdb.csv")
)

def load_youtube_ids():
    """Leest de CSV-file en geeft een lijst van yt_ids terug."""
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"CSV-bestand niet gevonden op: {CSV_PATH}")
    
    yt_ids = []
    with open(CSV_PATH, mode='r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            # Voeg de yt_id toe aan de lijst als deze bestaat
            if row.get("yt_id"):
                yt_ids.append(row["yt_id"])
    return yt_ids

@app.get("/")
def home():
    return {"message": "Netflix Shorts Backend draait op localhost!"}

@app.get("/api/random-short")
def get_random_short():
    try:
        # 1. Laad de YouTube IDs uit de CSV
        yt_ids = load_youtube_ids()
    except FileNotFoundError as e:
        return {"error": str(e)}
    
    # 2. Check of de CSV wel gevuld is
    if not yt_ids:
        return {"error": "Geen YouTube IDs gevonden in het CSV-bestand."}
    
    # 3. Kies een willekeurige YouTube ID
    random_yt_id = random.choice(yt_ids)
    
    # 4. Stuur de YouTube ID en de kant-en-klare YouTube URL terug
    return {
        "yt_id": random_yt_id,
        "video_url": f"https://www.youtube.com/watch?v={random_yt_id}"
    }