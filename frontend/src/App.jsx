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

// Minimum watched videos before we try recommendations
const REC_THRESHOLD = 3

function App() {
  const [video, setVideo] = useState(null)
  const [liked, setLiked] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [isRecommended, setIsRecommended] = useState(false)
  const [recQueue, setRecQueue] = useState([])
  const [watchedVideos, setWatchedVideos] = useState(() => lsGet('watchedVideos', []))
  const [watchTimes, setWatchTimes] = useState(() => lsGet('watchTimes', {}))
  const [watchProgress, setWatchProgress] = useState(() => lsGet('watchProgress', {}))
  const lastScrollTime = useRef(0)
  const videoStartTime = useRef(null)
  const currentVideoRef = useRef(null)

  const [cookies, setCookie] = useCookies(['likedVideos'])

  const getLiked = () => cookies.likedVideos || []

  // Save % watched for the current video before switching
  const saveProgress = () => {
    const prev = currentVideoRef.current
    if (prev && prev.yt_id && videoStartTime.current) {
      const timeSpent = (Date.now() - videoStartTime.current) / 1000
      const clipLen = prev.clip_length
      if (clipLen && clipLen > 0) {
        const pct = Math.round((timeSpent / clipLen) * 100)
        setWatchProgress(old => {
          // Accumulate across watches
          const existing = old[prev.yt_id] || 0
          const best = existing + pct
          const next = { ...old, [prev.yt_id]: best }
          lsSet('watchProgress', next)
          return next
        })
      }
    }
  }

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

  // Build user_data payload for recommender
  const buildUserPayload = () => {
    const likedList = getLiked()
    const videos = watchedVideos.slice(-20) // Last 20 watched
    const likedFlags = videos.map(id => likedList.includes(id) ? 1 : 0)
    const watchedScores = videos.map(id => {
      const pct = watchProgress[id] || 50 // Default 50% if unknown
      return Math.min(pct / 100, 2.0)     // Normalize to 0-2 scale
    })
    return { videos, liked: likedFlags, watched: watchedScores }
  }

  // Fetch recommendations from backend
  const fetchRecommended = async () => {
    const payload = buildUserPayload()
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.recommendations && data.recommendations.length > 0) {
        return data.recommendations
      }
    } catch (err) {
      console.warn('Recommendation fetch failed, falling back to random:', err)
    }
    return null
  }

  const showVideo = (data, recommended) => {
    setVideo(data)
    currentVideoRef.current = data
    videoStartTime.current = Date.now()
    setIsRecommended(recommended)
    const likedList = getLiked()
    setLiked(likedList.includes(data.yt_id))
    recordWatch(data.yt_id)
  }

  const fetchNextVideo = async () => {
    saveProgress()
    setLoading(true)
    setError(null)

    try {
      // Try serving from recommendation queue first
      if (recQueue.length > 0) {
        const [next, ...rest] = recQueue
        setRecQueue(rest)
        showVideo(next, true)
        setLoading(false)
        return
      }

      // If enough history, try fetching new recommendations
      if (watchedVideos.length >= REC_THRESHOLD) {
        const recs = await fetchRecommended()
        if (recs && recs.length > 0) {
          const [first, ...rest] = recs
          setRecQueue(rest)
          showVideo(first, true)
          setLoading(false)
          return
        }
      }

      // Fallback to random
      const res = await fetch('/api/random-short')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        showVideo(data, false)
      }
    } catch (err) {
      setError('Failed to fetch video: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNextVideo()
    // Save progress when user leaves page
    const handleBeforeUnload = () => saveProgress()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  useEffect(() => {
    const handleWheel = (e) => {
      const now = Date.now()
      if (now - lastScrollTime.current > 1500) {
        if (e.deltaY > 50) {
          lastScrollTime.current = now
          fetchNextVideo()
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
          {isRecommended && (
            <span style={{
              display: 'inline-block',
              background: '#e50914',
              color: '#fff',
              padding: '2px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              marginBottom: '8px',
            }}>
              ✨ Recommended for you
            </span>
          )}
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
              onClick={fetchNextVideo} 
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
                    const pct = watchProgress[ytId]
                    return (
                      <li key={ytId} style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
                        <span>{ytId}</span>
                        {isLiked && <span style={{ marginLeft: '8px' }}>❤️</span>}
                        {pct != null && (
                          <span style={{ color: '#4a9', fontSize: '12px', marginLeft: '8px' }}>
                            {pct} watched
                          </span>
                        )}
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
