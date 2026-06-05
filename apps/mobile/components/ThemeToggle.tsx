import { useRef, useEffect } from 'react'
import { TouchableOpacity, Animated, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/lib/store/theme.store'
import { useTheme } from '@/lib/useTheme'

export default function ThemeToggle({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { theme, setTheme } = useThemeStore()
  const { isDark } = useTheme()
  const anim = useRef(new Animated.Value(isDark ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isDark ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start()
  }, [isDark])

  const toggle = () => setTheme(isDark ? 'light' : 'dark')

  const w = size === 'md' ? 48 : 36
  const h = size === 'md' ? 26 : 20
  const knob = size === 'md' ? 22 : 16
  const pad = 2

  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [pad, w - knob - pad] })
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#bebebe', '#F03E2F'] })

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.8}>
      <Animated.View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: bg, justifyContent: 'center' }}>
        <Animated.View style={{
          position: 'absolute', left, width: knob, height: knob, borderRadius: knob / 2,
          backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
        }}>
          <Ionicons
            name={isDark ? 'moon' : 'sunny'}
            size={size === 'md' ? 11 : 9}
            color={isDark ? '#F03E2F' : '#71717a'}
          />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  )
}
