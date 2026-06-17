import { useState, useEffect, useRef } from 'react'
import { useCookies } from 'react-cookie'

// localStorage helpers
const lsGet = (key, fallback) => {
  try {
    const val = localStorage.getItem(key)
    return val ? JSON.parse(val) : fallback
  } catch { return fallback }
}
const lsSet = (key, val) => localStorage.setItem(key, JSON.stringify(val))

function App() {
  const [video, setVideo] = useState(null)
  const [liked, setLiked] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [watchedVideos, setWatchedVideos] = useState(() => lsGet('watchedVideos', []))
  const [watchTimes, setWatchTimes] = useState(() => lsGet('watchTimes', {}))
  const lastScrollTime = useRef(0)

  const [cookies, setCookie] = useCookies(['likedVideos'])

  const getLiked = () => cookies.likedVideos || []

  const recordWatch = (ytId) => {
    setWatchedVideos(prev => {
      if (prev.includes(ytId)) return prev
      const next = [...prev, ytId]
      lsSet('watchedVideos', next)
      return next
    })
    setWatchTimes(prev => {
      if (prev[ytId]) return prev
      const next = { ...prev, [ytId]: new Date().toISOString() }
      lsSet('watchTimes', next)
      return next
    })
  }

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
        // Check if this video is liked via cookie
        const likedList = getLiked()
        setLiked(likedList.includes(data.yt_id))
        // Record this video as watched + timestamp
        recordWatch(data.yt_id)
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
    const likedList = getLiked()
    let nextLiked
    if (likedList.includes(video.yt_id)) {
      // Remove from liked
      nextLiked = likedList.filter(id => id !== video.yt_id)
      setLiked(false)
    } else {
      // Add to liked
      nextLiked = [...likedList, video.yt_id]
      setLiked(true)
    }
    setCookie('likedVideos', nextLiked)
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
            <button 
              onClick={() => setShowHistory(!showHistory)} 
              style={{ fontSize: '18px', padding: '10px 20px', margin: '5px', cursor: 'pointer' }}
            >
              {showHistory ? 'Hide History ✕' : 'History 📜'}
            </button>
          </div>
          <p style={{ color: '#888', fontSize: '12px' }}>Tip: Scroll down with mouse wheel to load next video</p>

          {showHistory && (
            <div style={{ marginTop: '15px', textAlign: 'left', maxWidth: '400px', margin: '15px auto 0' }}>
              <h3>Watch History</h3>
              {watchedVideos.length === 0 ? (
                <p style={{ color: '#888' }}>No videos watched yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {watchedVideos.map(ytId => {
                    const isLiked = getLiked().includes(ytId)
                    return (
                      <li key={ytId} style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
                        <span>{ytId}</span>
                        {isLiked && <span style={{ marginLeft: '8px' }}>❤️</span>}
                        {watchTimes[ytId] && (
                          <span style={{ color: '#888', fontSize: '12px', marginLeft: '8px' }}>
                            {new Date(watchTimes[ytId]).toLocaleString()}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
