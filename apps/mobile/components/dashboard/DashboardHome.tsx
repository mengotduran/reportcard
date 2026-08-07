import { useEffect, useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AutoSlider from '@/components/AutoSlider'
import ThemeToggle from '@/components/ThemeToggle'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { getDashboardStats, getWeeklyStats, getTeacherClasses, WeeklyStats, TeacherClassRow } from '@/lib/api/dashboard'
import { getCurrentTerm, CurrentTerm } from '@/lib/api/terms'
import { getMyTimetable, MyTimetableSlot } from '@/lib/api/timetable'
import { getMyNotifications } from '@/lib/api/notifications'
import { onRealtime } from '@/lib/socket'
import { useTheme, Colors, type, space, radius, font, hairlineWidth } from '@/lib/useTheme'
import { useT, useLocaleCode } from '@/lib/i18n'
import { API_BASE } from '@/lib/config'
import SetupChecklist from '@/components/SetupChecklist'

interface Stats { students: number; teachers: number; reportCards: number; subjects: number }

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER']
const DAY_ORDER = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

// ── Teacher home pager geometry (spec §3.5) ──
// A fixed peek of the next panel telegraphs the swipe; do NOT use pagingEnabled
// (it snaps to full screen width and fights the peek).
const SCREEN_W = Dimensions.get('window').width
const GUTTER = space.gutter
const GAP = space.md
const PEEK = 48
const CARD_W = SCREEN_W - GUTTER * 2 - PEEK
const SNAP = CARD_W + GAP
const PANEL_MIN_H = 264

// "Level 1" → "L1", "HND 2" → "H2", else first letter. Short code shown right-aligned.
function shortCode(name: string): string {
  const digit = name.match(/\d+/)?.[0]
  const letter = name.trim()[0]?.toUpperCase() ?? ''
  return digit ? `${/university|level/i.test(name) ? 'L' : letter}${digit}` : letter
}

// The full current week (Mon–Sun) for the Today panel's day strip, so the current
// day is ALWAYS shown and highlighted — even on a weekend or a day with no periods.
function weekdayStrip(now: Date) {
  const day = now.getDay() // 0 Sun … 6 Sat
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function SchoolCrest({ name, size = 80 }: { name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: '#1a0605', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '900', letterSpacing: 1, fontSize: size * 0.32 }}>{initials}</Text>
    </View>
  )
}

function MiniBarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 36, gap: 2 }}>
      {data.map((v, i) => (
        <View key={i} style={{
          flex: 1,
          height: Math.max((v / max) * 36, 2),
          backgroundColor: i === data.length - 1 ? color : color + '45',
          borderRadius: 3,
        }} />
      ))}
    </View>
  )
}

