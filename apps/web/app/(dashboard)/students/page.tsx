'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getStudentsApi, getStudentClassLevelsApi, createStudentApi, updateStudentApi, deleteStudentApi } from '@/lib/api/students'
import { getClassLevelsApi, ClassLevel } from '@/lib/api/classLevels'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getTermsApi } from '@/lib/api/terms'
import { Users, Plus, Search, Trash2, Pencil, X, Wallet, Download } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import StudentFeesModal from '@/components/ui/StudentFeesModal'
import { usePagination } from '@/lib/usePagination'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import { getFeesOverviewApi, formatXAF, FeeOverviewRow } from '@/lib/api/fees'
import { buildCsv, saveCsv, datedFilename } from '@/lib/csv'
import { downloadZip } from '@/lib/zip'

interface Student {
  id: string; name: string; studentId: string
  classLevel: string; guardianName?: string
  guardianPhone?: string; guardianEmail?: string
}

const emptyForm = { name: '', studentId: '', classLevel: '', stream: '', guardianName: '', guardianPhone: '', guardianEmail: '' }

export default function StudentsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const [students, setStudents] = useState<Student[]>([])
  const [filterClasses, setFilterClasses] = useState<string[]>([])
  const [definedClasses, setDefinedClasses] = useState<ClassLevel[]>([])
  const [activeClass, setActiveClass] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [feesTarget, setFeesTarget] = useState<{ id: string; name: string } | null>(null)
  const [feesByStudent, setFeesByStudent] = useState<Record<string, FeeOverviewRow>>({})
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, string[]>>({})
  const [exporting, setExporting] = useState(false)
  const [terms, setTerms] = useState<{ id: string; name: string; session: string; isCurrent: boolean }[]>([])
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
  const fetchStudents = async (classFilter = activeClass, searchVal = search) => {
    try {
      setLoading(true)
      const params: { classLevel?: string; search?: string } = {}
      if (classFilter && classFilter !== 'all') params.classLevel = classFilter
      if (searchVal) params.search = searchVal
      const data = await getStudentsApi(params)
      setStudents(data.students)
    } catch { console.error('Failed to fetch students') }
    finally { setLoading(false) }
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
      guardianName: s.guardianName || '',
      guardianPhone: s.guardianPhone || '',
      guardianEmail: s.guardianEmail || '',
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
    if (needsStream && !form.stream) {
      setError(t('Please select a stream (Arts or Science)'))
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
        showToast(t('Student added successfully'))
      }
      closeModal()
      fetchStudents(activeClass)
      fetchFilterClasses()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || t('Failed to save student'))
    } finally { setSaving(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteStudentApi(deleteTarget.id)
      setDeleteTarget(null)
      fetchStudents(activeClass)
      fetchFilterClasses()
      showToast(t('Student deleted'))
    } catch {
      showToast(t('Failed to delete student'), 'error')
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
    const targetTerms = activeTermId ? terms.filter((tm) => tm.id === activeTermId) : terms
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

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(students, 15, `${activeClass}|${search}`)

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

      {terms.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground mr-1">{t('Export by term')}:</span>
          <button onClick={() => handleTermFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${!activeTermId ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
            {t('All Terms')}
          </button>
          {terms.map((tm) => (
            <button key={tm.id} onClick={() => handleTermFilter(tm.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeTermId === tm.id ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
              {tm.name} {tm.session}{tm.isCurrent ? ` (${t('Current')})` : ''}
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
            <p className="text-muted-foreground text-sm">{t('No students yet.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Name')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Student ID')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Class')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Guardian')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase">{t('Fees')}</th>
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
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.classLevel}</td>
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
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFeesTarget({ id: s.id, name: s.name })} title={t('School Fees')}
                        className="p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 rounded transition">
                        <Wallet size={14} />
                      </button>
                      <button onClick={() => openEdit(s)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                        <Trash2 size={14} />
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

      {feesTarget && (
        <StudentFeesModal
          studentId={feesTarget.id}
          studentName={feesTarget.name}
          onClose={() => setFeesTarget(null)}
          onChanged={fetchFeesOverview}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={t('Delete Student')}
        message={`${t('Are you sure you want to delete')} ${deleteTarget?.name}? ${t('This cannot be undone.')}`}
        confirmLabel={t('Delete')}
        confirmColor="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
