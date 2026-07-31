'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getStudentsApi, getStudentClassLevelsApi, createStudentApi, updateStudentApi, setStudentStatusApi, StudentStatus,
  bulkPromoteStudentsApi,
  downloadStudentImportTemplateApi, previewStudentImportApi, commitStudentImportApi, ImportPreviewResult, CarryOverRow,
} from '@/lib/api/students'
import { getClassLevelsApi, ClassLevel } from '@/lib/api/classLevels'
import { useProgrammeFilter, ProgrammeChips, EveningBadge } from '@/components/ui/ProgrammeFilter'
import { stripProgrammeSuffix, withProgrammeSuffix, PROGRAMME_LABELS } from '@/lib/programme'
import { getDepartmentsApi, Department } from '@/lib/api/departments'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getTermsApi } from '@/lib/api/terms'
import { Users, Plus, Search, UserX, Pencil, X, Wallet, Download, Upload, AlertTriangle, CheckCircle2, ArrowUpCircle, Info, ChevronDown, ArrowUp, AlertCircle } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import StudentFeesModal from '@/components/ui/StudentFeesModal'
import CustomSelect from '@/components/ui/CustomSelect'
import { usePagination } from '@/lib/usePagination'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import { getFeesOverviewApi, FeeOverviewRow } from '@/lib/api/fees'
import { buildCsv, saveCsv, saveBlob, datedFilename } from '@/lib/csv'
import { downloadZip } from '@/lib/zip'

interface Student {
  id: string; name: string; studentId: string
  classLevel: string; gender?: string; dateOfBirth?: string | null; placeOfBirth?: string | null; guardianName?: string
  guardianPhone?: string; guardianEmail?: string
  status?: StudentStatus
  directLevel2Entry?: boolean
}

const STATUS_TABS: { value: StudentStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'DISMISSED', label: 'Dismissed' },
]
const STATUS_BADGE: Record<StudentStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  DISABLED: 'bg-amber-100 text-amber-700',
  DISMISSED: 'bg-red-100 text-red-700',
}
// Same three meanings as STATUS_BADGE, reduced to a dot for the table: the label beside it
// already says the word, so the colour only has to separate the three at a glance.
const STATUS_DOT: Record<StudentStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  DISABLED: 'bg-amber-500',
  DISMISSED: 'bg-red-500',
}

/** Two-letter monogram for the row avatar: first and last name, so pupils sharing a first
 *  name are still told apart. Falls back to one letter for a single-word name. */
function studentInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

const emptyForm = { name: '', studentId: '', classLevel: '', stream: '', gender: '', dateOfBirth: '', placeOfBirth: '', guardianName: '', guardianPhone: '', guardianEmail: '', uniDept: '', uniLevel: '', secDept: '', directLevel2Entry: false }

// Secondary non-default departments store classes with a " (Department)" suffix;
// strip it for display since the department is shown separately.
const stripDeptSuffix = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

// Helpers for parsing university class level names
function univDept(rawName: string): string {
  // Normalised first: these patterns anchor at the end of the name, where the
  // Day/Evening marker sits. The sitting is `ClassLevel.programme`, never part of a
  // department or level.
  const classLevel = stripProgrammeSuffix(rawName)
  if (classLevel.startsWith('HND ')) return classLevel.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (classLevel.startsWith('Degree ')) return classLevel.replace(/^Degree /, '')
  return classLevel
}
function univLevel(rawName: string): string {
  // Normalised first: these patterns anchor at the end of the name, where the
  // Day/Evening marker sits. The sitting is `ClassLevel.programme`, never part of a
  // department or level.
  const classLevel = stripProgrammeSuffix(rawName)
  if (/ - Level 2$/i.test(classLevel)) return 'Level 2'
  if (/ - Level 1$/i.test(classLevel)) return 'Level 1'
  if (classLevel.startsWith('Degree ')) return 'Level 3'
  return ''
}
function univLevelBadge(classLevel: string) {
  const lv = univLevel(classLevel)
  if (lv === 'Level 1') return { label: 'L1', cls: 'bg-blue-100 text-blue-700' }
  if (lv === 'Level 2') return { label: 'L2', cls: 'bg-indigo-100 text-indigo-700' }
  if (lv === 'Level 3') return { label: 'L3', cls: 'bg-purple-100 text-purple-700' }
  return null
}

