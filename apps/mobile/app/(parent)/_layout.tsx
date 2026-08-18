import { useEffect, useMemo } from 'react'
import { Stack, Redirect } from 'expo-router'
import { TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import ThemeToggle from '@/components/ThemeToggle'

/**
 * The parent side of the app, kept in its own route group.
 *
 * Separate from `(tabs)` rather than a role branch inside it, because every screen in there
 * is written against a staff user with a school, and a parent's account has neither: their
 * User.schoolId is null by design, since their children can be at two schools at once. The
 * API enforces the same split (denyParents refuses a PARENT token on every staff route), so
 * one shared shell would only produce screens that fail one panel at a time.
 *
 * No tabs: a parent has two screens, and a tab bar for two screens is furniture.
 */
export default function ParentLayout() {
  const { colors } = useTheme()
  const t = useT()
  const router = useRouter()
  const { isAuthenticated, _hasHydrated, user, logout } = useAuthStore()

  // Staff who somehow land here go back to their own app rather than being signed out.
  const isParent = user?.role === 'PARENT'
  useEffect(() => {
    if (_hasHydrated && isAuthenticated && !isParent) router.replace('/(tabs)')
  }, [_hasHydrated, isAuthenticated, isParent, router])

  const handleLogout = () => { logout(); router.replace('/login') }

  const headerRight = useMemo(() => function HeaderRight() {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <ThemeToggle />
        <TouchableOpacity onPress={handleLogout} hitSlop={8}>
          <Ionicons name="log-out-outline" size={20} color={colors.brassInk} />
        </TouchableOpacity>
      </View>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors.brassInk])

  if (!_hasHydrated) return null
  if (!isAuthenticated) return <Redirect href="/login" />

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.brassInk,
        headerTitleStyle: { fontFamily: 'Blinker_600SemiBold', color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* Named "children" rather than "index": a route group does not appear in the path,
          so an index here would claim "/" alongside the staff tabs' own index and the two
          would collide. */}
      <Stack.Screen name="children" options={{ title: t('My Children'), headerRight }} />
      <Stack.Screen name="child/[studentId]" options={{ headerBackTitle: '', headerRight }} />
    </Stack>
  )
}
