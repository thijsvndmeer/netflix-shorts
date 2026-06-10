from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Netflix Shorts Backend draait op localhost!"}

@app.get("/api/shorts")
def get_shorts():
    return [
        {"id": 1, "title": "Leuke video 1", "url": "video1.mp4"},
        {"id": 2, "title": "Grappige short 2", "url": "video2.mp4"}
    ]