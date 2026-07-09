'use client'
import { useEffect, useRef } from 'react'
import { useThemeStore } from '@/lib/store/theme.store'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()
  const hasApplied = useRef(false)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const root = document.documentElement
    const apply = (dark: boolean) => {
      // Crossfade the whole page when the theme actually flips (but not on
      // the initial application at page load) — .theme-transition briefly
      // turns on color/background transitions everywhere (see globals.css).
      if (hasApplied.current && root.classList.contains('dark') !== dark) {
        root.classList.add('theme-transition')
        if (transitionTimer.current) clearTimeout(transitionTimer.current)
        transitionTimer.current = setTimeout(() => root.classList.remove('theme-transition'), 550)
      }
      root.classList.toggle('dark', dark)
      hasApplied.current = true
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches)
      // Chrome's print preview momentarily reports prefers-color-scheme as
      // light (so the printed page previews on a white background), which
      // fires a spurious 'change' event here and flips the whole app to
      // light mode. Ignore changes while printing and resync to the real
      // OS preference once the print dialog closes.
      let printing = false
      const handler = (e: MediaQueryListEvent) => { if (!printing) apply(e.matches) }
      const onBeforePrint = () => { printing = true }
      const onAfterPrint = () => { printing = false; apply(mq.matches) }
      mq.addEventListener('change', handler)
      window.addEventListener('beforeprint', onBeforePrint)
      window.addEventListener('afterprint', onAfterPrint)
      return () => {
        mq.removeEventListener('change', handler)
        window.removeEventListener('beforeprint', onBeforePrint)
        window.removeEventListener('afterprint', onAfterPrint)
      }
    } else {
      apply(theme === 'dark')
    }
  }, [theme])

  return <>{children}</>
}
