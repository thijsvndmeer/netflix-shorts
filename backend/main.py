import os
import random
from fastapi import FastAPI
from fastapi.responses import FileResponse

app = FastAPI()

# We hebben nu "movie_clips" toegevoegd aan het pad!
VIDEO_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "systeemproject_cmd", "movie_clips")
)

@app.get("/")
def home():
    return {"message": "Netflix Shorts Backend draait op localhost!"}

@app.get("/api/random-short")
def get_random_short():
    # 1. Controleer of de map überhaupt bestaat
    if not os.path.exists(VIDEO_DIR):
        return {"error": f"Map niet gevonden op pad: {VIDEO_DIR}"}
    
    # 2. Haal alle bestanden op uit de map die eindigen op een video-extensie (bijv. .mp4)
    video_extensions = (".mp4", ".mov", ".avi", ".mkv")
    all_videos = [f for f in os.listdir(VIDEO_DIR) if f.lower().endswith(video_extensions)]
    
    # 3. Check of er wel video's in de map staan
    if not all_videos:
        return {"error": "Geen video's gevonden in de map 'systeemproject_cmd'."}
    
    # 4. Kies een willekeurige video uit de lijst
    random_video = random.choice(all_videos)
    
    # 5. Stuur de naam van de video terug naar de frontend
    return {
        "video_name": random_video,
        "video_url": f"http://localhost:8000/api/stream/{random_video}"
    }

@app.get("/api/stream/{video_name}")
def stream_video(video_name: str):
    # Dit endpoint zorgt ervoor dat de video daadwerkelijk afgespeeld kan worden in de browser
    video_path = os.path.join(VIDEO_DIR, video_name)
    
    if os.path.exists(video_path):
        return FileResponse(video_path, media_type="video/mp4")
    return {"error": "Video bestand niet gevonden."}