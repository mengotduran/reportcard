import { TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore } from '@/lib/store/theme.store'
import { useTheme } from '@/lib/useTheme'

// Plain icon button that cycles the three theme states. No red pill, no shadow
// (hard rule: depth comes from surface steps + hairlines, never elevation).
const NEXT = { light: 'dark', dark: 'system', system: 'light' } as const
const ICON = { light: 'sunny-outline', dark: 'moon-outline', system: 'contrast-outline' } as const

export default function ThemeToggle({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { theme, setTheme } = useThemeStore()
  const { colors } = useTheme()
  const dim = size === 'md' ? 22 : 19

  return (
    <TouchableOpacity
      onPress={() => setTheme(NEXT[theme])}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={`Theme: ${theme}. Tap to change.`}
    >
      <Ionicons name={ICON[theme]} size={dim} color={colors.brassInk} />
    </TouchableOpacity>
  )
}