function TeacherHome() {
  const { colors } = useTheme()
  const t = useT()
  const locale = useLocaleCode()
  const insets = useSafeAreaInsets()
  const { user, school, activeSession, logout } = useAuthStore()
  const router = useRouter()
  const handleLogout = () => { logout(); router.replace('/login') }
  const pagerRef = useRef<ScrollView>(null)
  const [classes, setClasses] = useState<TeacherClassRow[]>([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [panel, setPanel] = useState(0)
  const [term, setTerm] = useState<CurrentTerm | null>(null)
  const [todaySlots, setTodaySlots] = useState<MyTimetableSlot[]>([])
  const [timetableLoading, setTimetableLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const now = new Date()
  const roleLabel = (user?.role?.replace(/_/g, ' ') ?? '').toLowerCase()
  const logoUrl = school?.logo ? `${API_BASE}${school.logo}` : null
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isUniversity = school?.type === 'UNIVERSITY'
  const levelWord = isUniversity ? 'university school' : `${(school?.type ?? '').toLowerCase()} school`

  const refreshUnread = useCallback(() => {
    getMyNotifications().then((r) => setUnreadCount(r.unreadCount)).catch(() => {})
  }, [])

  const fetchAll = useCallback(() => {
    // A failed request must NOT fall through to "you haven't been assigned any classes yet".
    // That sentence is a claim about the data, and it reads as "my courses vanished" when the
    // real problem is that the API is unreachable — which is exactly what a dead dev tunnel
    // or a lost Wi-Fi connection looks like, since the persisted login still shows the name.
    getTeacherClasses()
      .then((r) => { setClasses(r.classes); setLoadFailed(false) })
      .catch(() => setLoadFailed(true))
      .finally(() => setClassesLoading(false))
    getCurrentTerm().then(setTerm).catch(() => {})
    getMyTimetable().then((r) => {
      const todayName = DAY_ORDER[new Date().getDay()]
      setTodaySlots(r.slots.filter((s) => s.dayOfWeek === todayName).sort((a, b) => a.startTime.localeCompare(b.startTime)))
    }).catch(() => {}).finally(() => setTimetableLoading(false))
    // Unread notifications (e.g. an admin logged/removed an absence for this teacher) —
    // the whole point is the teacher sees it on landing here, not only if they dig into
    // Attendance. Refreshed on every focus, same as the rest.
    refreshUnread()
  }, [refreshUnread])

  useEffect(() => { fetchAll() }, [fetchAll])
  useFocusEffect(useCallback(() => { fetchAll() }, [fetchAll]))

  // This badge is the teacher's only notification indicator on mobile — the tab layout's bell
  // is admin-only, and their Home tab renders its own header. So it has to react to the
  // realtime signal itself; the socket is connected by the tab layout. Only the count is
  // refetched, not the whole dashboard, since that is all the signal says changed.
  useEffect(() => onRealtime('notifications:changed', refreshUnread), [refreshUnread])

  // Ends-in copy fix (spec §3.3): "ends today" at 0, "ends in N days" ahead, "ended" past.
  const daysLeft = term ? Math.ceil((new Date(term.endDate).getTime() - now.getTime()) / 86400000) : null
  const endsLabel = daysLeft === null ? '' : daysLeft < 0 ? t('ended') : daysLeft === 0 ? t('ends today') : `${t('ends in')} ${daysLeft} ${t(daysLeft === 1 ? 'day' : 'days')}`
  const yearLabel = (activeSession || '').replace(/\s*[/-]\s*/, ' / ') || '—'

  // Default to Today while a class still lies ahead today, else Your courses (spec §3.5).
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const hasUpcoming = todaySlots.some((s) => (s.endTime ?? s.startTime) >= nowHM)
  const nextSlotId = todaySlots.find((s) => (s.endTime ?? s.startTime) >= nowHM)?.id
  const defaultPanel = hasUpcoming && todaySlots.length > 0 ? 1 : 0

  // Apply the default panel once data lands (don't yank the pager if the user already swiped).
  const appliedDefault = useRef(false)
  useEffect(() => {
    if (appliedDefault.current || timetableLoading) return
    appliedDefault.current = true
    if (defaultPanel === 1) {
      setPanel(1)
      requestAnimationFrame(() => pagerRef.current?.scrollTo({ x: SNAP, animated: false }))
    }
  }, [timetableLoading, defaultPanel])

  const goToPanel = (i: number) => {
    setPanel(i)
    pagerRef.current?.scrollTo({ x: i * SNAP, animated: true })
  }

  const week = weekdayStrip(now)
  const todayKey = now.toDateString()

  const goToClass = (c: TeacherClassRow) => {
    if (c.subjectId && c.studentCount === 0) return
    if (c.subjectId && term) {
      router.push(`/marks/${encodeURIComponent(c.subjectId)}?classLevel=${encodeURIComponent(c.classLevelName)}&termId=${term.id}&termName=${encodeURIComponent(term.name)}&subjectName=${encodeURIComponent(c.subjectName ?? '')}&sequence=0` as any)
    } else if (isClassMaster) {
      router.push(`/class-master/${encodeURIComponent(c.classLevelName)}?termId=${term?.id ?? ''}` as any)
    } else {
      router.push('/(tabs)/report-cards')
    }
  }

  const initials = (school?.name ?? 'S').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  // Nicely, not exhaustively — a teacher on many classes gets a taste here and the rest
  // on My Classes, which already lists every one of them ("view all N" below).
  const shown = classes.slice(0, 3)

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
      {/* ── Header row (§3.1) — pad below the status bar so the crest/name clear it ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: insets.top + space.lg, paddingBottom: 18 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.brassInk, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: logoUrl ? '#fff' : 'transparent' }}>
          {logoUrl
            ? <Image source={{ uri: logoUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} resizeMode="contain" />
            : <Text style={[type.itemTitle, { color: colors.brassInk }]}>{initials}</Text>}
        </View>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={[type.schoolName, { color: colors.text }]} numberOfLines={1}>{school?.name}</Text>
          <Text style={[type.microLabel, { color: colors.textFaint }]}>{levelWord}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <ThemeToggle size="sm" />
          <TouchableOpacity onPress={() => router.push('/notifications')} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={colors.textDim} />
            {unreadCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/account')} hitSlop={8}>
            <Ionicons name="person-circle-outline" size={22} color={colors.textDim} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} hitSlop={8}>
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Greeting block (§3.2) ── */}
      <View style={{ paddingHorizontal: GUTTER, marginBottom: space.lg }}>
        <Text style={[type.bodySmall, { color: colors.textDim }]}>{t(getGreeting())},</Text>
        <Text style={[type.greetingName, { color: colors.text, marginTop: 2 }]}>{user?.name}</Text>
        <Text style={[type.microAccent, { color: colors.brassInk, marginTop: 6 }]}>{roleLabel}</Text>
      </View>

      {/* ── Ledger strip (§3.3) ── */}
      <View style={{ marginHorizontal: GUTTER, borderTopWidth: hairlineWidth, borderBottomWidth: hairlineWidth, borderColor: colors.line, flexDirection: 'row', paddingVertical: space.md, marginBottom: space.xl }}>
        <View style={{ flex: 1, paddingRight: space.md }}>
          <Text style={[type.microLabel, { color: colors.textFaint }]}>{t('school year')}</Text>
          <Text style={[type.dataLarge, { color: colors.text, marginTop: 4 }]}>{yearLabel}</Text>
        </View>
        <View style={{ flex: 1.15, paddingLeft: space.lg, borderLeftWidth: hairlineWidth, borderColor: colors.line }}>
          <Text style={[type.microLabel, { color: colors.textFaint }]}>{t('current period')}</Text>
          <Text style={[type.body, { color: colors.text, marginTop: 4 }]} numberOfLines={1}>{term?.name ?? t('Not set')}</Text>
          {daysLeft !== null && <Text style={[type.microLabel, { color: colors.brassInk, marginTop: 2 }]}>{endsLabel}</Text>}
        </View>
      </View>

      {/* ── Panel labels + progress rail (§3.4) ── */}
      <View style={{ paddingHorizontal: GUTTER, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => goToPanel(0)} activeOpacity={0.7}>
          <Text style={[type.sectionTitle, { color: panel === 0 ? colors.text : colors.textOff }]}>{t(isUniversity ? 'Your courses' : 'Your classes')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goToPanel(1)} activeOpacity={0.7} style={{ marginLeft: space.lg }}>
          <Text style={[type.sectionTitle, { color: panel === 1 ? colors.text : colors.textOff }]}>{t('Today')}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: GUTTER, gap: 5, marginTop: space.sm, marginBottom: space.md }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: 26, height: 2, borderRadius: 2, backgroundColor: panel === i ? colors.brassInk : colors.line }} />
        ))}
      </View>

      {/* ── Pager: Your courses / Today (§3.5) ── */}
      <ScrollView
        ref={pagerRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: GAP }}
        onMomentumScrollEnd={(e) => setPanel(Math.round(e.nativeEvent.contentOffset.x / SNAP))}
      >
        {/* Panel 1 — Your courses (ledger rows, §3.5) */}
        <View style={{ width: CARD_W, minHeight: PANEL_MIN_H, backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: space.xs, paddingHorizontal: space.lg }}>
          {classesLoading ? (
            <View style={{ height: 40, marginVertical: space.md, backgroundColor: colors.line, borderRadius: radius.chip }} />
          ) : loadFailed ? (
            <Text style={[type.bodySmall, { color: '#F03E2F', textAlign: 'center', paddingVertical: space.xl }]}>
              {t("Could not reach the server. Check your connection and pull to refresh.")}
            </Text>
          ) : shown.length === 0 ? (
            <Text style={[type.bodySmall, { color: colors.textDim, textAlign: 'center', paddingVertical: space.xl }]}>
              {t("You haven't been assigned any classes yet.")}
            </Text>
          ) : (
            shown.map((c, i) => {
              const noStudents = !!c.subjectId && c.studentCount === 0
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => goToClass(c)}
                  activeOpacity={noStudents ? 1 : 0.7}
                  disabled={noStudents}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderTopWidth: i === 0 ? 0 : hairlineWidth, borderColor: colors.hairline, opacity: noStudents ? 0.5 : 1 }}
                >
                  <Text style={[type.microLabel, { color: colors.textFaint, width: 16 }]}>{String(i + 1).padStart(2, '0')}</Text>
                  <View style={{ flex: 1, marginLeft: space.md }}>
                    <Text style={[type.itemTitle, { color: colors.text }]} numberOfLines={1}>{c.subjectName ?? t('Class oversight')}</Text>
                    <Text style={[type.microLabel, { color: colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                      {noStudents ? t('No students yet') : (c.departmentName ? c.departmentName.toLowerCase() : '')}
                    </Text>
                  </View>
                  <Text style={[type.microLabel, { color: colors.brassInk, marginLeft: space.sm }]}>{shortCode(c.classLevelName)}</Text>
                </TouchableOpacity>
              )
            })
          )}
          {classes.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/my-courses' as any)} style={{ paddingTop: space.md, paddingBottom: space.sm }}>
              <Text style={[type.microAccent, { color: colors.brassInk }]}>{t('view all')} {classes.length} {t(isUniversity ? 'courses' : 'classes')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Panel 2 — Today (day strip + session rows, §3.5) */}
        <View style={{ width: CARD_W, minHeight: PANEL_MIN_H, backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: space.md, paddingHorizontal: space.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: space.md, borderBottomWidth: hairlineWidth, borderColor: colors.hairline }}>
            {week.map((d) => {
              const isToday = d.toDateString() === todayKey
              return (
                <View key={d.toISOString()} style={{ alignItems: 'center', borderRadius: radius.chip, paddingHorizontal: space.xs, paddingVertical: 4, minWidth: 30, backgroundColor: isToday ? colors.brassFill : 'transparent' }}>
                  <Text style={[type.microLabel, { color: isToday ? colors.onBrass : colors.textFaint }]}>{WD[d.getDay()]}</Text>
                  <Text style={[type.dataMedium, { color: isToday ? colors.onBrass : colors.textDim, marginTop: 2 }]}>{d.getDate()}</Text>
                </View>
              )
            })}
          </View>
          {timetableLoading ? (
            <View style={{ height: 30, marginTop: space.md, backgroundColor: colors.line, borderRadius: radius.chip }} />
          ) : todaySlots.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
              <Ionicons name="calendar-outline" size={20} color={colors.textFaint} />
              <Text style={[type.bodySmall, { color: colors.textDim, marginTop: space.sm }]}>{t('No lessons scheduled for today')}</Text>
            </View>
          ) : (
            todaySlots.map((s) => {
              const isNext = s.id === nextSlotId
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md }}>
                  <View style={{ width: 46 }}>
                    <Text style={[type.dataMedium, { color: colors.text }]}>{s.startTime}</Text>
                    {!!s.endTime && <Text style={[type.microLabel, { color: colors.textFaint }]}>{s.endTime}</Text>}
                  </View>
                  <View style={{ width: 1, alignSelf: 'stretch', marginHorizontal: space.md, backgroundColor: isNext ? colors.brassInk : colors.brassEdge }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.itemTitle, { color: colors.text }]} numberOfLines={1}>
                      {s.subjectId ? (s.subjectName ?? t('Unknown subject')) : (s.label ?? t('Private class'))}
                    </Text>
                    {(s.room || s.classLevel) && (
                      <Text style={[type.microLabel, { color: colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                        {[s.room, s.classLevel].filter(Boolean).join(' · ').toLowerCase()}
                      </Text>
                    )}
                  </View>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* ── Primary button (§3.6) — flat brass, no glow ── */}
      <TouchableOpacity
        onPress={() => router.push('/(tabs)/report-cards')}
        activeOpacity={0.85}
        style={{ marginHorizontal: GUTTER, marginTop: space.xl, backgroundColor: colors.brassFill, borderRadius: radius.control, paddingVertical: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' }}
      >
        <Text style={[type.buttonLabel, { color: colors.onBrass, flex: 1 }]}>{isClassMaster ? t('Enter remarks') : t('Enter my classes')}</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.onBrass} />
      </TouchableOpacity>
    </ScrollView>
  )
}

const CHART_META = [
  { key: 'students' as const,    label: 'Students',     icon: 'people',         color: '#F03E2F', bg: '#FEF2F1' },
  { key: 'reportCards' as const, label: 'Report Cards', icon: 'document-text',  color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'teachers' as const,    label: 'Teachers',     icon: 'school',         color: '#16a34a', bg: '#f0fdf4' },
  { key: 'subjects' as const,    label: 'Subjects',     icon: 'book',           color: '#ea580c', bg: '#fff7ed' },
]

function WeeklyChartCard({ meta, weekData, total, statsLoading }: {
  meta: typeof CHART_META[0]; weekData: number[]; total: number; statsLoading: boolean
}) {
  const { colors } = useTheme()
  const t = useT()
  const adm = makeAdmStyles(colors)
  const lastWeek = weekData[weekData.length - 1] ?? 0
  const prevWeek = weekData[weekData.length - 2] ?? 0
  const delta = lastWeek - prevWeek
  const trendColor = delta > 0 ? '#16a34a' : delta < 0 ? '#ef4444' : colors.textMuted

  return (
    <View style={adm.chartCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: meta.bg, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name={meta.icon as any} size={14} color={meta.color} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Ionicons name={delta >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={13} color={trendColor} />
          <Text style={{ fontSize: 10, color: trendColor, fontWeight: '700' }}>
            {delta > 0 ? `+${delta}` : delta}
          </Text>
        </View>
      </View>
      {statsLoading
        ? <View style={{ width: 36, height: 22, backgroundColor: colors.bgSecondary, borderRadius: 5, marginBottom: 2 }} />
        : <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 2 }}>{total.toLocaleString()}</Text>}
      <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 8 }}>{t(meta.label)}</Text>
      <MiniBarChart data={weekData} color={meta.color} />
      <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 4, textAlign: 'right' }}>{t('8 wks')}</Text>
    </View>
  )
}

