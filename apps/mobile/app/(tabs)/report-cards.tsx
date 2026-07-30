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
import { getClasses as getClassesFull } from '@/lib/api/classes'
import { stripProgrammeSuffix } from '@/lib/programme'
import { useProgrammeFilter, ProgrammeChips, EveningBadge } from '@/components/ProgrammeFilter'
import { getDepartments, Department } from '@/lib/api/departments'
import Pagination from '@/components/Pagination'

const stripDeptSuffix = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()
import { getTerms } from '@/lib/api/terms'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
// Rows per request. Small enough that one page is ~90KB rather than the 2.6MB a whole
// session used to ship in a single request (which timed out on a phone network).
const PAGE_SIZE = 30

interface ClassSummary {
  classLevel: string
  total: number
  filled: number
  published: number
  hasSubjects: boolean
  // How many of this class's subjects the signed-in teacher actually teaches. Drives the
  // filter below: without it every teacher saw every class in the school.
  teacherSubjectCount: number
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
    flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0,
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
  rcAverageUnit: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
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
  const { user, school } = useAuthStore()
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isSecondary = school?.type === 'SECONDARY'
  const [term, setTerm] = useState<Term | null>(null)
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeDeptId, setActiveDeptId] = useState('')
  const [classDeptMap, setClassDeptMap] = useState<Record<string, string | null>>({})
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
          teacherSubjectCount: overviews[i].teacherSubjectCount ?? 0,
        }
      })
      // A teacher only sees classes they teach in (mirrors the web). This view is
      // teacher-only — admins are routed to AdminReportCards above — so no admin bypass
      // is needed here. A class master keeps their own class even if they teach nothing
      // in it, so they can still write its general remarks.
      setClasses(summaries.filter((c) => c.teacherSubjectCount > 0 || c.classLevel === user?.masterClassLevel))
      if (isSecondary) {
        const [full, deptRes] = await Promise.all([getClassesFull(), getDepartments()])
        setClassDeptMap(Object.fromEntries(full.classLevels.map((c) => [c.name, c.departmentId ?? null])))
        setDepartments(deptRes.departments)
        setActiveDeptId((prev) => prev || (deptRes.departments.find((d) => d.isDefault) ?? deptRes.departments[0])?.id || '')
      }
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
        // See the admin list below — without flex: 1 this sizes to full content height
        // and squeezes the term banner above it once classes load.
        style={{ flex: 1 }}
        data={isSecondary && activeDeptId ? classes.filter((c) => classDeptMap[c.classLevel] === activeDeptId) : classes}
        keyExtractor={(item) => item.classLevel}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={isSecondary && departments.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ flexDirection: 'row', gap: 8 }}>
            {departments.map((d) => {
              const active = activeDeptId === d.id
              return (
                <TouchableOpacity key={d.id} onPress={() => setActiveDeptId(d.id)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                    borderColor: active ? '#F03E2F' : colors.border, backgroundColor: active ? '#F03E2F' : colors.bgSecondary }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textSecondary }}>{d.name}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        ) : null}
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
                  <Text style={styles.classIconText}>{(isSecondary ? stripDeptSuffix(item.classLevel) : item.classLevel).charAt(0)}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.className}>{isSecondary ? stripDeptSuffix(item.classLevel) : item.classLevel}</Text>
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
  const { activeSession, school } = useAuthStore()
  const isSecondary = school?.type === 'SECONDARY'
  const isUniversity = school?.type === 'UNIVERSITY'
  const [reportCards, setReportCards] = useState<AdminReportCard[]>([])
  // Class rows carry the sitting; this flat list only holds class-name strings.
  const [classDefs, setClassDefs] = useState<{ name: string; programme?: 'DAY' | 'EVENING' }[]>([])
  const programmeFilter = useProgrammeFilter(classDefs)
  const [terms, setTerms] = useState<{ id: string; name: string; session: string; isCurrent: boolean }[]>([])
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [bulkPublishing, setBulkPublishing] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeDeptId, setActiveDeptId] = useState('')
  const [classDeptMap, setClassDeptMap] = useState<Record<string, string | null>>({})
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const listRef = useRef<FlatList<string>>(null)
  // Typing hits the server now, so debounce it rather than firing a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(id)
  }, [search])

  // Only the active academic year's terms.
  const visibleTerms = terms.filter((tm) => tm.session === activeSession)

  // Loads ONE page — the whole session in a single request is ~2.6MB and blew the 15s
  // timeout, which is what surfaced as "Failed to load report cards.". Search goes to
  // the server for the same reason: filtering only the loaded page would search 30 rows
  // and look like missing data.
  // The class rows are the source of truth for the sitting; the table holds only names.
  useEffect(() => { getClassesFull().then((d) => setClassDefs(d.classLevels)).catch(() => {}) }, [])

  const fetchData = useCallback(async (termId?: string | null, searchTerm = '', pageNum = 1) => {
    try {
      setError('')
      // Department -> the classes it owns, sent server-side. Filtering it client-side
      // would only filter the CURRENT page, which can empty a page out while later
      // pages still hold matches.
      const deptClassLevels = isSecondary && activeDeptId
        ? Object.entries(classDeptMap).filter(([, d]) => d === activeDeptId).map(([c]) => c)
        : []
      // Day/Evening goes to the server too, for the same reason the department filter does:
      // this list is one page at a time, so narrowing it client-side reported "no evening
      // students" whenever none of them fell on the page being viewed.
      const sittingClassLevels = programmeFilter.programme === 'ALL'
        ? []
        : classDefs.filter((c) => (c.programme ?? 'DAY') === programmeFilter.programme).map((c) => c.name)
      // Both active -> the intersection, so the two filters narrow rather than fight.
      const classLevelFilter = deptClassLevels.length && sittingClassLevels.length
        ? deptClassLevels.filter((c) => sittingClassLevels.includes(c))
        : deptClassLevels.length ? deptClassLevels : sittingClassLevels
      const [rcData, termData] = await Promise.all([
        getAllReportCards({
          ...(termId ? { termId } : { session: activeSession ?? undefined }),
          ...(classLevelFilter.length > 0 ? { classLevels: classLevelFilter.join(',') } : {}),
          page: pageNum, pageSize: PAGE_SIZE, ...(searchTerm ? { search: searchTerm } : {}),
        }),
        getTerms(),
      ])
      setReportCards(rcData.reportCards as AdminReportCard[])
      setTotalCount(rcData.total)
      setPage(pageNum)
      setTerms(termData.terms)
      if (isSecondary && departments.length === 0) {
        const [full, deptRes] = await Promise.all([getClassesFull(), getDepartments()])
        setClassDeptMap(Object.fromEntries(full.classLevels.map((c) => [c.name, c.departmentId ?? null])))
        setDepartments(deptRes.departments)
        setActiveDeptId((prev) => prev || (deptRes.departments.find((d) => d.isDefault) ?? deptRes.departments[0])?.id || '')
      }
    } catch {
      setError(t('Failed to load report cards.'))
    }
    // activeDeptId/classDeptMap are dependencies because the department filter is now
    // part of the REQUEST, not a post-filter — changing it must refetch from page 1.
    // programme + classDefs are in here so switching the chip refetches from page 1 rather
    // than re-filtering the page already on screen.
  }, [activeSession, isSecondary, departments.length, activeDeptId, classDeptMap, programmeFilter.programme, classDefs])

  // Jump to a specific page — replaces the list rather than appending, and scrolls back
  // to the top so a new page starts where you'd expect to read it.
  const goToPage = useCallback(async (p: number) => {
    setLoading(true)
    await fetchData(selectedTermId, debouncedSearch, p)
    setLoading(false)
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [fetchData, selectedTermId, debouncedSearch])

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
    // setLoading(true) here matters beyond the initial mount: `selectedTermId` also
    // changes once terms load and the effect above auto-selects the current term (see
    // above) — without re-arming loading, the previous (unfiltered, whole-session)
    // `reportCards` stayed on screen looking like the wrong term's data until the
    // filtered refetch quietly resolved underneath.
    setLoading(true)
    fetchData(selectedTermId, debouncedSearch).finally(() => setLoading(false))
  }, [fetchData, selectedTermId, debouncedSearch])

  useFocusEffect(useCallback(() => {
    fetchData(selectedTermId, debouncedSearch)
  }, [fetchData, selectedTermId, debouncedSearch]))

  const handleTermSelect = (id: string) => setSelectedTermId(id || null)

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData(selectedTermId, debouncedSearch)
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
              const names = result.issues.slice(0, 3).map((i) => i.student).join(', ')
              const detail = result.published === 0 && result.issues.length > 0
                ? `\n${t('Still incomplete')}: ${names}${result.issues.length > 3 ? '…' : ''}`
                : ''
              Alert.alert(t('Done'), `${t('Published')}: ${result.published}, ${t('Skipped')}: ${result.skipped}${detail}`)
              fetchData(selectedTermId)
            } catch (e: any) {
              Alert.alert(t('Error'), e?.response?.data?.message || t('Failed to publish.'))
            } finally { setBulkPublishing(null) }
          },
        },
      ]
    )
  }

  // Term, search AND department are all applied SERVER-side now (see fetchData) —
  // re-applying them here would only hide rows the server already matched.
  // No client-side sitting filter: the server already returned only this section.
  const filtered = reportCards

  const grouped: Record<string, AdminReportCard[]> = {}
  for (const rc of filtered) {
    const cl = rc.student.classLevel
    if (!grouped[cl]) grouped[cl] = []
    grouped[cl].push(rc)
  }

  return (
    <View style={styles.container}>
      {/* Day/Evening, above the term chips. Only appears once the school runs an evening
          sitting, so nothing changes for a school with one. */}
      {programmeFilter.hasEvening && (
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <ProgrammeChips
            value={programmeFilter.programme}
            onChange={programmeFilter.setProgramme}
          />
        </View>
      )}
      {/* Term filter (active academic year only) */}
      {visibleTerms.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          <TouchableOpacity onPress={() => handleTermSelect('')}
            style={{ flexShrink: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
              borderColor: !selectedTermId ? '#F03E2F' : colors.border,
              backgroundColor: !selectedTermId ? '#FEF2F1' : colors.card }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: !selectedTermId ? '#F03E2F' : colors.textSecondary }}>
              {t('All Terms')}
            </Text>
          </TouchableOpacity>
          {visibleTerms.map(tm => (
            <TouchableOpacity key={tm.id} onPress={() => handleTermSelect(tm.id)}
              style={{ flexShrink: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                borderColor: selectedTermId === tm.id ? '#F03E2F' : colors.border,
                backgroundColor: selectedTermId === tm.id ? '#FEF2F1' : colors.card }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: selectedTermId === tm.id ? '#F03E2F' : colors.textSecondary }}>
                {tm.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Department filter (secondary) */}
      {isSecondary && departments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 8 }}>
          {departments.map((d) => {
            const active = activeDeptId === d.id
            return (
              <TouchableOpacity key={d.id} onPress={() => setActiveDeptId(d.id)}
                style={{ flexShrink: 0, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                  borderColor: active ? '#F03E2F' : colors.border, backgroundColor: active ? '#F03E2F' : colors.card }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.textSecondary }}>{d.name}</Text>
              </TouchableOpacity>
            )
          })}
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
        // flex: 1 is load-bearing, not cosmetic: without it the list sizes itself to its
        // FULL content height (every class section + card), which overflows this column
        // and squeezes the filter chips above it — they render fine while loading (the
        // spinner is a well-behaved flex:1 view) then collapse the moment data arrives.
        style={{ flex: 1 }}
        data={Object.keys(grouped).sort()}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        ref={listRef}
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
                <Text style={styles.classSectionTitle}>{isSecondary ? stripDeptSuffix(classLevel) : classLevel}</Text>
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
                      <Text style={styles.rcMeta}>{stripProgrammeSuffix(rc.student.classLevel)} · {rc.term.name}</Text>
                      {programmeFilter.programmeOf(rc.student.classLevel) === 'EVENING' && <EveningBadge />}
                    </View>
                    <View style={styles.rcRight}>
                      {/* A university's `average` is a weighted mark out of 100, which
                          reads as a broken /20 average here — show its semester GPA
                          instead. Primary/secondary keep the /20 average. */}
                      {isUniversity ? (
                        rc.gpa != null && (
                          <Text style={styles.rcAverage}>{rc.gpa.toFixed(2)}<Text style={styles.rcAverageUnit}> {t('GPA')}</Text></Text>
                        )
                      ) : rc.average != null && (
                        <Text style={styles.rcAverage}>{rc.average.toFixed(1)}<Text style={styles.rcAverageUnit}>/20</Text></Text>
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

      {/* Page controls, mirroring the web table's pager. Sits outside the list so it
          stays pinned at the bottom rather than scrolling away with the rows. */}
      {!loading && !error && (
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
          total={totalCount}
          pageSize={PAGE_SIZE}
          onPage={goToPage}
        />
      )}
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
