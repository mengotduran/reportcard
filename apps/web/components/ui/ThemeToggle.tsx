'use client'
import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '@/lib/store/theme.store'
import { useEffect, useState } from 'react'

export default function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useThemeStore()
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const check = () => {
      if (theme === 'dark') setIsDark(true)
      else if (theme === 'light') setIsDark(false)
      else setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    check()
  }, [theme])

  const toggle = () => setTheme(isDark ? 'light' : 'dark')

  const w = compact ? 32 : 40
  const h = compact ? 18 : 22
  const knob = compact ? 14 : 18

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: w, height: h,
        borderRadius: h / 2,
        backgroundColor: isDark ? '#F03E2F' : '#e4e4e7',
        position: 'relative',
        transition: 'background-color 0.2s',
        flexShrink: 0,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <span style={{
        position: 'absolute',
        left: isDark ? w - knob - 2 : 2,
        width: knob, height: knob,
        borderRadius: '50%',
        backgroundColor: '#fff',
        transition: 'left 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}>
        {isDark
          ? <Moon size={compact ? 7 : 9} color="#F03E2F" />
          : <Sun  size={compact ? 7 : 9} color="#71717a" />
        }
      </span>
    </button>
  )
}
