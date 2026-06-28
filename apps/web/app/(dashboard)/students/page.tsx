'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getStudentsApi, getStudentClassLevelsApi, createStudentApi, updateStudentApi, setStudentStatusApi, StudentStatus,
  downloadStudentImportTemplateApi, previewStudentImportApi, commitStudentImportApi, ImportPreviewResult,
} from '@/lib/api/students'
import { getClassLevelsApi, ClassLevel } from '@/lib/api/classLevels'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getTermsApi } from '@/lib/api/terms'
import { Users, Plus, Search, UserX, Pencil, X, Wallet, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import StudentFeesModal from '@/components/ui/StudentFeesModal'
import { usePagination } from '@/lib/usePagination'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import { getFeesOverviewApi, formatXAF, FeeOverviewRow } from '@/lib/api/fees'
import { buildCsv, saveCsv, saveBlob, datedFilename } from '@/lib/csv'
import { downloadZip } from '@/lib/zip'

interface Student {
  id: string; name: string; studentId: string
  classLevel: string; gender?: string; guardianName?: string
  guardianPhone?: string; guardianEmail?: string
  status?: StudentStatus
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

const emptyForm = { name: '', studentId: '', classLevel: '', stream: '', gender: '', guardianName: '', guardianPhone: '', guardianEmail: '', uniDept: '', uniLevel: '' }

// Helpers for parsing university class level names
function univDept(classLevel: string): string {
  if (classLevel.startsWith('HND ')) return classLevel.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (classLevel.startsWith('Degree ')) return classLevel.replace(/^Degree /, '')
  return classLevel
}
function univLevel(classLevel: string): string {
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
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const [students, setStudents] = useState<Student[]>([])
  const [filterClasses, setFilterClasses] = useState<string[]>([])
  const [definedClasses, setDefinedClasses] = useState<ClassLevel[]>([])
  const [activeClass, setActiveClass] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StudentStatus>('ACTIVE')
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

  // University two-step picker: unique departments, then available levels per dept
  const uniDepts = useMemo(() =>
    isUniversity ? Array.from(new Set(definedClasses.map((c) => univDept(c.name)))).sort() : [],
  [isUniversity, definedClasses])

  const uniLevelsForDept = useMemo(() => {
    if (!isUniversity || !form.uniDept) return []
    return definedClasses
      .filter((c) => univDept(c.name) === form.uniDept)
      .map((c) => ({ label: univLevel(c.name), classLevel: c.name }))
      .filter((x) => x.label)
      .sort((a, b) => {
        const order: Record<string, number> = { 'Level 1': 0, 'Level 2': 1, 'Level 3': 2 }
        return (order[a.label] ?? 3) - (order[b.label] ?? 3)
      })
  }, [isUniversity, form.uniDept, definedClasses])

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
      guardianName: s.guardianName || '',
      guardianPhone: s.guardianPhone || '',
      guardianEmail: s.guardianEmail || '',
      uniDept: isUniversity ? univDept(baseClass) : '',
      uniLevel: isUniversity ? univLevel(baseClass) : '',
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
      const { stream, studentId: _sid, ...rest } = form
      if (editingId) {
        await updateStudentApi(editingId, { ...rest, classLevel })
        showToast(t('Student updated'))
      } else {
        await createStudentApi({ ...rest, classLevel })
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
      const result = await previewStudentImportApi(file)
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
    if (targetTerms.length === 0) { showToast(t('No term selected'), 'error'); return }
    const targetClasses = activeClass !== 'all' ? [activeClass] : filterClasses
    if (targetClasses.length === 0) { showToast(t('Nothing to export'), 'error'); return }
    const cols = [
      { label: t('Name'), value: (s: Student) => s.name },
      { label: t('Student ID'), value: (s: Student) => s.studentId },
      { label: t('Class'), value: (s: Student) => s.classLevel },
      { label: t('Subjects'), value: (s: Student) => (subjectsByClass[s.classLevel] || []).join(', ') },
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

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(students, 15, `${activeClass}|${search}|${statusFilter}`)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Students')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {students.length} {activeClass !== 'all' ? `${t('in')} ${activeClass}` : t('total students')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition">
            <Download size={16} /> {exporting ? t('Exporting...') : t('Export CSV')}
          </button>
          <button onClick={openImportModal}
            className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition">
            <Upload size={16} /> {t('Import Students')}
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
            <Plus size={16} /> {t('Add Student')}
          </button>
        </div>
      </div>

      {filterClasses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleClassFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeClass === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}>
            {t('All')}
          </button>
          {filterClasses.map((cls) => (
            <button key={cls} onClick={() => handleClassFilter(cls)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeClass === cls ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}>
              {cls}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground mr-1">{t('Status')}:</span>
        {STATUS_TABS.map((tab) => (
          <button key={tab.value} onClick={() => handleStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${statusFilter === tab.value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}>
            {t(tab.label)}
          </button>
        ))}
      </div>

      {visibleTerms.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground mr-1">{t('Export by term')}:</span>
          <button onClick={() => handleTermFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${!activeTermId ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
            {t('All Terms')}
          </button>
          {visibleTerms.map((tm) => (
            <button key={tm.id} onClick={() => handleTermFilter(tm.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeTermId === tm.id ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
              {tm.name}{tm.isCurrent ? ` (${t('Current')})` : ''}
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder={t('Search students...')} value={search} onChange={handleSearch}
          className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
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
          <table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Name')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Student ID')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{isUniversity ? 'Department' : t('Class')}</th>
                {isUniversity && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">Level</th>}
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Gender')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Guardian')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Fees')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Status')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.map((s) => (
                <tr key={s.id} className="hover:bg-muted dark:hover:bg-muted transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex-shrink-0 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                        {s.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.studentId}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {isUniversity ? univDept(s.classLevel) : s.classLevel}
                  </td>
                  {isUniversity && (
                    <td className="px-4 py-3">
                      {(() => {
                        const b = univLevelBadge(s.classLevel)
                        return b
                          ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${b.cls}`}>{b.label}</span>
                          : <span className="text-muted-foreground text-sm">—</span>
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.gender ? t(s.gender) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.guardianName || '—'}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const f = feesByStudent[s.id]
                      if (!f || f.status === 'NONE') return <span className="text-muted-foreground text-sm">—</span>
                      if (f.status === 'COMPLETE') return <span className="inline-flex px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">{t('Complete')}</span>
                      const cls = f.status === 'UNPAID' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{formatXAF(f.balance)} {t('left')}</span>
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[s.status ?? 'ACTIVE']}`}>
                      {t(STATUS_TABS.find((tab) => tab.value === (s.status ?? 'ACTIVE'))?.label ?? 'Active')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFeesTarget({ id: s.id, name: s.name })} title={t('School Fees')}
                        className="p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 rounded transition">
                        <Wallet size={14} />
                      </button>
                      <button onClick={() => openEdit(s)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => openStatusModal(s)} title={t('Change Status')}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                        <UserX size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
                <label className="block text-xs font-medium text-foreground mb-1">{t('Full Name')}</label>
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
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-2">Level <span className="text-destructive">*</span></label>
                      <div className="flex flex-wrap gap-3">
                        {uniLevelsForDept.map(({ label, classLevel }) => (
                          <label key={label} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="uniLevel" value={label} required
                              checked={form.uniLevel === label}
                              onChange={() => setForm({ ...form, uniLevel: label, classLevel })}
                              className="accent-primary" />
                            <span className="text-sm text-foreground">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Class')}</label>
                  {definedClasses.length > 0 ? (
                    <select
                      value={form.classLevel}
                      onChange={(e) => setForm({ ...form, classLevel: e.target.value, stream: '' })}
                      required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">{t('Select class')}</option>
                      {definedClasses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
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
                    value={form[field.name as keyof typeof emptyForm]}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-border text-foreground dark:text-foreground py-2 rounded-lg text-sm hover:bg-muted dark:hover:bg-muted transition">{t('Cancel')}</button>
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
              {t('Already have a student list in Excel? Upload it here instead of adding students one at a time. You can also include a Fee Paid column for students who already paid part of their fees.')}
            </p>

            <button onClick={handleDownloadTemplate}
              className="flex items-center gap-2 text-sm text-primary font-medium hover:underline mb-4">
              <Download size={14} /> {t('Download template')}
            </button>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">{t('Upload file (.xlsx or .csv)')}</label>
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
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
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
                <label key={tab.value} className="flex items-center gap-3 cursor-pointer border border-border rounded-lg px-3 py-2.5 hover:bg-muted transition">
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
                className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
