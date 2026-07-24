import { Tabs, Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TouchableOpacity, View, Text } from 'react-native'
import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/lib/store/auth.store'
import { getAcademicYears } from '@/lib/api/dashboard'
import { getMyNotifications } from '@/lib/api/notifications'
import { useTheme } from '@/lib/useTheme'
import ThemeToggle from '@/components/ThemeToggle'
import { useT } from '@/lib/i18n'

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']
const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
const NOTIFICATION_POLL_MS = 30000

export default function TabsLayout() {
  const { isAuthenticated, _hasHydrated, user, school, logout, activeSession, setActiveSession } = useAuthStore()
  const { colors, isDark } = useTheme()
  const router = useRouter()
  const t = useT()
  const [unreadCount, setUnreadCount] = useState(0)
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')

  // Keep the app-wide active academic year valid (defaults to the live year).
  useEffect(() => {
    if (!isAuthenticated || user?.role === 'SUPERADMIN') return
    getAcademicYears().then(({ academicYears }) => {
      const live = academicYears.find((y) => y.current)?.session ?? academicYears[0]?.session
      if (live && (!activeSession || !academicYears.some((y) => y.session === activeSession))) setActiveSession(live)
    }).catch(() => {})
  }, [isAuthenticated, user?.role])

  // Only admins receive notifications (teacher-absence reports) for now — poll rather
  // than true push, see [[in_app_notifications]] for why.
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    let cancelled = false
    const poll = () => getMyNotifications().then((r) => { if (!cancelled) setUnreadCount(r.unreadCount) }).catch(() => {})
    poll()
    const interval = setInterval(poll, NOTIFICATION_POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [isAuthenticated, isAdmin])

  if (!_hasHydrated) return null
  if (!isAuthenticated) return <Redirect href="/login" />

  const isTeacher = TEACHER_ROLES.includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isSuperAdmin = user?.role === 'SUPERADMIN'
  const isUniversity = school?.type === 'UNIVERSITY'

  const handleLogout = () => { logout(); router.replace('/login') }

  const notificationBell = (
    <TouchableOpacity onPress={() => router.push('/notifications' as any)} style={{ padding: 8 }} hitSlop={8}>
      <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
      {unreadCount > 0 && (
        <View style={{
          position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', borderRadius: 8,
          minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
        }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  )

  const logoutButton = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 10 }}>
      {notificationBell}
      <ThemeToggle size="sm" />
      <TouchableOpacity onPress={handleLogout} style={{ padding: 8 }} hitSlop={8}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
      </TouchableOpacity>
    </View>
  )

  // Teachers/class masters have no "More" tab (admin-only menu), so this is
  // their only way to reach Account — change password, mainly.
  const teacherHeaderButtons = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 10 }}>
      <ThemeToggle size="sm" />
      <TouchableOpacity onPress={() => router.push('/account')} style={{ padding: 8 }} hitSlop={8}>
        <Ionicons name="person-circle-outline" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={handleLogout} style={{ padding: 8 }} hitSlop={8}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
      </TouchableOpacity>
    </View>
  )

  const logoutButtonWhite = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 10 }}>
      <ThemeToggle size="sm" />
      <TouchableOpacity onPress={handleLogout} style={{ padding: 8 }} hitSlop={8}>
        <Ionicons name="log-out-outline" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  )

  const tabStyle = {
    tabBarStyle: { backgroundColor: colors.tabBg, borderTopColor: colors.tabBorder },
    headerStyle: { backgroundColor: colors.headerBg },
    headerTitleStyle: { fontWeight: '700' as const, fontSize: 20, color: colors.text },
    headerShadowVisible: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    lazy: false,
    sceneStyle: { backgroundColor: colors.bgSecondary },
  }

  if (isSuperAdmin) {
    return (
      <Tabs screenOptions={{ ...tabStyle, headerStyle: { backgroundColor: '#F03E2F' }, headerTitleStyle: { fontWeight: '700', fontSize: 20, color: '#fff' }, tabBarActiveTintColor: '#F03E2F' }}>
        <Tabs.Screen name="index" options={{ title: 'SuperAdmin', headerRight: () => logoutButtonWhite, tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="schools" options={{ title: 'Schools', headerRight: () => logoutButtonWhite, tabBarIcon: ({ color, size }) => <Ionicons name="business-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="report-cards" options={{ href: null }} />
        <Tabs.Screen name="timetable" options={{ href: null }} />
        <Tabs.Screen name="teaching-hours" options={{ href: null }} />
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
        {/* Admin editor is web-only — no timetable-building screen on mobile. */}
        <Tabs.Screen name="timetable" options={{ href: null }} />
        {/* Admin's coverage report is web-only (a filterable table), same reasoning as timetable above. */}
        <Tabs.Screen name="teaching-hours" options={{ href: null }} />
      </Tabs>
    )
  }

  if (isTeacher || isClassMaster) {
    return (
      <Tabs screenOptions={{ ...tabStyle, tabBarActiveTintColor: isClassMaster ? '#F03E2F' : colors.primary }}>
        <Tabs.Screen name="index" options={{ title: t('Home'), headerRight: () => teacherHeaderButtons, tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="report-cards" options={{ title: isClassMaster ? t(isUniversity ? 'My Departments' : 'My Classes') : t(isUniversity ? 'Departments' : 'Classes'), tabBarIcon: ({ color, size }) => <Ionicons name={isClassMaster ? 'chatbubble-ellipses-outline' : 'school-outline'} size={size} color={color} /> }} />
        <Tabs.Screen name="timetable" options={{ title: t('Timetable'), tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="teaching-hours" options={{ title: t('Attendance'), tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" size={size} color={color} /> }} />
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
      <Tabs.Screen name="timetable" options={{ href: null }} />
      <Tabs.Screen name="teaching-hours" options={{ href: null }} />
    </Tabs>
  )
}
