import { useColorScheme } from 'react-native'
import { useThemeStore } from './store/theme.store'

export const lightColors = {
  bg:            '#e2e2e2',
  bgSecondary:   '#d5d5d5',
  card:          '#e8e8e8',
  text:          '#09090b',
  textSecondary: '#71717a',
  textMuted:     '#a1a1aa',
  border:        '#bebebe',
  borderLight:   '#d5d5d5',
  inputBg:       '#e2e2e2',
  headerBg:      '#e8e8e8',
  tabBg:         '#e8e8e8',
  tabBorder:     '#bebebe',
  primary:       '#F03E2F',
  skeleton:      '#d5d5d5',
}

export const darkColors = {
  bg:            '#101112',
  bgSecondary:   '#1c1c1f',
  card:          '#161618',
  text:          '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted:     '#71717a',
  border:        '#27272a',
  borderLight:   '#1f1f22',
  inputBg:       '#1c1c1f',
  headerBg:      '#101112',
  tabBg:         '#101112',
  tabBorder:     '#27272a',
  primary:       '#F03E2F',
  skeleton:      '#27272a',
}

export type Colors = typeof lightColors

export function useTheme(): { isDark: boolean; colors: Colors } {
  const { theme } = useThemeStore()
  const systemScheme = useColorScheme()

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && (systemScheme === 'dark' || systemScheme == null))

  return { isDark, colors: isDark ? darkColors : lightColors }
}
