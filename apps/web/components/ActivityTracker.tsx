'use client'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'

export default function ActivityTracker() {
  const { isAuthenticated, updateActivity } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) return

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

    // Throttle to avoid updating too frequently
    let lastUpdate = 0
    const handleActivity = () => {
      const now = Date.now()
      if (now - lastUpdate < 60000) return // update at most once per minute
      lastUpdate = now
      updateActivity()
    }

    // Check on mount if already expired
    updateActivity()

    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }))
    
    // Also check every 5 minutes in background
    const interval = setInterval(updateActivity, 5 * 60 * 1000)

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity))
      clearInterval(interval)
    }
  }, [isAuthenticated, updateActivity])

  return null
}