function AdminHome() {
  const { colors } = useTheme()
  const t = useT()
  const locale = useLocaleCode()
  const adm = makeAdmStyles(colors)
  const { user, school, activeSession } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const logoUrl = school?.logo ? `${API_BASE}${school.logo}` : null
  const sliderImages = (school?.coverImages?.length ? school.coverImages : school?.coverImage ? [school.coverImage] : []).map(u => `${API_BASE}${u}`)
  const today = new Date().toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })

  useEffect(() => {
    Promise.all([getDashboardStats(activeSession ?? undefined), getWeeklyStats()])
      .then(([s, w]) => { setStats(s); setWeeklyStats(w) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [activeSession])

  useFocusEffect(useCallback(() => {
    getDashboardStats(activeSession ?? undefined).then(setStats).catch(console.error)
  }, [activeSession]))

  const emptyWeek = new Array(8).fill(0)

  return (
    <ScrollView style={adm.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {sliderImages.length > 0
        ? <AutoSlider images={sliderImages} style={adm.band} interval={6500} />
        : <View style={adm.band} />}

      <View style={adm.content}>
        {/* School card */}
        <View style={adm.schoolCard}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={adm.logoImg} />
          ) : (
            <SchoolCrest name={school?.name ?? 'SC'} size={84} />
          )}
          <Text style={adm.schoolName}>{school?.name}</Text>
          <View style={adm.typeBadge}>
            <Text style={adm.typeText}>{school?.type ? `${t(school.type)} ${t('SCHOOL')}` : ''}</Text>
          </View>
          <View style={adm.divider} />
          <Text style={adm.greeting}>
            {t(getGreeting())},{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>{user?.name?.split(' ')[0]}</Text>
          </Text>
          <Text style={adm.dateText}>{today}</Text>
        </View>

        <SetupChecklist />

        {/* Active academic year */}
        {activeSession ? (
          <TouchableOpacity
            onPress={() => router.push('/admin/academic-year' as any)}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Ionicons name="calendar-number-outline" size={18} color="#F03E2F" />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{t('Academic Year')}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{activeSession}</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#F03E2F', fontWeight: '600' }}>{t('Change year')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Weekly trend charts */}
        <Text style={adm.sectionLabel}>{t('WEEKLY TRENDS')}</Text>
        <View style={adm.chartsGrid}>
          {CHART_META.map((meta) => (
            <WeeklyChartCard
              key={meta.key}
              meta={meta}
              weekData={weeklyStats?.[meta.key] ?? emptyWeek}
              total={stats?.[meta.key] ?? 0}
              statsLoading={loading}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

const makeAdmStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  band: { height: 160, backgroundColor: '#1a0605' },
  content: { flex: 1, paddingHorizontal: 20, marginTop: -60 },
  schoolCard: {
    backgroundColor: colors.card, borderRadius: 20, padding: 22,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 6,
  },
  logoImg: {
    width: 84, height: 84, borderRadius: 19,
    borderWidth: 4, borderColor: '#fff',
    marginTop: -42, marginBottom: 14,
  },
  schoolName: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  typeBadge: { marginTop: 6, backgroundColor: '#FEF2F1', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  typeText: { fontSize: 12, fontWeight: '700', color: '#F03E2F', letterSpacing: 1 },
  divider: { width: 40, height: 2, backgroundColor: colors.border, borderRadius: 1, marginVertical: 12 },
  greeting: { fontSize: 14, color: colors.textMuted },
  dateText: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  card: { width: '47%', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  cardIcon: { marginBottom: 10 },
  statValue: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  skeleton: { width: 40, height: 28, backgroundColor: colors.bgSecondary, borderRadius: 6, marginBottom: 4 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1, marginBottom: 10,
  },
  chartsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chartCard: {
    width: '47%', backgroundColor: colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
})

// ── Picks Teacher vs Admin home by role — shared by Primary/Secondary/UniversityHome ──
export default function DashboardHome() {
  const { user } = useAuthStore()
  if (TEACHER_ROLES.includes(user?.role ?? '')) return <TeacherHome />
  return <AdminHome />
}
