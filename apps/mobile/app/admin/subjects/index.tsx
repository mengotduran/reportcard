// app/admin/subjects/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, FlatList, ScrollView,} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getSubjects, createSubject, deleteSubject, getSubjectDeleteImpact, getSubjectExclusions, setSubjectExclusions, Subject, SubjectDeleteImpact, SubjectExclusions } from '@/lib/api/subjects'
import { stripProgrammeSuffix } from '@/lib/programme'
import { levelGroupOf, programmeOf as progNameOf, sortLevelGroups } from '@/lib/universityLevels'
import { useProgrammeFilter, ProgrammeChips, EveningBadge } from '@/components/ProgrammeFilter'
import { getClasses, ClassLevel } from '@/lib/api/classes'
import { getDepartments, Department } from '@/lib/api/departments'
import { getTerms, Term } from '@/lib/api/terms'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

// `classLevel` is carried alongside the composed title so the header can badge the sitting.
// The GROUPING key stays the raw name: stripping the marker there would merge a day and an
// evening department into one section and hide half the courses.
interface SectionData { title: string; classLevel: string; data: Subject[] }

const stripDeptSuffix = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  backBtn: { padding: 6, borderRadius: 8 },
  stepTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  stepSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sectionHeader: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 6,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF2F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1 },
  subjectName: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: 7, backgroundColor: '#fee2e2', borderRadius: 9 },
  delName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  delMuted: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  delError: { fontSize: 13, color: '#ef4444', marginBottom: 12 },
  delWarn: { backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 12 },
  delWarnTitle: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },
  delWarnBody: { fontSize: 11, color: '#b91c1c', marginTop: 4 },
  delTypeName: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  delActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  delCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  delCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  delConfirm: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center' },
  delConfirmOff: { opacity: 0.4 },
  delConfirmText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  emptySubText: { fontSize: 13, color: colors.textMuted },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F03E2F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F03E2F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  required: { color: '#ef4444' },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  optionalChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(240,62,47,0.25)', backgroundColor: '#FEF2F1' },
  optionalChipText: { fontSize: 10, fontWeight: '700', color: '#F03E2F' },
  exclRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  exclName: { fontSize: 14, fontWeight: '600', color: colors.text },
  exclId: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  // Compulsory toggle: a row you tap anywhere on, since a bare RN checkbox has no label
  // hit area of its own.
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkBoxOn: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  checkTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  checkSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 14,
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  pickerText: { fontSize: 14, color: colors.text },
  dropdownList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.card,
    marginBottom: 14,
    overflow: 'hidden',
  },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownItemText: { fontSize: 14, color: colors.text },
  row: { flexDirection: 'row' },
  createBtn: {
    backgroundColor: '#F03E2F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

export default function SubjectsScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const { school, activeSession, user } = useAuthStore()
  const router = useRouter()
  // Marks entry from the course list, same scope as the web Courses page: an admin, at a
  // university where the administration records marks. Teachers keep their own route.
  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  const canEnterMarksHere = school?.type === 'UNIVERSITY' && isAdminRole && school?.marksEntryMode === 'ADMIN_ONLY'
  const isUniversity = school?.type === 'UNIVERSITY'
  // Universities call subjects "courses" and classes "departments" — same data/routes, just different wording.
  const tt = (subjectStr: string, courseStr: string) => t(isUniversity ? courseStr : subjectStr)
  const isSecondary = school?.type === 'SECONDARY'
  const tc = (classStr: string, deptStr: string) => t(isUniversity ? deptStr : classStr)
  const [sections, setSections] = useState<SectionData[]>([])
  // The raw list, so each step of the drill-down can count and filter from it. `sections`
  // stays for the final course list.
  const [allSubjects, setAllSubjects] = useState<Subject[]>([])
  // Where you are in the drill-down, mirroring the web Courses page:
  //   university  Level -> Department -> Semester -> Courses
  //   secondary   Department -> Class -> Subjects
  //   primary     Class -> Subjects
  // A flat list of every course at once was unreadable on a phone, and on a university it
  // showed each programme twice over once evening sections existed.
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null)
  // Deleting a course deletes every mark on it. Same gate as the web Courses page: the
  // counts come from the server, and once marks exist the name has to be typed.
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<SubjectDeleteImpact | null>(null)
  const [impactError, setImpactError] = useState('')
  const [typedName, setTypedName] = useState('')
  const [deletingSubject, setDeletingSubject] = useState(false)
  const [classList, setClassList] = useState<ClassLevel[]>([])
  // Day/Evening. A university keeps a separate copy of the curriculum per sitting, so an
  // unfiltered list shows every course twice under two identical-looking headings.
  const programmeFilter = useProgrammeFilter(classList)
  const [departments, setDepartments] = useState<Department[]>([])
  const [termList, setTermList] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [subjectName, setSubjectName] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [term, setTerm] = useState('')
  const [coefficient, setCoefficient] = useState('1')
  const [code, setCode] = useState('')
  // A department is a fixed course list, so this starts ticked; unticking is the
  // deliberate exception. See SubjectExclusion on the API side.
  const [compulsory, setCompulsory] = useState(true)
  const [credit, setCredit] = useState('')
  const [requiredHours, setRequiredHours] = useState('')

  // "Students not taking this course" sheet. University + optional courses only.
  const [exclFor, setExclFor] = useState<Subject | null>(null)
  const [exclData, setExclData] = useState<SubjectExclusions | null>(null)
  const [exclPicked, setExclPicked] = useState<Set<string>>(new Set())
  const [exclSearch, setExclSearch] = useState('')
  const [exclSaving, setExclSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [classPickerOpen, setClassPickerOpen] = useState(false)
  const [termPickerOpen, setTermPickerOpen] = useState(false)

  // University: a course belongs to one semester, so group/label sections by
  // department + semester (see Subject.term in schema.prisma). Other types:
  // group by class only, exactly as before.
  const buildSections = (subjects: Subject[], deptOfClass: (name: string) => string): SectionData[] => {
    const map: Record<string, Subject[]> = {}
    const keyOf = (s: Subject) =>
      isUniversity ? `${s.classLevel} — ${s.term ?? t('No semester')}`
      : isSecondary ? `${deptOfClass(s.classLevel) || '—'} · ${stripDeptSuffix(s.classLevel)}`
      : s.classLevel
    for (const s of subjects) {
      const key = keyOf(s)
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return Object.keys(map).sort().map((key) => ({
      // Stripped for display only. The key it was built from keeps the marker, so the two
      // sittings stay separate sections even though they now read the same.
      title: stripProgrammeSuffix(key),
      classLevel: map[key][0]?.classLevel ?? '',
      data: map[key],
    }))
  }

  const fetchData = useCallback(async () => {
    try {
      const [subData, clData, termData, deptData] = await Promise.all([
        getSubjects(), getClasses(), getTerms(),
        isSecondary ? getDepartments() : Promise.resolve({ departments: [] as Department[] }),
      ])
      setClassList(clData.classLevels.sort((a, b) => a.order - b.order))
      setDepartments(deptData.departments)
      // Distinct semester names within the active academic session.
      const seen = new Set<string>()
      setTermList(termData.terms.filter((tm) => tm.session === activeSession && !seen.has(tm.name) && seen.add(tm.name)))

      const deptById = new Map(deptData.departments.map((d) => [d.id, d.name]))
      const deptIdByClass = new Map(clData.classLevels.map((c) => [c.name, c.departmentId]))
      const deptOfClass = (name: string) => {
        const id = deptIdByClass.get(name)
        return id ? (deptById.get(id) ?? '') : ''
      }
      setAllSubjects(subData.subjects)
      setSections(buildSections(subData.subjects, deptOfClass))
    } catch {
      Alert.alert(t('Error'), tt('Failed to load subjects.', 'Failed to load courses.'))
    }
  }, [activeSession, isUniversity, isSecondary])

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false))
  }, [fetchData]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  useEffect(() => {
    if (!exclFor) { setExclData(null); setExclSearch(''); return }
    setExclData(null)
    setExclSearch('')
    getSubjectExclusions(exclFor.id)
      .then((d) => { setExclData(d); setExclPicked(new Set(d.excludedStudentIds)) })
      .catch(() => Alert.alert(t('Error'), t('Could not load the class list.')))
  }, [exclFor])

  /** The checklist, narrowed by the search box. Ticks live in `exclPicked`, not here, so a
   *  student filtered out of view stays selected. */
  const visibleExclStudents = (exclData?.students ?? []).filter((st) => {
    const q = exclSearch.trim().toLowerCase()
    if (!q) return true
    return st.name.toLowerCase().includes(q) || st.studentId.toLowerCase().includes(q)
  })

  const saveExclusions = async () => {
    if (!exclFor || !exclData) return
    // Ticking a student who has marks DELETES those marks. Say so plainly first — this is
    // the only warning before they are gone.
    const losing = exclData.students.filter(
      (st) => exclPicked.has(st.id) && exclData.markedStudentIds.includes(st.id),
    )
    const commit = async () => {
      setExclSaving(true)
      try {
        const r = await setSubjectExclusions(exclFor.id, [...exclPicked])
        setExclFor(null)
        await fetchData()
        if (r.deletedMarks > 0) Alert.alert(t('Saved'), `${r.deletedMarks} ${t('mark(s) deleted.')}`)
      } catch (err: any) {
        Alert.alert(t('Error'), err?.response?.data?.message ?? t('Could not save.'))
      } finally {
        setExclSaving(false)
      }
    }
    if (losing.length > 0) {
      Alert.alert(
        t('Delete their marks?'),
        `${t('This will permanently delete this course\'s marks for')} ${losing.map((x) => x.name).join(', ')}. ${t('This cannot be undone.')}`,
        [{ text: t('Cancel'), style: 'cancel' }, { text: t('Delete'), style: 'destructive', onPress: commit }],
      )
      return
    }
    commit()
  }

  const handleCreate = async () => {
    if (!subjectName.trim() || !classLevel || (isUniversity ? (!term || !credit || !code.trim()) : false)) {
      Alert.alert(t('Validation'), isUniversity ? t('Course name, code, department, semester and credit are required.') : t('Subject name and class level are required.'))
      return
    }
    setCreating(true)
    try {
      await createSubject({
        name: subjectName.trim(),
        classLevel,
        // Universities don't enter a separate coefficient — credit hours double as
        // the weight in the average, same value the seed already uses for this.
        coefficient: isUniversity ? (Number(credit) || 1) : (Number(coefficient) || 1),
        ...(isUniversity ? { term, credit: Number(credit), code: code.trim().toUpperCase(), compulsory } : {}),
        requiredHours: requiredHours === '' ? null : Number(requiredHours),
      })
      setModalVisible(false)
      setSubjectName('')
      setClassLevel('')
      setTerm('')
      setCoefficient('1')
      setCredit('')
      setCode('')
      setCompulsory(true)
      setRequiredHours('')
      await fetchData()
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message ?? tt('Failed to create subject.', 'Failed to create course.'))
    } finally {
      setCreating(false)
    }
  }

  const openDelete = async (subject: Subject) => {
    setDeleteTarget(subject)
    setDeleteImpact(null)
    setImpactError('')
    setTypedName('')
    try {
      setDeleteImpact(await getSubjectDeleteImpact(subject.id))
    } catch {
      setImpactError(t('Could not check what deleting this would remove. Try again.'))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeletingSubject(true)
    try {
      await deleteSubject(deleteTarget.id, deleteTarget.name)
      setDeleteTarget(null)
      setDeleteImpact(null)
      setTypedName('')
      await fetchData()
    } catch (err: any) {
      // The refusal names the marks and the class it is in. A fixed string here would leave
      // the admin guessing at a rule they cannot see.
      setImpactError(err?.response?.data?.message ?? tt('Failed to delete subject.', 'Failed to delete course.'))
    } finally { setDeletingSubject(false) }
  }

  // Label a class in the picker: strip the department suffix and tag its
  // department (secondary), so identically-named classes across departments
  // are distinguishable.
  const classPickerLabel = (name: string): string => {
    if (!isSecondary) return name
    const cl = classList.find((c) => c.name === name)
    const dep = cl?.departmentId ? departments.find((d) => d.id === cl.departmentId)?.name : ''
    return dep ? `${stripDeptSuffix(name)} · ${dep}` : stripDeptSuffix(name)
  }

  // ── Drill-down steps ───────────────────────────────────────────────────────
  // Mirrors the web Courses page exactly, so the mental model is the same on both.
  const countFor = (pred: (s: Subject) => boolean) => allSubjects.filter(pred).length

  const StepHeader = ({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) => (
    <View style={styles.stepHeader}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepSubtitle}>{subtitle}</Text>
      </View>
    </View>
  )

  const StepCard = ({ label, meta, badge, onPress }: { label: string; meta: string; badge?: boolean; onPress: () => void }) => (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.iconBox}>
        <Ionicons name="layers-outline" size={18} color="#F03E2F" />
      </View>
      <View style={styles.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={styles.subjectName}>{label}</Text>
          {badge && <EveningBadge />}
        </View>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  )

  // 1. Level (university only)
  if (!loading && isUniversity && !selectedLevel) {
    const sittingClasses = classList.filter((c) => programmeFilter.matches(c.name))
    const groups = Array.from(new Set(sittingClasses.map((c) => levelGroupOf(c.name)))).sort(sortLevelGroups)
    return (
      <View style={styles.container}>
        <StepHeader title={t('Courses')} subtitle={t('Select a level, then a department, to manage its courses')} />
        {programmeFilter.hasEvening && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <ProgrammeChips value={programmeFilter.programme} onChange={programmeFilter.setProgramme} />
          </View>
        )}
        <FlatList
          data={groups}
          keyExtractor={(g) => g}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="layers-outline" size={48} color="#d1d5db" /><Text style={styles.emptyText}>{t('No departments found.')}</Text></View>}
          renderItem={({ item: g }) => {
            const inGroup = sittingClasses.filter((c) => levelGroupOf(c.name) === g)
            const n = countFor((s) => inGroup.some((c) => c.name === s.classLevel))
            return <StepCard label={t(g)} meta={`${inGroup.length} ${t('departments')} · ${n} ${t('courses')}`} onPress={() => setSelectedLevel(g)} />
          }}
        />
      </View>
    )
  }

  // 2. Department (secondary only)
  if (!loading && isSecondary && !selectedDeptId) {
    return (
      <View style={styles.container}>
        <StepHeader title={tt('Subjects', 'Courses')} subtitle={t('Select a department, then a class, to manage its subjects')} />
        <FlatList
          data={departments}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="layers-outline" size={48} color="#d1d5db" /><Text style={styles.emptyText}>{t('No departments found.')}</Text></View>}
          renderItem={({ item: d }) => {
            const depClasses = classList.filter((c) => c.departmentId === d.id)
            const n = countFor((s) => depClasses.some((c) => c.name === s.classLevel))
            return <StepCard label={d.name} meta={`${depClasses.length} ${t('classes')} · ${n} ${tt('subjects', 'courses')}`} onPress={() => setSelectedDeptId(d.id)} />
          }}
        />
      </View>
    )
  }

  // 3. Class / department
  if (!loading && !selectedClass) {
    const pickerClasses = (isSecondary
      ? classList.filter((c) => c.departmentId === selectedDeptId)
      : isUniversity
        ? classList.filter((c) => levelGroupOf(c.name) === selectedLevel)
        : classList
    // The sitting filter belongs on THIS step as much as the level one: without it the
    // Evening chip listed every day department too, and the card label strips the marker,
    // so the same programme appeared twice with nothing to tell the two apart.
    ).filter((c) => programmeFilter.matches(c.name))
    return (
      <View style={styles.container}>
        <StepHeader
          title={isSecondary ? (departments.find((d) => d.id === selectedDeptId)?.name ?? '') : isUniversity ? t(selectedLevel ?? 'Courses') : tt('Subjects', 'Courses')}
          subtitle={isUniversity ? t('Select a department to manage its courses') : t('Select a class to manage its subjects')}
          onBack={isSecondary ? () => setSelectedDeptId(null) : isUniversity ? () => setSelectedLevel(null) : undefined}
        />
        {programmeFilter.hasEvening && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <ProgrammeChips value={programmeFilter.programme} onChange={programmeFilter.setProgramme} />
          </View>
        )}
        <FlatList
          data={pickerClasses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="book-outline" size={48} color="#d1d5db" /><Text style={styles.emptyText}>{tc('No classes found.', 'No departments found.')}</Text></View>}
          renderItem={({ item: c }) => {
            const n = countFor((s) => s.classLevel === c.name)
            return (
              <StepCard
                label={stripProgrammeSuffix(isSecondary ? stripDeptSuffix(c.name) : isUniversity ? progNameOf(c.name) : c.name)}
                meta={n === 0 ? tt('No subjects yet', 'No courses yet') : `${n} ${n === 1 ? tt('subject', 'course') : tt('subjects', 'courses')}`}
                badge={programmeFilter.programmeOf(c.name) === 'EVENING'}
                onPress={() => { setSelectedClass(c.name); setSelectedTerm(null) }}
              />
            )
          }}
        />
      </View>
    )
  }

  // 4. Semester (university only)
  if (!loading && isUniversity && !selectedTerm) {
    return (
      <View style={styles.container}>
        <StepHeader
          title={stripProgrammeSuffix(progNameOf(selectedClass ?? ''))}
          subtitle={t('Select a semester to manage its courses')}
          onBack={() => setSelectedClass(null)}
        />
        <FlatList
          data={termList}
          keyExtractor={(tm) => tm.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="calendar-outline" size={48} color="#d1d5db" /><Text style={styles.emptyText}>{t('No semesters found for the active academic year.')}</Text></View>}
          renderItem={({ item: tm }) => {
            const n = countFor((s) => s.classLevel === selectedClass && s.term === tm.name)
            return (
              <StepCard
                label={`${tm.name}${tm.isCurrent ? ` (${t('Current')})` : ''}`}
                meta={n === 0 ? t('No courses yet') : `${n} ${n === 1 ? t('course') : t('courses')}`}
                onPress={() => setSelectedTerm(tm.name)}
              />
            )
          }}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F03E2F" />
        </View>
      ) : (
      <>
      <StepHeader
        title={stripProgrammeSuffix(isUniversity ? progNameOf(selectedClass ?? '') : isSecondary ? stripDeptSuffix(selectedClass ?? '') : (selectedClass ?? ''))}
        subtitle={[
          isUniversity && selectedTerm ? selectedTerm : '',
          programmeFilter.programmeOf(selectedClass ?? '') === 'EVENING' ? t('Evening') : '',
        ].filter(Boolean).join(' · ') || tt('Subjects', 'Courses')}
        onBack={() => { if (isUniversity) setSelectedTerm(null); else setSelectedClass(null) }}
      />
      <SectionList
        // Only the class and semester chosen in the steps above, so the header is the
        // answer to "which sitting am I editing" rather than a list of every one at once.
        sections={sections.filter((sec) =>
          sec.classLevel === selectedClass
          && (!isUniversity || !selectedTerm || sec.data.some((sub) => sub.term === selectedTerm)))
          .map((sec) => ({ ...sec, data: isUniversity && selectedTerm ? sec.data.filter((sub) => sub.term === selectedTerm) : sec.data }))}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{tt('No subjects yet', 'No courses yet')}</Text>
            <Text style={styles.emptySubText}>{tt('Tap + to add a subject', 'Tap + to add a course')}</Text>
          </View>
        }
        renderSectionHeader={({ section }) => {
          // Badge the running semester's sections: First and Second look interchangeable,
          // and marks entered against the wrong one surface only much later.
          const activeName = termList.find(tm => tm.isCurrent)?.name
          const isActive = !!activeName && section.title.endsWith(`— ${activeName}`)
          return (
            <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }]}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {programmeFilter.programmeOf(section.classLevel) === 'EVENING' && <EveningBadge />}
              {isActive && (
                <View style={{ backgroundColor: '#FEF2F1', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(240,62,47,0.25)' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#F03E2F' }}>{t('ACTIVE')}</Text>
                </View>
              )}
            </View>
          )
        }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Ionicons name="book-outline" size={18} color="#F03E2F" />
            </View>
            <View style={styles.info}>
              <Text style={styles.subjectName}>{item.name}</Text>
              <Text style={styles.meta}>
                {t('Max:')} {item.maxScore} · {isUniversity ? `${t('Credit:')} ${item.credit ?? '—'}` : `${t('Coeff:')} ${item.coefficient}`}
                {item.requiredHours != null ? ` · ${t('Hours:')} ${item.requiredHours}` : ''}
              </Text>
              {/* Only an optional course can have anyone ticked off it, so the affordance
                  only exists where it means something. */}
              {isUniversity && item.compulsory === false && (
                <TouchableOpacity style={styles.optionalChip} activeOpacity={0.7} onPress={() => setExclFor(item)}>
                  <Ionicons name="people-outline" size={12} color="#F03E2F" />
                  <Text style={styles.optionalChipText}>
                    {(item.excludedCount ?? 0) > 0
                      ? `${item.excludedCount} ${t('not taking')}`
                      : t('Optional')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {canEnterMarksHere && item.term && termList.some(tm => tm.name === item.term) && (
              <TouchableOpacity
                style={{ paddingHorizontal: 8, paddingVertical: 6, marginRight: 2 }}
                onPress={() => {
                  const tm = termList.find(x => x.name === item.term)!
                  router.push(`/marks/${encodeURIComponent(item.id)}?classLevel=${encodeURIComponent(item.classLevel)}&termId=${tm.id}&termName=${encodeURIComponent(tm.name)}&subjectName=${encodeURIComponent(item.name)}&sequence=0` as any)
                }}>
                <Ionicons name="create-outline" size={18} color="#F03E2F" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.deleteBtn} onPress={() => openDelete(item)}>
              <Ionicons name="trash-outline" size={17} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      />
      </>
      )}

      {/* Pre-filled from the steps already walked, so the class and semester are not asked
          for twice. Both stay editable in the modal. */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (selectedClass) setClassLevel(selectedClass)
          if (isUniversity && selectedTerm) setTerm(selectedTerm)
          setModalVisible(true)
        }}
        activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Course delete. Not an Alert: it states what it destroys and takes a typed name once
          marks exist, and Alert.prompt is iOS only. */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tt('Delete Subject', 'Delete Course')}</Text>
              <TouchableOpacity onPress={() => { setDeleteTarget(null); setTypedName('') }}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.delName}>{deleteTarget?.name}</Text>
            {/* Names the class it is being deleted FROM, marker and all. A day and an evening
                department hold same-named courses, and this is the last screen before the
                other sitting's marks are gone. */}
            <Text style={styles.delMuted}>
              {tc('In class', 'In department')}: {deleteTarget?.classLevel}
              {deleteTarget?.term ? ` · ${deleteTarget.term}` : ''}
            </Text>

            {impactError ? (
              <Text style={styles.delError}>{impactError}</Text>
            ) : !deleteImpact ? (
              <Text style={styles.delMuted}>{t('Checking what this would remove…')}</Text>
            ) : (
              <>
                {deleteImpact.marks > 0 ? (
                  <View style={styles.delWarn}>
                    <Text style={styles.delWarnTitle}>
                      {deleteImpact.marks} {t(deleteImpact.marks === 1 ? 'mark' : 'marks')}
                      {deleteImpact.students > 0 ? `, ${deleteImpact.students} ${t(deleteImpact.students === 1 ? 'student' : 'students')}` : ''}
                    </Text>
                    <Text style={styles.delWarnBody}>
                      {t('Deleting this course deletes every mark entered on it. Those students lose it from their report cards and it cannot be brought back.')}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.delMuted}>
                    {t('No marks have been entered on it yet, so nothing is lost but the course itself.')}
                  </Text>
                )}

                {(deleteImpact.assignments > 0 || deleteImpact.slots > 0) && (
                  <Text style={styles.delMuted}>
                    {t('It also comes off')}{' '}
                    {deleteImpact.assignments > 0 ? `${deleteImpact.assignments} ${t('lecturer assignments')}` : ''}
                    {deleteImpact.assignments > 0 && deleteImpact.slots > 0 ? ` ${t('and')} ` : ''}
                    {deleteImpact.slots > 0 ? `${deleteImpact.slots} ${t('timetable slots')}` : ''}.
                  </Text>
                )}

                {/* Typing is required only once marks exist. A course added by mistake a
                    minute ago stays a single tap. */}
                {deleteImpact.requiresTypedName && (
                  <>
                    <Text style={styles.label}>{t('Type the exact name to confirm')}</Text>
                    <Text style={styles.delTypeName}>{deleteTarget?.name}</Text>
                    <TextInput
                      style={styles.input}
                      value={typedName}
                      onChangeText={setTypedName}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholderTextColor={colors.textMuted}
                    />
                  </>
                )}
              </>
            )}

            <View style={styles.delActions}>
              <TouchableOpacity
                style={styles.delCancel}
                onPress={() => { setDeleteTarget(null); setDeleteImpact(null); setImpactError(''); setTypedName('') }}
                disabled={deletingSubject}>
                <Text style={styles.delCancelText}>{impactError ? t('Close') : t('Cancel')}</Text>
              </TouchableOpacity>
              {!impactError && (
                <TouchableOpacity
                  style={[styles.delConfirm, (!deleteImpact || deletingSubject || (deleteImpact.requiresTypedName && typedName.trim() !== (deleteTarget?.name ?? '').trim())) && styles.delConfirmOff]}
                  onPress={confirmDelete}
                  disabled={!deleteImpact || deletingSubject || (deleteImpact.requiresTypedName && typedName.trim() !== (deleteTarget?.name ?? '').trim())}>
                  <Text style={styles.delConfirmText}>{deletingSubject ? t('Deleting…') : t('Delete')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tt('Add Subject', 'Add Course')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{tt('Subject Name', 'Course Name')} <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={subjectName}
              onChangeText={setSubjectName}
              placeholder={isUniversity ? t('e.g. Calculus I') : t('e.g. Mathematics')}
              placeholderTextColor="#9ca3af"
              autoFocus
            />

            <Text style={styles.label}>{tc('Class Level', 'Department')} <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity style={styles.picker} onPress={() => setClassPickerOpen((v) => !v)}>
              <Text style={[styles.pickerText, !classLevel && { color: colors.textMuted }]}>
                {classLevel ? classPickerLabel(classLevel) : tc('Select class level', 'Select department')}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </TouchableOpacity>
            {classPickerOpen && (
              <View style={styles.dropdownList}>
                {classList.map((cl) => (
                  <TouchableOpacity
                    key={cl.id}
                    style={styles.dropdownItem}
                    onPress={() => { setClassLevel(cl.name); setClassPickerOpen(false) }}
                  >
                    <Text style={[styles.dropdownItemText, cl.name === classLevel && { color: '#F03E2F', fontWeight: '700' }]}>
                      {classPickerLabel(cl.name)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isUniversity && (
              <>
                <Text style={styles.label}>{t('Semester')} <Text style={styles.required}>*</Text></Text>
                <TouchableOpacity style={styles.picker} onPress={() => setTermPickerOpen((v) => !v)}>
                  <Text style={[styles.pickerText, !term && { color: colors.textMuted }]}>
                    {term || t('Select semester')}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#6b7280" />
                </TouchableOpacity>
                {termPickerOpen && (
                  <View style={styles.dropdownList}>
                    {termList.map((tm) => (
                      <TouchableOpacity
                        key={tm.id}
                        style={styles.dropdownItem}
                        onPress={() => { setTerm(tm.name); setTermPickerOpen(false) }}
                      >
                        <Text style={[styles.dropdownItemText, tm.name === term && { color: '#F03E2F', fontWeight: '700' }]}>
                          {tm.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {!isUniversity && (
              <View>
                <Text style={styles.label}>{t('Coefficient')} <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={coefficient}
                  onChangeText={setCoefficient}
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            )}

            {isUniversity && (
              <View>
                <Text style={styles.label}>{t('Course Code')} <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={[styles.input, { fontFamily: 'monospace' }]}
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  placeholder="CS101"
                  maxLength={12}
                  autoCapitalize="characters"
                  placeholderTextColor="#9ca3af"
                />
                <Text style={styles.hint}>{t('Shown on the transcript.')}</Text>
              </View>
            )}

            {isUniversity && (
              <View>
                <Text style={styles.label}>{t('Credit')} <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={credit}
                  onChangeText={setCredit}
                  placeholder="e.g. 3"
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            )}

            <Text style={styles.label}>{isUniversity ? t('Required hours (this semester)') : t('Required hours (this academic year)')}</Text>
            <TextInput
              style={styles.input}
              value={requiredHours}
              onChangeText={setRequiredHours}
              placeholder={t('Optional, e.g. 45')}
              keyboardType="numeric"
              placeholderTextColor="#9ca3af"
            />

            {isUniversity && (
              <TouchableOpacity style={styles.checkRow} activeOpacity={0.7} onPress={() => setCompulsory((v) => !v)}>
                <View style={[styles.checkBox, compulsory && styles.checkBoxOn]}>
                  {compulsory && <Ionicons name="checkmark" size={15} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkTitle}>{t('Every student in this department takes it')}</Text>
                  <Text style={styles.checkSub}>{t('Untick to choose which students are not taking it.')}</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.createBtn, creating && styles.disabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>{tt('Add Subject', 'Add Course')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Who is NOT taking an optional course. Ticking a student removes the course from
          their report card entirely and deletes any marks they have for it this session. */}
      <Modal visible={!!exclFor} animationType="slide" transparent onRequestClose={() => setExclFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{t('Students not taking this course')}</Text>
                {exclFor && <Text style={styles.hint}>{exclFor.name}</Text>}
              </View>
              <TouchableOpacity onPress={() => setExclFor(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Outside the list on purpose: a class of 40 puts the box out of reach exactly
                when it starts being needed. Filtering never changes what is ticked. */}
            <TextInput
              style={styles.input}
              value={exclSearch}
              onChangeText={setExclSearch}
              placeholder={t('Search by name or matricule…')}
              placeholderTextColor="#9ca3af"
              autoCorrect={false}
            />

            {!exclData ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color="#F03E2F" />
            ) : (
              <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                {visibleExclStudents.length === 0 && (
                  <Text style={[styles.hint, { textAlign: 'center', marginVertical: 20 }]}>
                    {exclData.students.length === 0
                      ? t('No students in this department yet.')
                      : t('No student matches that search.')}
                  </Text>
                )}
                {visibleExclStudents.map((st) => {
                  const picked = exclPicked.has(st.id)
                  const hasMarks = exclData.markedStudentIds.includes(st.id)
                  return (
                    <TouchableOpacity
                      key={st.id}
                      style={styles.exclRow}
                      activeOpacity={0.7}
                      onPress={() => setExclPicked((prev) => {
                        const next = new Set(prev)
                        if (next.has(st.id)) next.delete(st.id); else next.add(st.id)
                        return next
                      })}
                    >
                      <View style={[styles.checkBox, picked && styles.checkBoxOn]}>
                        {picked && <Ionicons name="checkmark" size={15} color="#fff" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.exclName} numberOfLines={1}>{st.name}</Text>
                        <Text style={styles.exclId} numberOfLines={1}>{st.studentId}</Text>
                      </View>
                      {/* Warns only once ticked, when the consequence becomes real. */}
                      {hasMarks && (
                        <Text style={{ fontSize: 10, fontWeight: picked ? '700' : '400', color: picked ? '#ef4444' : colors.textMuted }}>
                          {picked ? t('marks will be deleted') : t('has marks')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <Text style={[styles.hint, { flex: 1, marginTop: 0 }]}>
                {exclPicked.size} {t('of')} {exclData?.students.length ?? 0} {t('not taking it')}
              </Text>
              <TouchableOpacity
                style={[styles.createBtn, { flex: 0, paddingHorizontal: 20, marginTop: 0 }, exclSaving && styles.disabled]}
                onPress={saveExclusions}
                disabled={exclSaving || !exclData}
              >
                <Text style={styles.createBtnText}>{exclSaving ? t('Saving…') : t('Save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
