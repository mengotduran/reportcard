import { useState, useCallback } from 'react'

interface Toast {
  message: string
  type: 'success' | 'error'
}

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }, [])

  const hideToast = useCallback(() => {
    setToast(null)
  }, [])

  return { toast, showToast, hideToast }
}