export default function StudentsPage() {
  const router = useRouter()
  const { isAuthenticated, activeSession, setActiveSession, school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  // Primary is the only type with no department layer at all — see the table header.
  const isPrimary = !isUniversity && !isSecondary
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  // A university's year is split into semesters, not terms. Same Term rows either way, only
  // the word changes, exactly as the sidebar relabels the nav.
  const ts = (termStr: string, semesterStr: string) => t(isUniversity ? semesterStr : termStr)
  const [students, setStudents] = useState<Student[]>([])
  const [filterClasses, setFilterClasses] = useState<string[]>([])
  const [definedClasses, setDefinedClasses] = useState<ClassLevel[]>([])
  // Day/Evening. Morning and evening cohorts are entirely different people, so this filters
  // the roster itself, not just the class dropdown.
  const programmeFilter = useProgrammeFilter(definedClasses)
  const [departments, setDepartments] = useState<Department[]>([])
  const [deptFilter, setDeptFilter] = useState('all')
  const [activeClass, setActiveClass] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StudentStatus>('ACTIVE')
  const [sortAsc, setSortAsc] = useState(true)
  // Per-term/semester export lives behind the Export CSV caret rather than as its own row of
  // chips — it is an export option, not a filter on the table, and sitting among the filters
  // it read as one.
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [statusTarget, setStatusTarget] = useState<Student | null>(null)
  const [newStatus, setNewStatus] = useState<StudentStatus>('ACTIVE')
  const [statusSaving, setStatusSaving] = useState(false)
  const [feesTarget, setFeesTarget] = useState<{ id: string; name: string } | null>(null)
  const [feesByStudent, setFeesByStudent] = useState<Record<string, FeeOverviewRow>>({})
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, string[]>>({})
  const [exporting, setExporting] = useState(false)
  const [terms, setTerms] = useState<{ id: string; name: string; session: string; isCurrent: boolean }[]>([])
  const [promoteModalOpen, setPromoteModalOpen] = useState(false)
  const [promoteSelected, setPromoteSelected] = useState<Set<string>>(new Set())
  const [promoting, setPromoting] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [importPreviewing, setImportPreviewing] = useState(false)
  const [importCommitting, setImportCommitting] = useState(false)
  const [importError, setImportError] = useState('')
  const [activeTermId, setActiveTermId] = useState<string>('')

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else {
      fetchStudents()
      fetchFilterClasses()
      fetchDefinedClasses()
      fetchFeesOverview()
      fetchSubjects()
      fetchTerms()
      if (isSecondary) getDepartmentsApi().then(d => setDepartments(d.departments)).catch(() => {})
    }
  }, [isAuthenticated])

  const fetchTerms = async () => {
    try {
      const data = await getTermsApi()
      setTerms(data.terms)
    } catch { /* term filter is optional */ }
  }

  const fetchSubjects = async () => {
    try {
      const data = await getSubjectsApi()
      const map: Record<string, string[]> = {}
      for (const s of (data.subjects as { name: string; classLevel: string }[])) {
        (map[s.classLevel] ??= []).push(s.name)
      }
      setSubjectsByClass(map)
    } catch { /* subjects column is optional */ }
  }

  const fetchFeesOverview = async () => {
    try {
      const data = await getFeesOverviewApi()
      const map: Record<string, FeeOverviewRow> = {}
      for (const row of data.students) map[row.studentId] = row
      setFeesByStudent(map)
    } catch { /* ignore — fees badge is optional */ }
  }

  const fetchFilterClasses = async () => {
    try {
      const data = await getStudentClassLevelsApi()
      setFilterClasses(data.classLevels)
    } catch { /* ignore */ }
  }

  const fetchDefinedClasses = async () => {
    try {
      const data = await getClassLevelsApi()
      setDefinedClasses(data.classLevels)
    } catch { /* ignore */ }
  }

  // The table shows the (active) student roster filtered by class + search. The
  // term chips don't change the roster (a class's students are the same across
  // terms) — they choose how the EXPORT is split into per-term files.
  // Disabled/Dismissed is a status filter, not a year filter — it bypasses the
  // year-aware roster entirely (see getStudents in student.controller.ts).
  const fetchStudents = async (classFilter = activeClass, searchVal = search, statusVal = statusFilter) => {
    try {
      setLoading(true)
      const params: { classLevel?: string; search?: string; session?: string; status?: string } = {}
      if (classFilter && classFilter !== 'all') params.classLevel = classFilter
      if (searchVal) params.search = searchVal
      if (statusVal === 'ACTIVE') { if (activeSession) params.session = activeSession }
      else params.status = statusVal
      const data = await getStudentsApi(params)
      setStudents(data.students)
    } catch { console.error('Failed to fetch students') }
    finally { setLoading(false) }
  }

  // Re-pull the roster + fee badges whenever the active academic year changes.
  useEffect(() => {
    if (!isAuthenticated || !activeSession) return
    fetchStudents()
    fetchFeesOverview()
  }, [activeSession])

  const handleStatusFilter = (status: StudentStatus) => {
    setStatusFilter(status)
    setSearch('')
    fetchStudents(activeClass, '', status)
  }

  // The terms shown belong only to the active academic year.
  const visibleTerms = terms.filter((tm) => tm.session === activeSession)
  // If the selected term isn't in the active year, fall back to "All Terms".
  useEffect(() => {
    if (activeTermId && !visibleTerms.some((tm) => tm.id === activeTermId)) setActiveTermId('')
  }, [activeSession, terms])

  // A newly created/imported student only shows up in this list while
  // viewing the LIVE academic year — a past year's roster is scoped to
  // students who already have a report card that session, which a freshly
  // created student never has yet (see student.controller.ts getStudents).
  // Switch the app-wide active year to the live one right after a successful
  // create/import so the new student is actually visible, instead of
  // silently "disappearing" if a past year happened to be selected.
  const switchToLiveYearIfNeeded = (): string | null => {
    const live = terms.find((tm) => tm.isCurrent)?.session
    if (live && live !== activeSession) {
      setActiveSession(live)
      return live
    }
    return null
  }

  const handleClassFilter = (cls: string) => {
    setActiveClass(cls)
    setSearch('')
    fetchStudents(cls, '')
  }

  const handleTermFilter = (termId: string) => setActiveTermId(termId)

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    fetchStudents(activeClass, e.target.value)
  }

  const selectedClassDef = definedClasses.find((c) => c.name === form.classLevel)
  const needsStream = selectedClassDef?.hasStream ?? false

  // Mirrors the API's hard gate in createStudent/commitStudentImport — a student created
  // before any term is current ends up with no report card and nothing to surface that
  // later, so blocked here too rather than just letting the add/import forms fail on submit.
  const hasCurrentTerm = terms.some((tm) => tm.isCurrent)

  // Secondary two-step picker, same shape as the university one below: department
  // first, then the class dropdown narrows to that department's classes only. A
  // student's department is never stored directly — it's always derived from which
  // class they're in — so picking department-first is what guarantees the class they
  // end up with actually belongs to it.
  // Classes the form may offer: narrowed to the section being browsed, so the modal can
  // never enrol into the other one behind the filter's back. With no filter ('ALL') the
  // whole school is offered and the level list labels each section.
  const formClasses = useMemo(
    () => definedClasses.filter((c) => programmeFilter.matches(c.name)),
    [definedClasses, programmeFilter.programme],
  )

  const secDeptClasses = useMemo(() =>
    isSecondary && form.secDept ? formClasses.filter((c) => c.departmentId === form.secDept) : [],
  [isSecondary, form.secDept, formClasses])

  // University two-step picker: unique departments, then available levels per dept
  const uniDepts = useMemo(() =>
    isUniversity ? Array.from(new Set(formClasses.map((c) => univDept(c.name)))).sort() : [],
  [isUniversity, formClasses])

  const uniLevelsForDept = useMemo(() => {
    if (!isUniversity || !form.uniDept) return []
    return formClasses
      .filter((c) => univDept(c.name) === form.uniDept)
      .map((c) => ({
        label: univLevel(c.name),
        classLevel: c.name,
        // Both sittings of a programme have the same levels, so "Level 1" would otherwise
        // appear twice with nothing to tell them apart.
        sitting: programmeFilter.programmeOf(c.name),
      }))
      .filter((x) => x.label)
      .sort((a, b) => {
        const order: Record<string, number> = { 'Level 1': 0, 'Level 2': 1, 'Level 3': 2 }
        return (order[a.label] ?? 3) - (order[b.label] ?? 3)
      })
  }, [isUniversity, form.uniDept, definedClasses])

  // Split into the two sittings. A flat row reading "Level 1, Level 1, Level 2, Level 3"
  // makes the reader work out which is which from a tag on one of them; a heading per
  // sitting says it outright. Levels need not exist in both: Level 3 (Degree) continues
  // from Level 2 and runs only in the evening, so it appears under one heading and not
  // the other, with nothing missing-looking about it.
  // Does the class being enrolled into have a Level 1 to carry over from, in its own
  // section? A brand-new programme has none: every student in it is necessarily a direct
  // entrant, so asking the question would be a choice with one right answer.
  const level1ForSelectedClass = useMemo(() => {
    if (!isUniversity || !form.classLevel) return null
    const bare = stripProgrammeSuffix(form.classLevel)
    if (!/ - Level 2$/i.test(bare)) return null
    const wanted = withProgrammeSuffix(bare.replace(/ - Level 2$/i, ' - Level 1'), programmeFilter.programmeOf(form.classLevel))
    return definedClasses.find((c) => c.name === wanted) ?? null
  }, [isUniversity, form.classLevel, definedClasses])

  // With no Level 1 in this section there is nothing to carry over from, so the student IS
  // a direct entrant. Set it rather than leaving the default: the carry-over path resolves
  // the fee from a Level 1 class that does not exist, which silently comes out as zero.
  useEffect(() => {
    if (!isUniversity) return
    if (/ - Level 2$/i.test(stripProgrammeSuffix(form.classLevel)) && !level1ForSelectedClass && !form.directLevel2Entry) {
      setForm((f) => ({ ...f, directLevel2Entry: true }))
    }
  }, [isUniversity, form.classLevel, level1ForSelectedClass])

  const uniLevelsBySitting = useMemo(() => ({
    DAY: uniLevelsForDept.filter((x) => x.sitting === 'DAY'),
    EVENING: uniLevelsForDept.filter((x) => x.sitting === 'EVENING'),
  }), [uniLevelsForDept])

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (s: Student) => {
    const streams = ['Arts', 'Science']
    const parts = s.classLevel.split(' ')
    const stream = streams.includes(parts[parts.length - 1]) ? parts[parts.length - 1] : ''
    const baseClass = stream ? parts.slice(0, -1).join(' ') : s.classLevel
    setEditingId(s.id)
    setForm({
      name: s.name,
      studentId: s.studentId,
      classLevel: baseClass,
      stream,
      gender: s.gender || '',
      dateOfBirth: s.dateOfBirth || '',
      placeOfBirth: s.placeOfBirth || '',
      guardianName: s.guardianName || '',
      guardianPhone: s.guardianPhone || '',
      guardianEmail: s.guardianEmail || '',
      uniDept: isUniversity ? univDept(baseClass) : '',
      uniLevel: isUniversity ? univLevel(baseClass) : '',
      secDept: isSecondary ? (deptIdOfClass(baseClass) ?? '') : '',
      directLevel2Entry: (s as { directLevel2Entry?: boolean }).directLevel2Entry ?? false,
    })
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setError('')
    setForm(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (isUniversity && (!form.uniDept || !form.uniLevel || !form.classLevel)) {
      setError('Please select a department and level.')
      return
    }
    if (isSecondary && (!form.secDept || !form.classLevel)) {
      setError(t('Please select a department and class.'))
      return
    }
    if (needsStream && !form.stream) {
      setError(t('Please select a stream (Arts or Science)'))
      return
    }
    if (form.gender !== 'Male' && form.gender !== 'Female') {
      setError(t('Please select the student\'s gender.'))
      return
    }
    setSaving(true)
    try {
      const classLevel = needsStream ? `${form.classLevel} ${form.stream}` : form.classLevel
      const { stream, studentId: _sid, uniDept: _ud, uniLevel: _ul, secDept: _sd, ...rest } = form
      const isLevel2 = / - Level 2$/i.test(classLevel)
      if (editingId) {
        await updateStudentApi(editingId, { ...rest, classLevel, directLevel2Entry: isLevel2 ? rest.directLevel2Entry : false })
        showToast(t('Student updated'))
      } else {
        await createStudentApi({ ...rest, classLevel, directLevel2Entry: isLevel2 ? rest.directLevel2Entry : false })
        const switchedTo = switchToLiveYearIfNeeded()
        showToast(switchedTo
          ? `${t('Student added successfully')} — ${t('switched to the current academic year')} (${switchedTo})`
          : t('Student added successfully'))
      }
      closeModal()
      fetchStudents(activeClass)
      fetchFilterClasses()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || t('Failed to save student'))
    } finally { setSaving(false) }
  }

  // Replaces the old silent "delete" (which never deleted anything — just set
  // isActive: false with no visible status and no way back). See
  // Student.status in schema.prisma.
  const openStatusModal = (s: Student) => {
    setStatusTarget(s)
    setNewStatus(s.status ?? 'ACTIVE')
  }

  const closeStatusModal = () => setStatusTarget(null)

  const handleStatusSave = async () => {
    if (!statusTarget) return
    setStatusSaving(true)
    try {
      await setStudentStatusApi(statusTarget.id, newStatus)
      showToast(`${statusTarget.name} — ${t(STATUS_TABS.find((s) => s.value === newStatus)?.label ?? newStatus)}`)
      closeStatusModal()
      fetchStudents(activeClass)
      fetchFilterClasses()
    } catch {
      showToast(t('Failed to update status'), 'error')
    } finally {
      setStatusSaving(false)
    }
  }

  // Bulk import (transfer an existing Excel/CSV roster instead of one-at-a-time
  // entry) — same flow for every school type, see lib/api/students.ts.
  const openImportModal = () => {
    setImportFile(null)
    setImportPreview(null)
    setImportError('')
    setImportModalOpen(true)
  }

  const closeImportModal = () => {
    setImportModalOpen(false)
    setImportFile(null)
    setImportPreview(null)
    setImportError('')
  }

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadStudentImportTemplateApi()
      saveBlob(blob, 'student-import-template.xlsx')
    } catch {
      showToast(t('Failed to download template'), 'error')
    }
  }

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setImportFile(file)
    setImportPreview(null)
    setImportError('')
    if (!file) return
    setImportPreviewing(true)
    try {
      const result = await previewStudentImportApi(file, programmeFilter.programme)
      setImportPreview(result)
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      setImportError(e2.response?.data?.message || t('Failed to read that file. Make sure it is a valid .xlsx or .csv file.'))
    } finally {
      setImportPreviewing(false)
    }
  }

  const handleImportCommit = async () => {
    if (!importPreview || importPreview.valid.length === 0) return
    setImportCommitting(true)
    try {
      const result = await commitStudentImportApi(importPreview.valid)
      const parts = [`${t('Imported')} ${result.created} ${t('students')}`]
      if (result.failed.length > 0) parts.push(`${result.failed.length} ${t('failed')}`)
      if (result.feesRecorded > 0) parts.push(`${result.feesRecorded} ${t('fee payments recorded')}`)
      if (result.created > 0) {
        const switchedTo = switchToLiveYearIfNeeded()
        if (switchedTo) parts.push(`${t('switched to the current academic year')} (${switchedTo})`)
      }
      if (result.feeWarning) parts.push(result.feeWarning)
      showToast(parts.join(' · '), result.feeWarning ? 'error' : 'success')
      closeImportModal()
      fetchStudents(activeClass)
      fetchFilterClasses()
      fetchFeesOverview()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      setImportError(e2.response?.data?.message || t('Failed to import students'))
    } finally {
      setImportCommitting(false)
    }
  }

  const feeLabel = (status?: string): string => {
    switch (status) {
      case 'COMPLETE': return t('Complete')
      case 'PARTIAL': return t('Partly paid')
      case 'UNPAID': return t('Not paid')
      default: return ''
    }
  }

  // Export = one CSV per (class × term) from the on-screen filters:
  //   - terms   = the active term chip, or every term on "All Terms"
  //   - classes = the active class chip, or every current class (the class chips)
  // Each file holds that class's roster. One file downloads as .csv; several are
  // zipped. Data-driven, so it scales to any number of classes/terms; orphan
  // classes (deleted/inactive, like a removed "Grade 3") never appear because the
  // roster + class chips are active-only.
  const handleExport = async () => {
    const targetTerms = activeTermId ? visibleTerms.filter((tm) => tm.id === activeTermId) : visibleTerms
    if (targetTerms.length === 0) { showToast(ts('No term selected', 'No semester selected'), 'error'); return }
    const targetClasses = activeClass !== 'all'
      ? [activeClass]
      : (isSecondary && deptFilter !== 'all' ? filterClasses.filter((c) => deptIdOfClass(c) === deptFilter) : filterClasses)
    if (targetClasses.length === 0) { showToast(t('Nothing to export'), 'error'); return }
    const cols = [
      { label: t('Name'), value: (s: Student) => s.name },
      { label: t('Student ID'), value: (s: Student) => s.studentId },
      ...(isSecondary ? [{ label: t('Department'), value: (s: Student) => deptNameOf(s.classLevel) }] : []),
      { label: t('Class'), value: (s: Student) => stripProgrammeSuffix(isSecondary ? stripDeptSuffix(s.classLevel) : s.classLevel) },
      { label: t(isUniversity ? 'Courses' : 'Subjects'), value: (s: Student) => (subjectsByClass[s.classLevel] || []).join(', ') },
      { label: t('Guardian'), value: (s: Student) => s.guardianName || '' },
      { label: t('Guardian Phone'), value: (s: Student) => s.guardianPhone || '' },
      { label: t('Guardian Email'), value: (s: Student) => s.guardianEmail || '' },
      { label: t('Total fee'), value: (s: Student) => feesByStudent[s.id]?.due ?? '' },
      { label: t('Paid'), value: (s: Student) => feesByStudent[s.id]?.paid ?? '' },
      { label: t('Balance'), value: (s: Student) => feesByStudent[s.id]?.balance ?? '' },
      { label: t('Fees'), value: (s: Student) => feeLabel(feesByStudent[s.id]?.status) },
    ]
    const safe = (x: string) => x.replace(/[\\/]+/g, '-').trim()
    setExporting(true)
    try {
      // Active roster grouped by class.
      const data = await getStudentsApi()
      const byClass = new Map<string, Student[]>()
      for (const s of (data.students as Student[])) {
        if (!byClass.has(s.classLevel)) byClass.set(s.classLevel, [])
        byClass.get(s.classLevel)!.push(s)
      }
      const files: { name: string; content: string }[] = []
      for (const term of targetTerms) {
        for (const cls of targetClasses) {
          const rows = byClass.get(cls) || []
          if (rows.length === 0) continue
          files.push({
            name: datedFilename(`students-${safe(`${term.name} ${term.session}`)}-${safe(cls)}`),
            content: buildCsv(rows, cols),
          })
        }
      }
      if (files.length === 0) { showToast(t('Nothing to export'), 'error'); return }
      if (files.length === 1) saveCsv(files[0].name, files[0].content)
      else downloadZip(datedFilename('students-export', 'zip'), files)
      showToast(`${t('Export started')} (${files.length})`)
    } catch {
      showToast(t('Failed to export'), 'error')
    } finally {
      setExporting(false)
    }
  }

  // ── Secondary department filtering ──
  const deptIdOfClass = (name: string) => definedClasses.find((c) => c.name === name)?.departmentId ?? null
  const deptNameOf = (name: string) => departments.find((d) => d.id === deptIdOfClass(name))?.name ?? ''

  const handleDeptFilter = (deptId: string) => {
    setDeptFilter(deptId)
    setActiveClass('all')
    setSearch('')
    fetchStudents('all', '')
  }

  // Class dropdown options, narrowed to the active department (secondary) and
  // shown with department suffixes stripped.
  const classFilterOptions = (isSecondary && deptFilter !== 'all'
    ? filterClasses.filter((cls) => deptIdOfClass(cls) === deptFilter)
    : filterClasses
  ).filter((cls) => programmeFilter.matches(cls))
    .map((cls) => ({ value: cls, label: stripProgrammeSuffix(isSecondary ? stripDeptSuffix(cls) : cls) }))

  // The roster to display: when a department is selected (and no single class),
  // narrow the server roster to that department's classes client-side.
  const visibleStudents = ((isSecondary && deptFilter !== 'all' && activeClass === 'all')
    ? students.filter((s) => deptIdOfClass(s.classLevel) === deptFilter)
    : students
  ).filter((s) => programmeFilter.matches(s.classLevel))

  // Sorted by name, the only column worth ordering on a roster — and the reason the STUDENT
  // header carries an arrow. localeCompare so accented names file where a reader expects.
  const sortedStudents = useMemo(
    () => [...visibleStudents].sort((a, b) => (sortAsc ? 1 : -1) * a.name.localeCompare(b.name)),
    [visibleStudents, sortAsc],
  )

  // How many departments the subtitle reports. Secondary keeps them as real records;
  // a university encodes them in the class name, so they're counted from the classes.
  const departmentCount = isSecondary
    ? departments.length
    : isUniversity
      ? new Set(definedClasses.map((c) => univDept(c.name))).size
      : 0

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(sortedStudents, 15, `${deptFilter}|${activeClass}|${search}|${statusFilter}|${sortAsc}`)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Students')}</h2>
          {/* Roster size first, because it is what the page is for, then the scope it is
              currently showing so a filtered count is never mistaken for the whole school. */}
          <p className="text-muted-foreground text-sm mt-1">
            {visibleStudents.length} {t('enrolled')}
            {activeClass !== 'all'
              ? ` · ${stripProgrammeSuffix(isSecondary ? stripDeptSuffix(activeClass) : activeClass)}`
              : (isSecondary && deptFilter !== 'all')
                ? ` · ${departments.find(d => d.id === deptFilter)?.name ?? ''}`
                : departmentCount > 0
                  ? ` · ${departmentCount} ${departmentCount === 1 ? t('department') : t('departments')}`
                  : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isUniversity && / - Level 1$/i.test(stripProgrammeSuffix(activeClass)) && statusFilter === 'ACTIVE' && (
            <button onClick={() => {
              setPromoteSelected(new Set(students.map((s) => s.id)))
              setPromoteModalOpen(true)
            }}
              className="flex items-center gap-2 border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-lg text-sm font-medium transition">
              <ArrowUpCircle size={16} /> Promote to Level 2
            </button>
          )}
          {/* Split button: the main half exports what is on screen, the caret narrows it to a
              single term/semester. Only grown a caret when there is more than one to pick. */}
          <div className="relative">
            <div className="flex items-stretch rounded-lg border border-border overflow-hidden">
              {/* The chosen term rides on the button label. It used to be a highlighted chip
                  in plain sight, and moving it into a menu would otherwise mean exporting a
                  single term while the page gives no sign that is what will happen. */}
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-2 text-foreground px-3 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50 transition">
                <Download size={16} />
                {exporting ? t('Exporting...') : t('Export CSV')}
                {!exporting && activeTermId && (
                  <span className="text-xs font-semibold text-primary">
                    · {visibleTerms.find((tm) => tm.id === activeTermId)?.name}
                  </span>
                )}
              </button>
              {visibleTerms.length > 0 && (
                <button
                  onClick={() => setExportMenuOpen((o) => !o)}
                  aria-label={ts('Export by term', 'Export by semester')}
                  className="px-2 border-l border-border text-muted-foreground hover:bg-hover transition"
                >
                  <ChevronDown size={15} />
                </button>
              )}
            </div>
            {exportMenuOpen && visibleTerms.length > 0 && (
              <>
                {/* Click-away layer: a menu that only closed on re-clicking the caret is the
                    kind that gets left open behind a modal. */}
                <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 w-56 rounded-xl border border-border bg-card shadow-xl overflow-hidden py-1">
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {ts('Export by term', 'Export by semester')}
                  </p>
                  <button
                    onClick={() => { handleTermFilter(''); setExportMenuOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-hover transition ${!activeTermId ? 'text-primary font-semibold' : 'text-foreground'}`}
                  >
                    {ts('All Terms', 'All Semesters')}
                  </button>
                  {visibleTerms.map((tm) => (
                    <button key={tm.id}
                      onClick={() => { handleTermFilter(tm.id); setExportMenuOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-hover transition ${activeTermId === tm.id ? 'text-primary font-semibold' : 'text-foreground'}`}
                    >
                      {tm.name}{tm.isCurrent ? ` (${t('Current')})` : ''}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={openImportModal} disabled={!hasCurrentTerm}
            title={hasCurrentTerm ? undefined : ts('Set a current academic year/term before adding students.', 'Set a current academic year/semester before adding students.')}
            className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition">
            <Upload size={16} /> {t('Import')}
          </button>
          <button onClick={openAdd} disabled={!hasCurrentTerm}
            title={hasCurrentTerm ? undefined : ts('Set a current academic year/term before adding students.', 'Set a current academic year/semester before adding students.')}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 disabled:cursor-not-allowed transition">
            <Plus size={16} /> {t('Add Student')}
          </button>
        </div>
      </div>

      {!hasCurrentTerm && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Info size={15} className="flex-shrink-0" />
          {ts('No current academic year/term is set. Set one before you can add students.', 'No current academic year/semester is set. Set one before you can add students.')}{' '}
          <button onClick={() => router.push('/terms')} className="font-semibold underline hover:no-underline">{ts('Go to Terms', 'Go to Semesters')}</button>
        </div>
      )}

      {/* One filter bar rather than four stacked rows. Search takes the space it needs and
          the narrowing controls sit beside it, in the order they narrow: sitting, then
          department, then class, then status. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder={t('Search by name, ID or guardian...')} value={search} onChange={handleSearch}
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* Day/Evening sitting, only once the school runs one. Placed before the class
            picker because it narrows what that picker offers. */}
        {programmeFilter.hasEvening && (
          <ProgrammeChips
            value={programmeFilter.programme}
            onChange={(p) => { programmeFilter.setProgramme(p); handleClassFilter('all') }}
          />
        )}

        {isSecondary && departments.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground flex-shrink-0">{t('Department')}</span>
            <CustomSelect
              className="w-44"
              compact
              value={deptFilter}
              onChange={handleDeptFilter}
              placeholder={t('All Departments')}
              options={[
                { value: 'all', label: t('All Departments') },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>
        )}

        {(filterClasses.length > 0 || (isSecondary && departments.length > 0)) && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground flex-shrink-0">{isUniversity ? t('Department') : t('Class')}</span>
            <CustomSelect
              className="w-48"
              compact
              value={activeClass}
              onChange={handleClassFilter}
              placeholder={isUniversity ? t('All Departments') : t('All Classes')}
              options={[
                { value: 'all', label: isUniversity ? t('All Departments') : t('All Classes') },
                ...classFilterOptions,
              ]}
            />
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground flex-shrink-0">{t('Status')}</span>
          <CustomSelect
            className="w-36"
            compact
            value={statusFilter}
            onChange={(v) => handleStatusFilter(v as StudentStatus)}
            options={STATUS_TABS.map((tab) => ({ value: tab.value, label: t(tab.label) }))}
          />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
        ) : students.length === 0 ? (
          <div className="text-center py-12">
            <Users size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              {statusFilter === 'ACTIVE' ? t('No students yet.') : t('No students with this status.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-border">
              <tr className="[&>th]:text-left [&>th]:px-4 [&>th]:py-3 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-muted-foreground/70">
                {/* Name and ID share one column: the ID identifies the person in the row above
                    it, so a column of its own only pushed everything else right. */}
                <th>
                  <button onClick={() => setSortAsc((a) => !a)} className="flex items-center gap-1.5 hover:text-foreground transition uppercase tracking-wider">
                    {t('Student')}
                    <ArrowUp size={12} className={`transition-transform ${sortAsc ? '' : 'rotate-180'}`} />
                  </button>
                </th>
                {/* Secondary and university both group classes under a department, so both
                    get the column. Primary has none, and an empty column would only ask the
                    reader what belongs in it. */}
                {!isPrimary && <th>{t('Department')}</th>}
                <th>{isUniversity ? t('Level') : t('Class')}</th>
                <th>{t('Gender')}</th>
                <th>{t('Guardian')}</th>
                <th>{t('Fees due')}</th>
                <th>{t('Status')}</th>
                <th><span className="sr-only">{t('Actions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((s) => {
                const status = s.status ?? 'ACTIVE'
                return (
                <tr key={s.id} className="group hover:bg-hover transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 flex-shrink-0 bg-primary/10 text-primary rounded-lg flex items-center justify-center text-xs font-bold">
                        {studentInitials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                        {/* Tabular figures so the codes line up down the column — they are
                            read by comparing them, which ragged digits make harder. */}
                        <p className="text-xs text-muted-foreground/80 tabular-nums truncate">{s.studentId}</p>
                      </div>
                    </div>
                  </td>
                  {!isPrimary && (
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {isUniversity
                        ? stripProgrammeSuffix(univDept(s.classLevel))
                        : (deptNameOf(s.classLevel) || <span className="text-muted-foreground">—</span>)}
                    </td>
                  )}
                  {/* The class name is stripped for display, so without the badge an evening
                      student's row is character for character identical to a day student's in
                      the same programme. The badge rides on whichever column names the cohort:
                      the class, or the level where a university has no class column. */}
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {isUniversity
                        ? (() => {
                            const b = univLevelBadge(s.classLevel)
                            return b
                              ? <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${b.cls}`}>{b.label}</span>
                              : <span className="text-muted-foreground text-sm">—</span>
                          })()
                        : stripProgrammeSuffix(isSecondary ? stripDeptSuffix(s.classLevel) : s.classLevel)}
                      {programmeFilter.programmeOf(s.classLevel) === 'EVENING' && <EveningBadge />}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.gender ? t(s.gender) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.guardianName || '—'}</td>
                  {/* What is OWED, as a number rather than a badge: this column is scanned to
                      find who still has to pay, and a row of coloured pills reads as decoration
                      where a column of figures reads as money. Only an unpaid balance is
                      coloured, because only that one needs chasing. */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {(() => {
                      const f = feesByStudent[s.id]
                      if (!f || f.status === 'NONE') return <span className="text-muted-foreground text-sm">—</span>
                      if (f.status === 'COMPLETE') return <span className="text-sm text-muted-foreground">{t('settled')}</span>
                      const overdue = f.status === 'UNPAID'
                      return (
                        <span className={`inline-flex items-center gap-1.5 text-sm ${overdue ? 'text-destructive' : 'text-foreground'}`}>
                          {overdue && <AlertCircle size={14} className="flex-shrink-0" />}
                          <span className="font-semibold tabular-nums">{Math.round(f.balance).toLocaleString('en-US')}</span>
                          <span className="text-xs text-muted-foreground">XAF</span>
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                      {t(STATUS_TABS.find((tab) => tab.value === status)?.label ?? 'Active')}
                    </span>
                  </td>
                  {/* Actions stay faint until the row is hovered, so 15 rows do not present 45
                      buttons competing with the data. Still rendered (not hidden) so they work
                      on touch, where there is no hover at all. */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition">
                      <button onClick={() => setFeesTarget({ id: s.id, name: s.name })} title={t('School Fees')}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition">
                        <Wallet size={14} />
                      </button>
                      <button onClick={() => openEdit(s)} title={t('Edit')}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => openStatusModal(s)} title={t('Change Status')}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                        <UserX size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{editingId ? t('Edit Student') : t('Add Student')}</h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground ">
                <X size={20} />
              </button>
            </div>
            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Full Name')} <span className="text-destructive">*</span></label>
                <input type="text" placeholder="e.g. Nguemo Alice"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {/* Student ID is auto-generated by the server — not shown on create */}
              {editingId && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{t('Student ID (auto-generated)')}</label>
                  <input type="text" value={form.studentId} disabled
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted" />
                </div>
              )}
              {isUniversity ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Department <span className="text-destructive">*</span></label>
                    {uniDepts.length > 0 ? (
                      <select
                        value={form.uniDept}
                        onChange={(e) => {
                          const dept = e.target.value
                          setForm({ ...form, uniDept: dept, uniLevel: '', classLevel: '' })
                        }}
                        required
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">Select department</option>
                        {uniDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    ) : (
                      <div className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted">
                        No departments defined yet — go to the Departments page to add them.
                      </div>
                    )}
                  </div>
                  {form.uniDept && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-2">Level <span className="text-destructive">*</span></label>
                        {/* One block per sitting, each labelled. A department that only runs
                            in the daytime shows a single unlabelled row exactly as before,
                            so nothing changes for a school with no evening programme. */}
                        {uniLevelsBySitting.EVENING.length === 0 ? (
                          <div className="flex flex-wrap gap-3">
                            {uniLevelsForDept.map(({ label, classLevel }) => (
                              <label key={classLevel} className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="uniLevel" value={classLevel} required
                                  checked={form.classLevel === classLevel}
                                  onChange={() => setForm({ ...form, uniLevel: label, classLevel, directLevel2Entry: false })}
                                  className="accent-primary" />
                                <span className="text-sm text-foreground">{label}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(['DAY', 'EVENING'] as const).map((sitting) => {
                              const options = uniLevelsBySitting[sitting]
                              if (options.length === 0) return null
                              return (
                                <div key={sitting} className="rounded-lg border border-border p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                    {t(PROGRAMME_LABELS[sitting])} {t('section')}
                                  </p>
                                  <div className="flex flex-wrap gap-4">
                                    {options.map(({ label, classLevel }) => (
                                      <label key={classLevel} className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="uniLevel" value={classLevel} required
                                          checked={form.classLevel === classLevel}
                                          onChange={() => setForm({ ...form, uniLevel: label, classLevel, directLevel2Entry: false })}
                                          className="accent-primary" />
                                        <span className="text-sm text-foreground">{label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {/* Level 2 has two kinds of student, and which one this is decides what
                          they are charged. The question is only worth asking when there is a
                          Level 1 to have come from — IN THE SAME SECTION, since an evening
                          Level 2 continues from evening Level 1, never from the day one. A
                          programme running Level 2 for the first time has no such cohort, so
                          every student in it is a direct entrant and the choice is made for
                          them rather than asked. */}
                      {form.uniLevel === 'Level 2' && (
                        level1ForSelectedClass ? (
                          <div className="space-y-2">
                            {!editingId && (
                              <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                                <strong>{t('Moving up a whole class?')}</strong> {t('Use the "Promote to Level 2" button on the students list instead, it moves the existing cohort in bulk without creating duplicates.')}
                              </div>
                            )}
                            <div className="rounded-lg border border-border p-3">
                              <p className="text-xs font-medium text-foreground mb-2">
                                {t('How is this student joining Level 2?')} <span className="text-destructive">*</span>
                              </p>
                              <div className="space-y-2">
                                {([false, true] as const).map((direct) => (
                                  <label key={String(direct)} className="flex items-start gap-2.5 cursor-pointer">
                                    <input type="radio" name="level2Entry" className="mt-0.5 accent-primary"
                                      checked={form.directLevel2Entry === direct}
                                      onChange={() => setForm({ ...form, directLevel2Entry: direct })} />
                                    <span>
                                      <span className="text-sm text-foreground block">
                                        {direct ? t('Direct entry') : t('Continuing from Level 1')}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {direct
                                          ? t('New here, did not do Level 1 at this school. Charged the Level 2 entry fee.')
                                          : `${t('Was in')} ${stripProgrammeSuffix(level1ForSelectedClass.name)}${programmeFilter.programmeOf(level1ForSelectedClass.name) === 'EVENING' ? ` (${t('Evening')})` : ''}. ${t('Already covered by the 2-year programme fee.')}`}
                                      </span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
                            {t('This programme has no Level 1 to continue from, so this student is a direct entrant and is charged the Level 2 entry fee.')}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ) : isSecondary ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{t('Department')} <span className="text-destructive">*</span></label>
                    {departments.length > 0 ? (
                      <select
                        value={form.secDept}
                        onChange={(e) => setForm({ ...form, secDept: e.target.value, classLevel: '', stream: '' })}
                        required
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">{t('Select department')}</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    ) : (
                      <div className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted dark:bg-card">
                        {t('No departments defined yet — go to the Classes page to add them.')}
                      </div>
                    )}
                  </div>
                  {form.secDept && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">{t('Class')} <span className="text-destructive">*</span></label>
                      {secDeptClasses.length > 0 ? (
                        <select
                          value={form.classLevel}
                          onChange={(e) => setForm({ ...form, classLevel: e.target.value, stream: '' })}
                          required
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="">{t('Select class')}</option>
                          {secDeptClasses.map((c) => (
                            <option key={c.id} value={c.name}>
                              {stripDeptSuffix(stripProgrammeSuffix(c.name))}{(c.programme ?? 'DAY') === 'EVENING' ? ` (${t('Evening')})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted dark:bg-card">
                          {t('No classes in this department yet — go to the Classes page to add them.')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Class')} <span className="text-destructive">*</span></label>
                  {formClasses.length > 0 ? (
                    <select
                      value={form.classLevel}
                      onChange={(e) => setForm({ ...form, classLevel: e.target.value, stream: '' })}
                      required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">{t('Select class')}</option>
                      {formClasses.map((c) => <option key={c.id} value={c.name}>{stripProgrammeSuffix(c.name)}</option>)}
                    </select>
                  ) : (
                    <div className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground bg-muted dark:bg-card">
                      {t('No classes defined yet — go to the Classes page to add them.')}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-foreground mb-2">{t('Gender')} <span className="text-destructive">*</span></label>
                <div className="flex gap-6">
                  {['Male', 'Female'].map((g) => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="gender" value={g} required
                        checked={form.gender === g}
                        onChange={() => setForm({ ...form, gender: g })}
                        className="accent-primary" />
                      <span className="text-sm text-foreground">{t(g)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-2">{t('Date of Birth')}</label>
                  <input type="date" value={form.dateOfBirth}
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-2">{t('Place of Birth')}</label>
                  <input type="text" value={form.placeOfBirth}
                    onChange={(e) => setForm({ ...form, placeOfBirth: e.target.value })}
                    placeholder={t('e.g. Bamenda')}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground" />
                </div>
              </div>
              {needsStream && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-2">{t('Stream')}</label>
                  <div className="flex gap-6">
                    {['Arts', 'Science'].map((s) => (
                      <label key={s} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="stream" value={s}
                          checked={form.stream === s}
                          onChange={() => setForm({ ...form, stream: s })}
                          className="accent-primary" />
                        <span className="text-sm text-foreground">{t(s)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {[
                { name: 'guardianName', label: 'Guardian Name', placeholder: 'e.g. Nguemo Jean' },
                { name: 'guardianPhone', label: 'Guardian Phone', placeholder: 'e.g. 677000000' },
                { name: 'guardianEmail', label: 'Guardian Email', placeholder: 'e.g. guardian@email.com' },
              ].map((field) => (
                <div key={field.name}>
                  <label className="block text-xs font-medium text-foreground mb-1">{t(field.label)}</label>
                  <input type="text" placeholder={field.placeholder}
                    value={form[field.name as keyof typeof emptyForm] as string}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">{t('Cancel')}</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving...') : editingId ? t('Save Changes') : t('Add Student')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground text-lg">{t('Import Students')}</h3>
              <button onClick={closeImportModal} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {isUniversity
                ? t('Upload an Excel or CSV roster to add students in one go. For Level 2 classes, include the Matricule column — students whose matricule or name already exist in the system are detected as carry-overs and will not be duplicated.')
                : t('Already have a student list in Excel? Upload it here instead of adding students one at a time. You can also include a Fee Paid column for students who already paid part of their fees.')}
            </p>

            <button onClick={handleDownloadTemplate}
              className="flex items-center gap-2 text-sm text-primary font-medium hover:underline mb-4">
              <Download size={14} /> {t('Download template')}
            </button>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">{t('Upload file (.xlsx or .csv)')} <span className="text-destructive">*</span></label>
              <input type="file" accept=".xlsx,.csv"
                onChange={handleImportFileChange}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              {importFile && <p className="text-xs text-muted-foreground mt-1">{t('Selected:')} {importFile.name}</p>}
            </div>

            {importPreviewing && (
              <p className="text-sm text-muted-foreground mt-4">{t('Reading file...')}</p>
            )}

            {importError && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{importError}</div>
            )}

            {importPreview && !importPreviewing && (
              <div className="mt-4 space-y-3">
                {importPreview.headerError ? (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
                    {importPreview.headerError}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                      {importPreview.valid.length} {t('students ready to import')}
                    </div>
                    {importPreview.carryOvers && importPreview.carryOvers.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 mb-2">
                          <CheckCircle2 size={16} className="flex-shrink-0" />
                          {importPreview.carryOvers.length} {t('already in system (carry-overs) — will be skipped')}
                        </div>
                        <div className="bg-muted rounded-lg border border-border max-h-36 overflow-y-auto">
                          {importPreview.carryOvers.map((c: CarryOverRow) => (
                            <div key={c.row} className="px-3 py-2 text-xs text-muted-foreground border-b border-border last:border-0 flex items-center justify-between gap-2">
                              <span>{c.name} <span className="text-foreground/50">— {stripProgrammeSuffix(c.classLevel)}</span></span>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c.matchType === 'matricule' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                {c.matchType === 'matricule' ? t('Matricule match') : t('Name match')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {importPreview.errors.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm text-destructive mb-2">
                          <AlertTriangle size={16} className="flex-shrink-0" />
                          {importPreview.errors.length} {t('rows have problems and will be skipped')}
                        </div>
                        <div className="bg-muted rounded-lg border border-border max-h-40 overflow-y-auto">
                          {importPreview.errors.map((e) => (
                            <div key={e.row} className="px-3 py-2 text-xs text-muted-foreground border-b border-border last:border-0">
                              {t('Row')} {e.row}: {e.reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-5">
              <button type="button" onClick={closeImportModal}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">
                {t('Cancel')}
              </button>
              <button type="button" onClick={handleImportCommit}
                disabled={!importPreview || importPreview.valid.length === 0 || importCommitting}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {importCommitting ? t('Importing...') : `${t('Import')} ${importPreview?.valid.length ?? 0} ${t('students')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {feesTarget && (
        <StudentFeesModal
          studentId={feesTarget.id}
          studentName={feesTarget.name}
          onClose={() => setFeesTarget(null)}
          onChanged={fetchFeesOverview}
        />
      )}

      {statusTarget && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground text-lg">{t('Change Status')}</h3>
              <button onClick={closeStatusModal} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{statusTarget.name}</p>
            <div className="space-y-2 mb-5">
              {STATUS_TABS.map((tab) => (
                <label key={tab.value} className="flex items-center gap-3 cursor-pointer border border-border rounded-lg px-3 py-2.5 hover:bg-hover transition">
                  <input type="radio" name="status" value={tab.value}
                    checked={newStatus === tab.value}
                    onChange={() => setNewStatus(tab.value)}
                    className="accent-primary" />
                  <span className="text-sm text-foreground">{t(tab.label)}</span>
                </label>
              ))}
            </div>
            {newStatus !== 'ACTIVE' && (
              <p className="text-xs text-muted-foreground mb-4">
                {t('A disabled or dismissed student is excluded from bulk report card printing and most active rosters. You can switch them back to Active at any time.')}
              </p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={closeStatusModal}
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">
                {t('Cancel')}
              </button>
              <button type="button" onClick={handleStatusSave} disabled={statusSaving}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                {statusSaving ? t('Saving...') : t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {promoteModalOpen && / - Level 1$/i.test(activeClass) && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
                  <ArrowUpCircle size={20} className="text-indigo-600 dark:text-indigo-400" />
                  Promote to Level 2
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeClass.replace(/ - Level 1$/i, '')} · Uncheck students who are not continuing
                </p>
              </div>
              <button onClick={() => setPromoteModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {promoteSelected.size} of {students.length} selected
              </span>
              <button
                onClick={() => {
                  if (promoteSelected.size === students.length) {
                    setPromoteSelected(new Set())
                  } else {
                    setPromoteSelected(new Set(students.map((s) => s.id)))
                  }
                }}
                className="text-xs text-primary hover:underline font-medium"
              >
                {promoteSelected.size === students.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-3 space-y-1">
              {students.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No students in this class.</p>
              )}
              {students.map((s) => {
                const feeRow = feesByStudent[s.id]
                const feeStatus = feeRow?.status
                const feeBadge =
                  feeStatus === 'COMPLETE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                  feeStatus === 'PARTIAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  feeStatus === 'UNPAID' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''
                const feeLabel2 =
                  feeStatus === 'COMPLETE' ? 'Fees complete' :
                  feeStatus === 'PARTIAL' ? 'Partly paid' :
                  feeStatus === 'UNPAID' ? 'Unpaid' : ''
                return (
                  <label key={s.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-hover transition border ${promoteSelected.has(s.id) ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-800' : 'border-transparent'}`}>
                    <input
                      type="checkbox"
                      checked={promoteSelected.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(promoteSelected)
                        if (e.target.checked) next.add(s.id)
                        else next.delete(s.id)
                        setPromoteSelected(next)
                      }}
                      className="accent-indigo-600 w-4 h-4 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.studentId}</p>
                    </div>
                    {feeLabel2 && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${feeBadge}`}>
                        {feeLabel2}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            <div className="p-6 pt-4 border-t border-border">
              {terms.some((t) => t.isCurrent) && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                  <strong>Academic year still active.</strong> End the current academic year on the Terms page before promoting students to Level 2.
                </div>
              )}
              <p className="text-xs text-muted-foreground mb-4">
                Selected students will be moved to <strong>{activeClass.replace(/ - Level 1$/i, ' - Level 2')}</strong>.
                They keep carry-over status — their 2-year program fee stays intact.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPromoteModalOpen(false)}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={promoting || promoteSelected.size === 0 || terms.some((t) => t.isCurrent)}
                  onClick={async () => {
                    setPromoting(true)
                    try {
                      const result = await bulkPromoteStudentsApi(Array.from(promoteSelected))
                      showToast(`${result.promoted} student${result.promoted !== 1 ? 's' : ''} promoted to Level 2`, 'success')
                      setPromoteModalOpen(false)
                      fetchStudents(activeClass)
                      fetchFilterClasses()
                    } catch (err: unknown) {
                      const e2 = err as { response?: { data?: { message?: string } } }
                      showToast(e2.response?.data?.message || 'Failed to promote students', 'error')
                    } finally {
                      setPromoting(false)
                    }
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition"
                >
                  {promoting ? 'Promoting...' : `Promote ${promoteSelected.size > 0 ? promoteSelected.size : ''} student${promoteSelected.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
