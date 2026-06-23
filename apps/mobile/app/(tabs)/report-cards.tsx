// app/(tabs)/report-cards.tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, TextInput, ScrollView, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getCurrentTerm, getClassLevels, getClassOverview, getAllReportCards, bulkPublish, ReportCardSummary, Term } from '@/lib/api/reportcards'
import { getTerms } from '@/lib/api/terms'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']

interface ClassSummary {
  classLevel: string
  total: number
  filled: number
  published: number
  hasSubjects: boolean
}

interface AdminReportCard extends ReportCardSummary {
  marksEditGrantedTo: string | null
  remarksEditGrantedTo: string | null
}

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  termBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F1', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FEE2E0',
  },
  termText: { fontSize: 13, color: '#F03E2F', fontWeight: '600' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  classIcon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: '#FEE2E0',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  classIconText: { color: '#F03E2F', fontWeight: 'bold', fontSize: 18 },
  cardInfo: { flex: 1 },
  className: { fontSize: 16, fontWeight: '700', color: colors.text },
  classMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  progressBg: { height: 6, backgroundColor: colors.bgSecondary, borderRadius: 3, marginBottom: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#F03E2F', borderRadius: 3 },
  cardMaster: { borderColor: '#ede9fe' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statFilled: { fontSize: 12, color: '#F03E2F', fontWeight: '600' },
  statPublished: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  statPending: { fontSize: 12, color: '#f59e0b', fontWeight: '600' },
  errorText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, backgroundColor: colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: 'transparent' },
  classSection: { marginBottom: 16 },
  classSectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4,
  },
  rcCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    gap: 10,
  },
  rcAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E0',
    justifyContent: 'center', alignItems: 'center',
  },
  rcAvatarText: { color: '#F03E2F', fontWeight: '700', fontSize: 16 },
  rcInfo: { flex: 1 },
  rcName: { fontSize: 14, fontWeight: '600', color: colors.text },
  rcMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rcRight: { alignItems: 'flex-end', gap: 4 },
  rcAverage: { fontSize: 16, fontWeight: '800', color: colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  publishedBadge: { backgroundColor: '#dcfce7' },
  draftBadge: { backgroundColor: '#fef9c3' },
  statusText: { fontSize: 11, fontWeight: '600' },
}))

