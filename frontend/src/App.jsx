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
  const [watchProgress, setWatchProgress] = useState(() => lsGet('watchProgress', {}))
  const [isRecommended, setIsRecommended] = useState(false)
  const [recQueue, setRecQueue] = useState([])
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const iframeRef = useRef(null)
  const lastScrollTime = useRef(0)
  const videoStartTime = useRef(null)
  const currentVideoRef = useRef(null)
  const fetchNextVideoRef = useRef(null)
  const touchStartX = useRef(null)
  const REC_THRESHOLD = 5

  const triggerImdbSwipe = (direction) => {
    const videoInfo = currentVideoRef.current;
    if (!videoInfo || !videoInfo.imdb_id) return;
    setIsAnimating(true);
    setSwipeOffset(direction * 400);
    setTimeout(() => {
      window.open(`https://www.imdb.com/title/${videoInfo.imdb_id}`, '_blank');
      setSwipeOffset(0);
      setIsAnimating(false);
    }, 300);
  }

  const handleTap = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      if (isPlaying) {
        iframeRef.current.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        setIsPlaying(false);
      } else {
        iframeRef.current.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        setIsPlaying(true);
      }
    }
  }

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

  const fetchRecommended = async () => {
    // Only take the last 20 videos to avoid sending huge payloads
    const recentVideos = watchedVideos.slice(-20)
    const likedList = getLiked()
    
    const payload = {
      videos: [],
      liked: [],
      watched: [],
      excluded: watchedVideos // Provide entire watch history to exclude
    }
    
    recentVideos.forEach(ytId => {
      payload.videos.push(ytId)
      payload.liked.push(likedList.includes(ytId) ? 1 : 0)
      const pct = watchProgress[ytId] || 0
      payload.watched.push(pct / 100.0) // Normalize 0-100
    })

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
    if (loading) return // Prevent multiple concurrent fetches if scrolled rapidly
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
      const excludedQuery = watchedVideos.join(',')
      const res = await fetch(`/api/random-short?excluded=${encodeURIComponent(excludedQuery)}`)
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
    fetchNextVideoRef.current = fetchNextVideo
  }, [fetchNextVideo])

  useEffect(() => {
    const handleWheel = (e) => {
      const now = Date.now()
      if (now - lastScrollTime.current > 1500) {
        if (e.deltaY > 50) {
          lastScrollTime.current = now
          if (fetchNextVideoRef.current) {
            fetchNextVideoRef.current()
          }
        } else if (Math.abs(e.deltaX) > 50) {
          lastScrollTime.current = now
          triggerImdbSwipe(Math.sign(e.deltaX))
        }
      }
    }
    window.addEventListener('wheel', handleWheel)
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.origin === 'https://www.youtube.com') {
        try {
          const data = JSON.parse(e.data);
          if (data.event === 'infoDelivery' && data.info && data.info.playerState !== undefined) {
             setIsPlaying(data.info.playerState === 1 || data.info.playerState === 3);
          }
        } catch (err) {}
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
    <div style={{ textAlign: 'center', padding: '10px 20px', backgroundColor: '#141414', color: '#fff', height: '100vh', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#e50914', margin: '0 0 10px 0', fontSize: '24px', fontWeight: '800', flexShrink: 0 }}>Netflix Shorts</h1>
      
      {loading && <p>Loading next video...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {video && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ flexShrink: 0 }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>Playing: {video.title}</h3>
            {isRecommended && (
              <span style={{
                display: 'inline-block',
                background: '#e50914',
                color: '#fff',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '5px',
                boxShadow: '0 4px 12px rgba(229, 9, 20, 0.3)',
              }}>
                ✨ Recommended for you
              </span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '10px 0' }}>
            <div style={{ position: 'relative', height: '100%', maxHeight: '600px', maxWidth: '100%', aspectRatio: '9/16' }}>
              <div style={{
                position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f5c518',
              color: '#000',
              borderRadius: '16px',
              fontWeight: 'bold',
              fontSize: '24px',
              zIndex: 0,
              opacity: Math.min(Math.abs(swipeOffset) / 100, 1),
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
            }}>
              View on IMDB 🎬
            </div>
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                transform: `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.05}deg)`,
                transformOrigin: 'bottom center',
                transition: (swipeOffset === 0 || isAnimating) ? 'transform 0.3s ease' : 'none',
                touchAction: 'pan-y',
                zIndex: 1
              }}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
              onTouchMove={(e) => {
                if (touchStartX.current !== null) {
                  setSwipeOffset(e.touches[0].clientX - touchStartX.current)
                }
              }}
              onTouchEnd={(e) => {
                if (touchStartX.current === null) return
                const deltaX = e.changedTouches[0].clientX - touchStartX.current
                if (Math.abs(deltaX) > 100) {
                  triggerImdbSwipe(Math.sign(deltaX))
                } else if (Math.abs(deltaX) < 5) {
                  handleTap()
                  setSwipeOffset(0)
                } else {
                  setSwipeOffset(0)
                }
                touchStartX.current = null
              }}
              onMouseDown={(e) => { touchStartX.current = e.clientX }}
              onMouseMove={(e) => {
                if (touchStartX.current !== null) {
                  setSwipeOffset(e.clientX - touchStartX.current)
                }
              }}
              onMouseUp={(e) => {
                if (touchStartX.current === null) return
                const deltaX = e.clientX - touchStartX.current
                if (Math.abs(deltaX) > 100) {
                  triggerImdbSwipe(Math.sign(deltaX))
                } else if (Math.abs(deltaX) < 5) {
                  handleTap()
                  setSwipeOffset(0)
                } else {
                  setSwipeOffset(0)
                }
                touchStartX.current = null
              }}
              onMouseLeave={() => {
                setSwipeOffset(0)
                touchStartX.current = null
              }}
            >
              {!isPlaying && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 20 }}>
                  <div style={{ width: '80px', height: '80px', background: 'rgba(0,0,0,0.7)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: '40px', marginLeft: '6px' }}>▶</span>
                  </div>
                </div>
              )}
              <iframe
                ref={iframeRef}
                key={video.yt_id}
                src={`https://www.youtube.com/embed/${video.yt_id}?autoplay=1&mute=1&loop=1&playlist=${video.yt_id}&playsinline=1&enablejsapi=1&controls=0`}
                title={video.title}
                style={{ width: '100%', height: '100%', display: 'block', background: '#000', border: 'none', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', pointerEvents: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => {
                  if (iframeRef.current && iframeRef.current.contentWindow) {
                    iframeRef.current.contentWindow.postMessage('{"event":"listening","id":1}', '*');
                  }
                }}
              />
            </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'center', gap: '10px', margin: '10px 0' }}>
            <button 
              onClick={toggleLike} 
              style={{ fontSize: '16px', fontWeight: 'bold', padding: '12px 24px', cursor: 'pointer', borderRadius: '24px', border: 'none', background: liked ? '#e50914' : '#333', color: '#fff', transition: 'all 0.2s' }}
            >
              {liked ? 'Liked ❤️' : 'Like 🤍'}
            </button>
            <button 
              onClick={() => {
                if (video && video.imdb_id) {
                  window.open(`https://www.imdb.com/title/${video.imdb_id}`, '_blank')
                }
              }} 
              style={{ fontSize: '16px', fontWeight: 'bold', padding: '12px 24px', cursor: 'pointer', borderRadius: '24px', border: 'none', background: '#f5c518', color: '#000', transition: 'all 0.2s' }}
            >
              View on IMDB 🎬
            </button>
          </div>
          <p style={{ color: '#888', fontSize: '12px', flexShrink: 0, margin: '0 0 10px 0' }}>Tip: Scroll down with mouse wheel to load next video</p>

          {showHistory && (
            <div style={{ marginTop: '25px', textAlign: 'left', maxWidth: '400px', margin: '25px auto 0', background: '#1e1e1e', padding: '20px', borderRadius: '16px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Watch History</h3>
              {watchedVideos.length === 0 ? (
                <p style={{ color: '#888' }}>No videos watched yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {watchedVideos.map(ytId => {
                    const isLiked = getLiked().includes(ytId)
                    const pct = watchProgress[ytId]
                    return (
                      <li key={ytId} style={{ padding: '12px', marginBottom: '8px', background: '#2a2a2a', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: '500', fontSize: '14px' }}>{ytId}</span>
                          {isLiked && <span>❤️</span>}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
                          {pct != null && (
                            <span style={{ color: '#4a9' }}>{pct}% watched</span>
                          )}
                          {watchTimes[ytId] && (
                            <span>{new Date(watchTimes[ytId]).toLocaleDateString()}</span>
                          )}
                        </div>
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
