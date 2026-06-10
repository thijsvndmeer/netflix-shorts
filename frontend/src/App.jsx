import { useState, useEffect, useRef } from 'react'

function App() {
  const [video, setVideo] = useState(null)
  const [liked, setLiked] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const lastScrollTime = useRef(0)

  const fetchRandomShort = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/random-short')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setVideo(data)
        const isLiked = localStorage.getItem(`like_${data.yt_id}`) === 'true'
        setLiked(isLiked)
      }
    } catch (err) {
      setError('Failed to fetch video: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRandomShort()
  }, [])

  useEffect(() => {
    const handleWheel = (e) => {
      const now = Date.now()
      if (now - lastScrollTime.current > 1500) {
        if (e.deltaY > 50) {
          lastScrollTime.current = now
          fetchRandomShort()
        }
      }
    }
    window.addEventListener('wheel', handleWheel)
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  const toggleLike = () => {
    if (!video) return
    const nextLiked = !liked
    setLiked(nextLiked)
    localStorage.setItem(`like_${video.yt_id}`, String(nextLiked))
  }

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h1>Netflix Shorts</h1>
      
      {loading && <p>Loading next video...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {video && (
        <div>
          <h3>Playing: {video.title}</h3>
          <iframe
            key={video.yt_id}
            src={`https://www.youtube.com/embed/${video.yt_id}?autoplay=1&mute=1&loop=1&playlist=${video.yt_id}&playsinline=1`}
            title={video.title}
            style={{ width: '300px', height: '530px', display: 'block', margin: '10px auto', background: '#222', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
          <div>
            <button 
              onClick={toggleLike} 
              style={{ fontSize: '18px', padding: '10px 20px', margin: '5px', cursor: 'pointer' }}
            >
              {liked ? 'Liked ❤️' : 'Like 🤍'}
            </button>
            <button 
              onClick={fetchRandomShort} 
              style={{ fontSize: '18px', padding: '10px 20px', margin: '5px', cursor: 'pointer' }}
            >
              Scroll / Next Video ➡️
            </button>
          </div>
          <p style={{ color: '#888', fontSize: '12px' }}>Tip: Scroll down with mouse wheel to load next video</p>
        </div>
      )}
    </div>
  )
}

export default App
