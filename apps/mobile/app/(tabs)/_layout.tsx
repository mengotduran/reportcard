import { Tabs, Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TouchableOpacity, View } from 'react-native'
import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/lib/store/auth.store'
import { getAcademicYears } from '@/lib/api/dashboard'
import { useTheme } from '@/lib/useTheme'
import ThemeToggle from '@/components/ThemeToggle'
import { useT } from '@/lib/i18n'

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']
const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']

export default function TabsLayout() {
  const { isAuthenticated, _hasHydrated, user, logout, activeSession, setActiveSession } = useAuthStore()
  const { colors, isDark } = useTheme()
  const router = useRouter()
  const t = useT()

  // Keep the app-wide active academic year valid (defaults to the live year).
  useEffect(() => {
    if (!isAuthenticated || user?.role === 'SUPERADMIN') return
    getAcademicYears().then(({ academicYears }) => {
      const live = academicYears.find((y) => y.current)?.session ?? academicYears[0]?.session
      if (live && (!activeSession || !academicYears.some((y) => y.session === activeSession))) setActiveSession(live)
    }).catch(() => {})
  }, [isAuthenticated, user?.role])

  if (!_hasHydrated) return null
  if (!isAuthenticated) return <Redirect href="/login" />

  const isTeacher = TEACHER_ROLES.includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isSuperAdmin = user?.role === 'SUPERADMIN'
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')

  const handleLogout = () => { logout(); router.replace('/login') }

  const logoutButton = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 14 }}>
      <ThemeToggle size="sm" />
      <TouchableOpacity onPress={handleLogout} style={{ padding: 4 }}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
      </TouchableOpacity>
    </View>
  )

  const logoutButtonWhite = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 14 }}>
      <ThemeToggle size="sm" />
      <TouchableOpacity onPress={handleLogout} style={{ padding: 4 }}>
        <Ionicons name="log-out-outline" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  )

  const tabStyle = {
    tabBarStyle: { backgroundColor: colors.tabBg, borderTopColor: colors.tabBorder },
    headerStyle: { backgroundColor: colors.headerBg },
    headerTitleStyle: { fontWeight: '600' as const, color: colors.text },
    headerShadowVisible: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    lazy: false,
    sceneStyle: { backgroundColor: colors.bgSecondary },
  }

  if (isSuperAdmin) {
    return (
      <Tabs screenOptions={{ ...tabStyle, headerStyle: { backgroundColor: '#F03E2F' }, headerTitleStyle: { fontWeight: '700', color: '#fff' }, tabBarActiveTintColor: '#F03E2F' }}>
        <Tabs.Screen name="index" options={{ title: 'SuperAdmin', headerRight: () => logoutButtonWhite, tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="schools" options={{ title: 'Schools', headerRight: () => logoutButtonWhite, tabBarIcon: ({ color, size }) => <Ionicons name="business-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="report-cards" options={{ href: null }} />
        <Tabs.Screen name="more" options={{ href: null }} />
      </Tabs>
    )
  }

  if (isAdmin) {
    return (
      <Tabs screenOptions={tabStyle}>
        <Tabs.Screen name="index" options={{ title: t('Dashboard'), headerRight: () => logoutButton, tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="report-cards" options={{ title: t('Report Cards'), tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="students" options={{ title: t('Students'), tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="more" options={{ title: t('More'), tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="schools" options={{ href: null }} />
      </Tabs>
    )
  }

  if (isTeacher || isClassMaster) {
    return (
      <Tabs screenOptions={{ ...tabStyle, tabBarActiveTintColor: isClassMaster ? '#F03E2F' : colors.primary }}>
        <Tabs.Screen name="index" options={{ title: t('Home'), headerRight: () => logoutButton, tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="report-cards" options={{ title: isClassMaster ? t('My Classes') : t('Classes'), tabBarIcon: ({ color, size }) => <Ionicons name={isClassMaster ? 'chatbubble-ellipses-outline' : 'school-outline'} size={size} color={color} /> }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="schools" options={{ href: null }} />
        <Tabs.Screen name="more" options={{ href: null }} />
      </Tabs>
    )
  }

  return (
    <Tabs screenOptions={tabStyle}>
      <Tabs.Screen name="index" options={{ title: t('Dashboard'), tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="students" options={{ title: t('Students'), tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="report-cards" options={{ title: t('Report Cards'), tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="schools" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
    </Tabs>
  )
}
