import { useColorScheme } from 'react-native'
import { useThemeStore } from './store/theme.store'
import { themes, type Theme } from './theme/tokens'

// The design-system palette (new key names live in lib/theme/tokens.ts).
// We expose those keys AND a set of back-compat aliases mapping the old palette
// key names onto the new brass-on-brown tokens, so every screen that still reads
// `colors.card` / `colors.primary` / etc. reskins instantly while it waits to be
// rebuilt against the proper new keys.
function withAliases(t: Theme) {
  return {
    ...t,
    // ── back-compat aliases (old key name → new token) ──
    bgSecondary: t.bg,
    card: t.surface,
    textSecondary: t.textDim,
    textMuted: t.textFaint,
    border: t.line,
    borderLight: t.hairline,
    inputBg: t.surface,
    headerBg: t.bg,
    tabBg: t.bg,
    tabBorder: t.line,
    primary: t.brassFill, // fills stay gold; text/line uses should migrate to brassInk
    skeleton: t.line,
  }
}

const lightColors = withAliases(themes.light)
const darkColors = withAliases(themes.dark)

export type Colors = typeof darkColors

export function useTheme(): { isDark: boolean; colors: Colors } {
  const { theme } = useThemeStore()
  const systemScheme = useColorScheme()

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && (systemScheme === 'dark' || systemScheme == null))

  return { isDark, colors: isDark ? darkColors : lightColors }
}

// Re-export the design-system pieces so screens can import everything from one place.
export { type, font, space, radius, hairlineWidth, themes } from './theme/tokens'
export type { Theme } from './theme/tokens'
