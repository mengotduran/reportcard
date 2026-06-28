import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native'
import AutoSlider from '@/components/AutoSlider'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { getDashboardStats, getWeeklyStats, getTeacherChartStats, WeeklyStats, TeacherChartStats } from '@/lib/api/dashboard'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT, useLocaleCode } from '@/lib/i18n'
import { API_BASE } from '@/lib/config'

interface Stats { students: number; teachers: number; reportCards: number; subjects: number }

const TEACHER_ROLES = ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER']

const makeTsStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  band: { height: 140, backgroundColor: '#1a0605' },
  bandOverlay: { flex: 1, backgroundColor: 'rgba(30,58,95,0.55)' },
  logoImg: {
    width: 76, height: 76, borderRadius: 17,
    borderWidth: 4, borderColor: '#fff',
    marginTop: -38, marginBottom: 14,
  },
  content: { flex: 1, paddingHorizontal: 24, marginTop: -60 },
  schoolCard: {
    backgroundColor: colors.card, borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 6,
  },
  crest: {
    backgroundColor: '#1a0605', justifyContent: 'center', alignItems: 'center',
    marginTop: -38, marginBottom: 14,
    shadowColor: '#1a0605', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
    borderWidth: 4, borderColor: '#fff',
  },
  crestInner: { alignItems: 'center', justifyContent: 'center' },
  crestText: { color: '#fff', fontWeight: '900', letterSpacing: 1 },
  schoolName: { fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  typeBadge: {
    marginTop: 6, backgroundColor: '#FEF2F1',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  typeText: { fontSize: 11, fontWeight: '700', color: '#F03E2F', letterSpacing: 1 },
  divider: { width: 40, height: 2, backgroundColor: '#e2e8f0', borderRadius: 1, marginVertical: 16 },
  greeting: { fontSize: 13, color: colors.textMuted },
  teacherName: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginTop: 2, textAlign: 'center' },
  roleLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: '500' },
  dateText: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  classesBtn: {
    backgroundColor: '#F03E2F', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#F03E2F', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  classesBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, flex: 1, textAlign: 'center' },
  classesBtnMaster: {
    backgroundColor: '#7c3aed',
    shadowColor: '#7c3aed',
  },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 14 },
  chartCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  chartCardTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  chartBarLabel: { fontSize: 10, color: colors.textSecondary },
  chartBarBg: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 3 },
}))

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function SchoolCrest({ name, size = 80 }: { name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: '#1a0605', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#fff' }}>
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
  const ts = makeTsStyles(colors)
  const { user, school } = useAuthStore()
  const router = useRouter()
  const [chartStats, setChartStats] = useState<TeacherChartStats | null>(null)
  const [chartLoading, setChartLoading] = useState(true)
  const today = new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const roleLabel = user?.role?.replace('_', ' ') ?? ''
  const logoUrl = school?.logo ? `${API_BASE}${school.logo}` : null
  const sliderImages = (school?.coverImages?.length ? school.coverImages : school?.coverImage ? [school.coverImage] : []).map(u => `${API_BASE}${u}`)

  useEffect(() => {
    getTeacherChartStats()
      .then(setChartStats)
      .catch(() => {})
      .finally(() => setChartLoading(false))
  }, [])
  useFocusEffect(useCallback(() => {
    getTeacherChartStats().then(setChartStats).catch(() => {})
  }, []))

  return (
    <ScrollView style={ts.container} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      {sliderImages.length > 0
        ? <AutoSlider images={sliderImages} style={ts.band} interval={6500} />
        : <View style={ts.band} />}

      <View style={ts.content}>
        <View style={ts.schoolCard}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={ts.logoImg} />
          ) : (
            <SchoolCrest name={school?.name ?? 'SC'} size={76} />
          )}
          <Text style={ts.schoolName}>{school?.name}</Text>
          <View style={ts.typeBadge}>
            <Text style={ts.typeText}>{school?.type} SCHOOL</Text>
          </View>
          <View style={ts.divider} />
          <Text style={ts.greeting}>{getGreeting()},</Text>
          <Text style={ts.teacherName}>{user?.name}</Text>
          <Text style={ts.roleLabel}>{roleLabel}</Text>
          <Text style={ts.dateText}>{today}</Text>
        </View>

        {/* Same WeeklyChartCard as admin — students & subjects */}
        {(() => {
          const studentTotal = chartStats?.studentCounts.reduce((s, c) => s + c.count, 0) ?? 0
          const subjectTotal = chartStats?.subjectCounts.reduce((s, c) => s + c.count, 0) ?? 0
          const studentData = chartStats?.weeklyStudents ?? new Array(8).fill(0)
          const subjectValues = chartStats?.subjectCounts.map(c => c.count) ?? []
          const subjectData = [...new Array(Math.max(0, 8 - subjectValues.length)).fill(0), ...subjectValues].slice(-8)
          return (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <WeeklyChartCard
                meta={{ key: 'students' as const, label: 'My Students', icon: 'people', color: '#F03E2F', bg: '#FEF2F1' }}
                weekData={studentData}
                total={studentTotal}
                statsLoading={chartLoading}
              />
              <WeeklyChartCard
                meta={{ key: 'subjects' as const, label: 'My Subjects', icon: 'book', color: '#ea580c', bg: '#fff7ed' }}
                weekData={subjectData}
                total={subjectTotal}
                statsLoading={chartLoading}
              />
            </View>
          )
        })()}

        <TouchableOpacity style={[ts.classesBtn, user?.role === 'CLASS_MASTER' && ts.classesBtnMaster]} onPress={() => router.push('/(tabs)/report-cards')} activeOpacity={0.85}>
          <Ionicons name={user?.role === 'CLASS_MASTER' ? 'chatbubble-ellipses-outline' : 'school-outline'} size={20} color="#fff" />
          <Text style={ts.classesBtnText}>{user?.role === 'CLASS_MASTER' ? t('Manage Remarks') : t('Enter My Classes')}</Text>
          <Ionicons name="arrow-forward-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <Text style={ts.hint}>{user?.role === 'CLASS_MASTER' ? 'Tap to select a class and add general remarks' : 'Tap to select a class and start entering marks'}</Text>
      </View>
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
            <SchoolCrest name={school?.name ?? 'SC'} size={76} />
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
    width: 76, height: 76, borderRadius: 17,
    borderWidth: 4, borderColor: '#fff',
    marginTop: -38, marginBottom: 14,
  },
  schoolName: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  typeBadge: { marginTop: 6, backgroundColor: '#FEF2F1', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  typeText: { fontSize: 11, fontWeight: '700', color: '#F03E2F', letterSpacing: 1 },
  divider: { width: 40, height: 2, backgroundColor: colors.border, borderRadius: 1, marginVertical: 12 },
  greeting: { fontSize: 13, color: colors.textMuted },
  dateText: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
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

// ── Primary schools: picks Teacher vs Admin home by role ──────────────────
export default function PrimaryHome() {
  const { user } = useAuthStore()
  if (TEACHER_ROLES.includes(user?.role ?? '')) return <TeacherHome />
  return <AdminHome />
}
