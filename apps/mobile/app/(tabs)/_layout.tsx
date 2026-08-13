import { Tabs, Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { TouchableOpacity, View, Text, AppState } from 'react-native'
import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/lib/store/auth.store'
import { getAcademicYears } from '@/lib/api/dashboard'
import { getMyNotifications } from '@/lib/api/notifications'
import { useTheme, font, hairlineWidth } from '@/lib/useTheme'
import ThemeToggle from '@/components/ThemeToggle'
import { useT } from '@/lib/i18n'
import { connectSocket, disconnectSocket, onRealtime, reconnectIfNeeded } from '@/lib/socket'

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER']
const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
// Fallback interval only — the socket is the primary path now, so this is deliberately
// slow. It exists so a dead socket degrades to stale rather than frozen.
const NOTIFICATION_POLL_MS = 150000

export default function TabsLayout() {
  const { isAuthenticated, _hasHydrated, user, school, token, logout, activeSession, setActiveSession } = useAuthStore()
  const { colors, isDark } = useTheme()
  const router = useRouter()
  const t = useT()
  const [unreadCount, setUnreadCount] = useState(0)
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')
  const isTeacher = TEACHER_ROLES.includes(user?.role ?? '')
  const isClassMaster = user?.role === 'CLASS_MASTER'
  // Who gets notifications: admins (a teacher self-reported or retracted) AND teachers /
  // class masters (an admin logged or removed an absence FOR them, or took a course off
  // them). The API is role-agnostic and returns each user's own rows, so this is purely
  // which roles we connect and surface a badge to. Mirrors web's `receivesNotifications`.
  const receivesNotifications = isAdmin || isTeacher || isClassMaster

  // Keep the app-wide active academic year valid (defaults to the live year).
  useEffect(() => {
    if (!isAuthenticated || user?.role === 'SUPERADMIN') return
    getAcademicYears().then(({ academicYears }) => {
      const live = academicYears.find((y) => y.current)?.session ?? academicYears[0]?.session
      if (live && (!activeSession || !academicYears.some((y) => y.session === activeSession))) setActiveSession(live)
    }).catch(() => {})
  }, [isAuthenticated, user?.role])

  // Real-time via socket, with the poll kept as a slower SAFETY NET. Still not true push:
  // nothing arrives while the app is closed, only while it is open. See the socket module
  // for why signals carry no data.
  useEffect(() => {
    if (!isAuthenticated || !receivesNotifications || !token) return
    let cancelled = false
    const refresh = () => getMyNotifications().then((r) => { if (!cancelled) setUnreadCount(r.unreadCount) }).catch(() => {})

    refresh()
    connectSocket(token)
    const off = onRealtime('notifications:changed', refresh)
    const interval = setInterval(refresh, NOTIFICATION_POLL_MS)

    // iOS suspends the process in the background and can drop the connection without the JS
    // runtime hearing about it, so socket.io's own backoff never fires. Reconnect and refetch
    // on foreground, or the app comes back from a pocket showing a stale badge forever.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { reconnectIfNeeded(); refresh() }
    })

    return () => { cancelled = true; off(); clearInterval(interval); sub.remove() }
  }, [isAuthenticated, receivesNotifications, token])

  if (!_hasHydrated) return null
  if (!isAuthenticated) return <Redirect href="/login" />

  const isSuperAdmin = user?.role === 'SUPERADMIN'
  const isUniversity = school?.type === 'UNIVERSITY'

  // Drop the socket before clearing the session: it is still joined to this user's rooms,
  // and reusing it after a different login would deliver their signals to the wrong person.
  const handleLogout = () => { disconnectSocket(); logout(); router.replace('/login') }

  // NO padding on these buttons. A 22px icon wrapped in `padding: 8` is 38px tall, which
  // overflows the header's right-hand container and gets CLIPPED — on an iPhone the bell
  // lost its bottom third and the log-out glyph its base, while the ThemeToggle beside them
  // (no padding) rendered whole. That is the tell, and the same trio in DashboardHome has
  // always used hitSlop instead. hitSlop keeps the tap target well past 44px without adding
  // a single pixel to the laid-out box.
  const notificationBell = (
    <TouchableOpacity onPress={() => router.push('/notifications' as any)} hitSlop={12}>
      <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
      {unreadCount > 0 && (
        <View style={{
          position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 8,
          minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
        }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  )

  // Fixed height so the three sit on one line and the row can never be taller than the
  // header allows, whatever an icon inside it is.
  const headerActionRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, height: 30, marginRight: 12 }

  const logoutButton = (
    <View style={headerActionRow}>
      {notificationBell}
      <ThemeToggle size="sm" />
      <TouchableOpacity onPress={handleLogout} hitSlop={12}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
      </TouchableOpacity>
    </View>
  )


  const logoutButtonWhite = (
    <View style={headerActionRow}>
      <ThemeToggle size="sm" />
      <TouchableOpacity onPress={handleLogout} hitSlop={12}>
        <Ionicons name="log-out-outline" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  )

  const tabStyle = {
    tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: hairlineWidth },
    tabBarLabelStyle: { fontFamily: font.monoRegular, fontSize: 11, letterSpacing: 0.4, textTransform: 'lowercase' as const },
    tabBarIconStyle: { marginBottom: -2 },
    headerStyle: { backgroundColor: colors.bg },
    headerTitleStyle: { fontFamily: font.displayMedium, fontSize: 20, color: colors.text },
    headerShadowVisible: false,
    tabBarActiveTintColor: colors.brassInk,
    tabBarInactiveTintColor: colors.textFaint,
    lazy: false,
    sceneStyle: { backgroundColor: colors.bg },
  }

  if (isSuperAdmin) {
    return (
      <Tabs screenOptions={{ ...tabStyle, headerStyle: { backgroundColor: colors.brassFill }, headerTitleStyle: { fontFamily: font.displayMedium, fontSize: 20, color: colors.onBrass }, tabBarActiveTintColor: colors.brassInk }}>
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
        <Tabs.Screen name="teaching-hours" options={{ title: t('Attendance'), tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="schools" options={{ href: null }} />
        {/* Admin editor is web-only — no timetable-building screen on mobile. */}
        <Tabs.Screen name="timetable" options={{ href: null }} />
      </Tabs>
    )
  }

  if (isTeacher || isClassMaster) {
    return (
      <Tabs screenOptions={tabStyle}>
        <Tabs.Screen name="index" options={{ title: t('Home'), headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
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