function TeacherReportCards() {
  const { colors } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const router = useRouter()
  const { user } = useAuthStore()
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const [term, setTerm] = useState<Term | null>(null)
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setError('')
      const { term: currentTerm } = await getCurrentTerm()
      setTerm(currentTerm)
      const { classLevels } = await getClassLevels()
      const overviews = await Promise.all(classLevels.map((cl) => getClassOverview(currentTerm.id, cl)))
      const summaries: ClassSummary[] = classLevels.map((cl, i) => {
        const students = overviews[i].students
        const subjectCount = overviews[i].subjectCount ?? 0
        return {
          classLevel: cl,
          total: students.length,
          filled: students.filter((s) => s.reportCard?.marksFilled === true).length,
          published: students.filter((s) => s.reportCard?.status === 'PUBLISHED').length,
          hasSubjects: subjectCount > 0,
        }
      })
      setClasses(summaries)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setError(t('No active term set. Please set a current term from the web app.'))
      } else {
        setError(t('Failed to load data.'))
      }
    }
  }, [])

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  useFocusEffect(useCallback(() => {
    fetchData()
  }, [fetchData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#f59e0b" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : <>
      {term && (
        <View style={styles.termBanner}>
          <Ionicons name="calendar-outline" size={14} color="#F03E2F" />
          <Text style={styles.termText}>{term.name} · {term.session}</Text>
        </View>
      )}
      <FlatList
        data={classes}
        keyExtractor={(item) => item.classLevel}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="people-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>{t('No classes found. Add students first.')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const pending = item.total - item.filled
          const progress = item.total > 0 ? item.filled / item.total : 0
          return (
            <TouchableOpacity
              style={[styles.card, isClassMaster && styles.cardMaster]}
              onPress={() => router.push(`/class/${encodeURIComponent(item.classLevel)}?termId=${term?.id}&termName=${encodeURIComponent(term?.name ?? '')}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.classIcon}>
                  <Text style={styles.classIconText}>{item.classLevel.charAt(0)}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.className}>{item.classLevel}</Text>
                  <Text style={styles.classMeta}>{item.total} {item.total !== 1 ? t('students') : t('student')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </View>
              {/* Only show progress and stats if the class has subjects */}
              {item.hasSubjects && (
                <>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
                  </View>
                  <View style={styles.statsRow}>
                    <Text style={styles.statFilled}>{item.filled} {t('filled')}</Text>
                    {pending > 0 && <Text style={styles.statPending}>{pending} {t('pending')}</Text>}
                    {isClassMaster && <Text style={styles.statPublished}>{item.published} {t('published')}</Text>}
                  </View>
                </>
              )}
            </TouchableOpacity>
          )
        }}
      /></>}
    </View>
  )
}

function AdminReportCards() {
  const { colors } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const router = useRouter()
  const { activeSession } = useAuthStore()
  const [reportCards, setReportCards] = useState<AdminReportCard[]>([])
  const [terms, setTerms] = useState<{ id: string; name: string; session: string; isCurrent: boolean }[]>([])
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [bulkPublishing, setBulkPublishing] = useState<string | null>(null)

  // Only the active academic year's terms.
  const visibleTerms = terms.filter((tm) => tm.session === activeSession)

  const fetchData = useCallback(async (termId?: string | null) => {
    try {
      setError('')
      const [rcData, termData] = await Promise.all([
        getAllReportCards(termId ? { termId } : { session: activeSession ?? undefined }),
        getTerms(),
      ])
      setReportCards(rcData.reportCards as AdminReportCard[])
      setTerms(termData.terms)
    } catch {
      setError(t('Failed to load report cards.'))
    }
  }, [activeSession])

  // Default the selected term to the active year's live term — once per year, so
  // a manual "All Terms" choice isn't reset every refresh.
  const initializedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!activeSession || !terms.length) return
    const yearTerms = terms.filter((tm) => tm.session === activeSession)
    if (selectedTermId && !yearTerms.some((tm) => tm.id === selectedTermId)) {
      setSelectedTermId(null); initializedFor.current = null; return
    }
    if (initializedFor.current !== activeSession) {
      initializedFor.current = activeSession
      setSelectedTermId(yearTerms.find((tm) => tm.isCurrent)?.id ?? null)
    }
  }, [activeSession, terms])

  useEffect(() => {
    fetchData(selectedTermId).finally(() => setLoading(false))
  }, [fetchData, selectedTermId])

  useFocusEffect(useCallback(() => {
    fetchData(selectedTermId)
  }, [fetchData, selectedTermId]))

  const handleTermSelect = (id: string) => setSelectedTermId(id || null)

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData(selectedTermId)
    setRefreshing(false)
  }

  const handleBulkPublish = (classLevel: string) => {
    if (!selectedTermId) { Alert.alert(t('No term selected')); return }
    Alert.alert(
      t('Publish All'),
      `${t('Publish all eligible report cards for')} ${classLevel}?`,
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Publish'),
          onPress: async () => {
            setBulkPublishing(classLevel)
            try {
              const result = await bulkPublish(classLevel, selectedTermId)
              Alert.alert(t('Done'), `${t('Published')}: ${result.published}, ${t('Skipped')}: ${result.skipped}`)
              fetchData(selectedTermId)
            } catch (e: any) {
              Alert.alert(t('Error'), e?.response?.data?.message || t('Failed to publish.'))
            } finally { setBulkPublishing(null) }
          },
        },
      ]
    )
  }

  const filtered = reportCards.filter((rc) => {
    const termMatch = !selectedTermId || rc.term.id === selectedTermId
    const q = search.toLowerCase()
    return termMatch && (
      rc.student.name.toLowerCase().includes(q) ||
      rc.student.classLevel.toLowerCase().includes(q) ||
      rc.term.name.toLowerCase().includes(q)
    )
  })

  const grouped: Record<string, AdminReportCard[]> = {}
  for (const rc of filtered) {
    const cl = rc.student.classLevel
    if (!grouped[cl]) grouped[cl] = []
    grouped[cl].push(rc)
  }

  return (
    <View style={styles.container}>
      {/* Term filter (active academic year only) */}
      {visibleTerms.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          <TouchableOpacity onPress={() => handleTermSelect('')}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
              borderColor: !selectedTermId ? '#F03E2F' : colors.border,
              backgroundColor: !selectedTermId ? '#FEF2F1' : colors.card }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: !selectedTermId ? '#F03E2F' : colors.textSecondary }}>
              {t('All Terms')}
            </Text>
          </TouchableOpacity>
          {visibleTerms.map(tm => (
            <TouchableOpacity key={tm.id} onPress={() => handleTermSelect(tm.id)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                borderColor: selectedTermId === tm.id ? '#F03E2F' : colors.border,
                backgroundColor: selectedTermId === tm.id ? '#FEF2F1' : colors.card }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: selectedTermId === tm.id ? '#F03E2F' : colors.textSecondary }}>
                {tm.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('Search by name, class or term...')}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9ca3af"
          backgroundColor="transparent"
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#f59e0b" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : <FlatList
        data={Object.keys(grouped).sort()}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>{t('No report cards found')}</Text>
          </View>
        }
        renderItem={({ item: classLevel }) => {
          const cards = grouped[classLevel]
          const unpublishedCount = cards.filter(rc => rc.status !== 'PUBLISHED').length
          return (
            <View style={styles.classSection}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.classSectionTitle}>{classLevel}</Text>
                {unpublishedCount > 0 && selectedTermId && (
                  <TouchableOpacity
                    onPress={() => handleBulkPublish(classLevel)}
                    disabled={bulkPublishing === classLevel}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#16a34a', opacity: bulkPublishing === classLevel ? 0.5 : 1 }}>
                    {bulkPublishing === classLevel
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="send-outline" size={11} color="#fff" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{t('Publish All')}</Text></>
                    }
                  </TouchableOpacity>
                )}
              </View>
              {cards.map((rc) => {
                const isPublished = rc.status === 'PUBLISHED'
                return (
                  <TouchableOpacity
                    key={rc.id}
                    style={styles.rcCard}
                    onPress={() => router.push(`/admin/report-card/${rc.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rcAvatar}>
                      <Text style={styles.rcAvatarText}>{rc.student.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.rcInfo}>
                      <Text style={styles.rcName}>{rc.student.name}</Text>
                      <Text style={styles.rcMeta}>{rc.term.name} · {rc.term.session}</Text>
                    </View>
                    <View style={styles.rcRight}>
                      {rc.average != null && (
                        <Text style={styles.rcAverage}>{rc.average.toFixed(1)}</Text>
                      )}
                      <View style={[styles.statusBadge, isPublished ? styles.publishedBadge : styles.draftBadge]}>
                        <Text style={[styles.statusText, { color: isPublished ? '#16a34a' : '#92400e' }]}>
                          {isPublished ? t('Published') : t('Draft')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        }}
      />}
    </View>
  )
}

export default function ReportCardsScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const { user } = useAuthStore()
  if (user?.role === 'SUPERADMIN') return <View style={{ flex: 1, backgroundColor: colors.bgSecondary }} />
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')
  if (isAdmin) return <AdminReportCards />
  return <TeacherReportCards />
}
