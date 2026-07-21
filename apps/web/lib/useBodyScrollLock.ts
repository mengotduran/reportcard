import { useEffect } from 'react'

// Locks page scroll while a modal is open, so the background can't scroll
// underneath it — only the modal's own content (if it opts into overflow-y-auto)
// scrolls. Safe to call from multiple modals at once: each restores whatever
// the previous value was, so nesting can't leave scroll permanently locked.
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [locked])
}
