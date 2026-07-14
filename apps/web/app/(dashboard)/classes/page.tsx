'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getClassLevelsApi, createClassLevelApi, updateClassLevelApi, deleteClassLevelApi, ClassLevel } from '@/lib/api/classLevels'
import { getDepartmentsApi, createDepartmentApi, updateDepartmentApi, deleteDepartmentApi, Department } from '@/lib/api/departments'
import { copySubjectsApi } from '@/lib/api/subjects'
import { GraduationCap, Plus, Pencil, Trash2, X, ChevronUp, ChevronDown, Layers } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import { usePagination } from '@/lib/usePagination'
import { formatXAF } from '@/lib/api/fees'

// ── University class-name helpers ────────────────────────────────────────────
type UniLevel = 'Level 1' | 'Level 2' | 'Level 3'

function deptFromClassName(name: string): string {
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}

function levelFromClassName(name: string): UniLevel | '' {
  if (/ - Level 1$/i.test(name)) return 'Level 1'
  if (/ - Level 2$/i.test(name)) return 'Level 2'
  if (name.startsWith('Degree ') || / - Level 3$/i.test(name)) return 'Level 3'
  return ''
}

function buildClassName(dept: string, level: UniLevel): string {
  if (level === 'Level 1') return `HND ${dept} - Level 1`
  if (level === 'Level 2') return `HND ${dept} - Level 2`
  return `Degree ${dept}`
}

const UNI_LEVELS: UniLevel[] = ['Level 1', 'Level 2', 'Level 3']
const UNI_LEVEL_LABELS: Record<UniLevel, string> = {
  'Level 1': 'Level 1 (HND I)',
  'Level 2': 'Level 2 (HND II)',
  'Level 3': 'Level 3 (Degree)',
}

// ── Secondary department helpers ─────────────────────────────────────────────
// Non-default departments store their classes with a " (Department)" suffix so
// the globally-unique class name can repeat the same form across departments
// (Grammar Form 1 vs Technical Form 1). The department is authoritatively known
// via departmentId; the suffix is stripped for display inside a department tab.
const DEPT_SUGGESTIONS = ['Grammar', 'Technical', 'Commercial']
const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
function stripDeptSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

// Secondary schools track GCE exam registration for Form 5 (O Level) and Upper
// Sixth (A Level) classes — including stream/department suffixes, e.g. "Form 5 Science".
function isExamRegistrationClass(name: string): boolean {
  return /^Form\s?5\b/i.test(name.trim()) || /^Upper\s?Sixth\b/i.test(name.trim())
}
const GCE_DEFAULT_FEE = '20000'

// ── Form shape ───────────────────────────────────────────────────────────────
type FormState = {
  name: string         // non-university: free text class name
  deptName: string     // university: bare department name
  uniLevel: UniLevel   // university: which level
  abbreviation: string
  hasStream: boolean
  maxScore: string
  feeAmount: string
  hndRegistrationFee: string
}

const STD_EMPTY: FormState  = { name: '', deptName: '', uniLevel: 'Level 1', abbreviation: '', hasStream: false, maxScore: '20',  feeAmount: '150000', hndRegistrationFee: GCE_DEFAULT_FEE }
const UNI_EMPTY: FormState  = { name: '', deptName: '', uniLevel: 'Level 1', abbreviation: '', hasStream: false, maxScore: '100', feeAmount: '650000', hndRegistrationFee: '65000' }

export default function ClassesPage() {
  const router = useRouter()
  const { isAuthenticated, school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  const tt = (classStr: string, deptStr: string) => t(isUniversity ? deptStr : classStr)

  const [classes, setClasses]         = useState<ClassLevel[]>([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState<ClassLevel | null>(null)
  const [form, setForm]               = useState<FormState>(STD_EMPTY)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ClassLevel | null>(null)
  const [activeLevel, setActiveLevel] = useState<UniLevel>('Level 1')

  // ── Secondary departments ──
  const [departments, setDepartments]   = useState<Department[]>([])
  const [activeDeptId, setActiveDeptId] = useState<string>('')
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [editingDept, setEditingDept]   = useState<Department | null>(null)
  const [deptName, setDeptName]         = useState('')
  const [deptSaving, setDeptSaving]     = useState(false)
  const [deptError, setDeptError]       = useState('')
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<Department | null>(null)
  const activeDept = departments.find(d => d.id === activeDeptId)

  // ── Secondary class sections (A/B/C…) ──
  const [sections, setSections] = useState<string[]>(['A'])
  const [copyFrom, setCopyFrom] = useState<string>('')  // source class to copy subjects from

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else {
      fetchClasses()
      if (isSecondary) fetchDepartments()
    }
  }, [isAuthenticated])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const data = await getClassLevelsApi()
      setClasses(data.classLevels)
    } catch { console.error('Failed to fetch classes') }
    finally { setLoading(false) }
  }

  const fetchDepartments = async () => {
    try {
      const d = await getDepartmentsApi()
      setDepartments(d.departments)
      setActiveDeptId(prev =>
        prev && d.departments.some(x => x.id === prev)
          ? prev
          : (d.departments.find(x => x.isDefault)?.id ?? d.departments[0]?.id ?? ''))
    } catch { /* ignore */ }
  }

  // Which classes to show for the active tab / department
  const displayedClasses = useMemo(() => {
    if (isUniversity) return classes.filter((c) => levelFromClassName(c.name) === activeLevel)
    if (isSecondary && activeDeptId) return classes.filter((c) => c.departmentId === activeDeptId)
    return classes
  }, [isUniversity, isSecondary, classes, activeLevel, activeDeptId])

  const composeClassName = (base: string): string => {
    const b = stripDeptSuffix(base)
    if (!isSecondary || !activeDept || activeDept.isDefault) return b
    return `${b} (${activeDept.name})`
  }

  const displayClassName = (cls: ClassLevel): string =>
    isUniversity ? deptFromClassName(cls.name) : isSecondary ? stripDeptSuffix(cls.name) : cls.name

  const openAdd = () => {
    setEditing(null)
    // Entry/registration fees are never pre-filled on create — only shown as
    // placeholder suggestions — so the admin has to consciously enter them.
    setForm(isUniversity
      ? { ...UNI_EMPTY, uniLevel: activeLevel, feeAmount: activeLevel === 'Level 2' ? '' : UNI_EMPTY.feeAmount, hndRegistrationFee: '' }
      : { ...STD_EMPTY, hndRegistrationFee: '' })
    setSections(['A'])
    setCopyFrom('')
    setError('')
    setShowModal(true)
  }

  const openEdit = (cls: ClassLevel) => {
    setEditing(cls)
    if (isUniversity) {
      setForm({
        name: cls.name,
        deptName: deptFromClassName(cls.name),
        uniLevel: levelFromClassName(cls.name) || 'Level 1',
        abbreviation: cls.abbreviation ?? '',
        hasStream: false,
        maxScore: String(cls.maxScore ?? 100),
        feeAmount: String(cls.feeAmount ?? 0),
        hndRegistrationFee: String(cls.hndRegistrationFee ?? 65000),
      })
    } else {
      setForm({
        name: isSecondary ? stripDeptSuffix(cls.name) : cls.name,
        deptName: '',
        uniLevel: 'Level 1',
        abbreviation: cls.abbreviation ?? '',
        hasStream: cls.hasStream,
        maxScore: String(cls.maxScore ?? 20),
        feeAmount: String(cls.feeAmount ?? 0),
        hndRegistrationFee: String(cls.hndRegistrationFee ?? GCE_DEFAULT_FEE),
      })
    }
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditing(null)
    setForm(isUniversity ? UNI_EMPTY : STD_EMPTY)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Derive the final stored class name(s). Secondary create can produce several
    // classes at once — one per selected section letter (Form 1 A, Form 1 B, …).
    const secBase = stripDeptSuffix(form.name.trim())
    let finalNames: string[]
    if (isUniversity) {
      if (!form.deptName.trim()) { setError(tt('Class name is required.', 'Department name is required.')); return }
      if (!form.abbreviation.trim()) { setError(t('Abbreviation for student matricule is required.')); return }
      finalNames = [buildClassName(form.deptName.trim(), form.uniLevel)]
    } else if (isSecondary) {
      if (!secBase) { setError(t('Class name is required.')); return }
      finalNames = editing
        ? [composeClassName(secBase)]
        : (sections.length ? sections : ['A']).map((l) => composeClassName(`${secBase} ${l}`))
    } else {
      if (!form.name.trim()) { setError(t('Class name is required.')); return }
      finalNames = [form.name.trim()]
    }

    // Level 2 entry fee defaults to half of Level 1's fee (suggested when the field
    // is opened) but the admin can always type a different amount — always use
    // whatever is in the field at submit time.
    if (form.feeAmount.trim() === '' || isNaN(Number(form.feeAmount)) || Number(form.feeAmount) < 0) {
      setError(tt('Enter the class fee (use 0 if there is none).', 'Enter the department fee (use 0 if there is none).'))
      return
    }

    const buildPayload = (name: string) => {
      const isExamReg = isUniversity ? form.uniLevel === 'Level 2' : isExamRegistrationClass(name)
      return {
        name,
        abbreviation: form.abbreviation.trim() || undefined,
        hasStream: isUniversity ? false : form.hasStream,
        maxScore: Number(form.maxScore),
        feeAmount: Number(form.feeAmount) || 0,
        hndRegistrationFee: isExamReg ? (Number(form.hndRegistrationFee) || 0) : null,
        ...(isSecondary && activeDeptId ? { departmentId: activeDeptId } : {}),
      }
    }

    setSaving(true)
    try {
      if (editing) {
        await updateClassLevelApi(editing.id, buildPayload(finalNames[0]))
        showToast(tt('Class updated', 'Department updated'))
      } else {
        // Skip any sections that already exist so a duplicate doesn't abort the batch.
        const existingNames = new Set(classes.map((c) => c.name))
        const toCreate = finalNames.filter((n) => !existingNames.has(n))
        if (toCreate.length === 0) { setError(t('Those classes already exist.')); setSaving(false); return }
        for (let i = 0; i < toCreate.length; i++) {
          await createClassLevelApi({ ...buildPayload(toCreate[i]), order: classes.length + i })
        }
        if (isSecondary && copyFrom) {
          await Promise.all(toCreate.map((nm) => copySubjectsApi(copyFrom, nm).catch(() => {})))
        }
        showToast(toCreate.length > 1 ? `${toCreate.length} ${t('classes added')}` : tt('Class added', 'Department added'))
      }
      closeModal()
      fetchClasses()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || tt('Failed to save class', 'Failed to save department'))
    } finally { setSaving(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteClassLevelApi(deleteTarget.id)
      setDeleteTarget(null)
      fetchClasses()
      showToast(tt('Class deleted', 'Department deleted'))
    } catch {
      showToast(tt('Failed to delete class', 'Failed to delete department'), 'error')
    }
  }

  // Reorder within the currently displayed list by swapping the two classes' order values.
  const moveClass = async (displayIndex: number, direction: 'up' | 'down') => {
    const list = displayedClasses
    const swapIndex = direction === 'up' ? displayIndex - 1 : displayIndex + 1
    if (swapIndex < 0 || swapIndex >= list.length) return
    const a = list[displayIndex], b = list[swapIndex]
    const next = classes
      .map(c => c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c)
      .sort((x, y) => x.order - y.order)
    setClasses(next)
    try {
      await Promise.all([
        updateClassLevelApi(a.id, { order: b.order }),
        updateClassLevelApi(b.id, { order: a.order }),
      ])
    } catch { fetchClasses() }
  }

  // ── Department CRUD ──
  const openAddDept = () => { setEditingDept(null); setDeptName(''); setDeptError(''); setShowDeptModal(true) }
  const openEditDept = (d: Department) => { setEditingDept(d); setDeptName(d.name); setDeptError(''); setShowDeptModal(true) }

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deptName.trim()) { setDeptError(t('Department name is required.')); return }
    setDeptSaving(true)
    try {
      if (editingDept) {
        await updateDepartmentApi(editingDept.id, { name: deptName.trim() })
        showToast(t('Department updated'))
      } else {
        const { department } = await createDepartmentApi(deptName.trim())
        showToast(t('Department created'))
        setActiveDeptId(department.id)
      }
      setShowDeptModal(false)
      fetchDepartments()
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      setDeptError(e2.response?.data?.message || t('Failed to save department'))
    } finally { setDeptSaving(false) }
  }

  const handleDeptDelete = async () => {
    if (!deleteDeptTarget) return
    try {
      await deleteDepartmentApi(deleteDeptTarget.id)
      if (activeDeptId === deleteDeptTarget.id) setActiveDeptId('')
      setDeleteDeptTarget(null)
      fetchDepartments()
      showToast(t('Department deleted'))
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } }
      showToast(e2.response?.data?.message || t('Failed to delete department'), 'error')
      setDeleteDeptTarget(null)
    }
  }

  const { page, setPage, totalPages, pageItems, total, pageSize, start } =
    usePagination(displayedClasses, 15, isUniversity ? activeLevel : activeDeptId)

  const headerCount = isUniversity
    ? `${displayedClasses.length} department${displayedClasses.length !== 1 ? 's' : ''} in ${activeLevel}`
    : isSecondary
      ? `${displayedClasses.length} ${displayedClasses.length !== 1 ? 'classes' : 'class'}${activeDept ? ` in ${activeDept.name}` : ''}`
      : `${classes.length} ${classes.length !== 1 ? 'classes defined' : 'class defined'}`

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{tt('Classes', 'Departments')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{headerCount}</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition active:scale-95">
          <Plus size={16} /> {tt('Add Class', 'Add Department')}
        </button>
      </div>

      {/* ── Secondary department bar ── */}
      {isSecondary && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {departments.map((d) => {
            const count = classes.filter((c) => c.departmentId === d.id).length
            const active = activeDeptId === d.id
            return (
              <button key={d.id} onClick={() => setActiveDeptId(d.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 active:scale-95 ${
                  active ? 'bg-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}>
                <Layers size={14} className={active ? 'text-white' : 'text-muted-foreground'} />
                {d.name}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            )
          })}

          {/* Manage the active department */}
          {activeDept && (
            <div className="flex items-center gap-1 ml-1">
              <button onClick={() => openEditDept(activeDept)} title={t('Rename department')}
                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition">
                <Pencil size={14} />
              </button>
              {!activeDept.isDefault && (
                <button onClick={() => setDeleteDeptTarget(activeDept)} title={t('Delete department')}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}

          <button onClick={openAddDept}
            className="ml-auto flex items-center gap-1.5 text-sm text-primary border border-dashed border-primary/40 px-3 py-2 rounded-lg hover:bg-primary/5 transition active:scale-95">
            <Plus size={14} /> {t('Add Department')}
          </button>
        </div>
      )}

      {/* ── University level tabs ── */}
      {isUniversity && (
        <div className="flex gap-2 mb-4">
          {UNI_LEVELS.map((lv) => {
            const count = classes.filter((c) => levelFromClassName(c.name) === lv).length
            return (
              <button key={lv} onClick={() => setActiveLevel(lv)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 active:scale-95 ${
                  activeLevel === lv
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                {lv}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeLevel === lv ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Table ── */}
      <div key={isUniversity ? activeLevel : activeDeptId} className="bg-card rounded-xl border border-border overflow-hidden animate-fade-in-up">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
        ) : displayedClasses.length === 0 ? (
          <div className="text-center py-12">
            <GraduationCap size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              {isUniversity
                ? `No departments in ${activeLevel} yet. Click "Add Department" to create one.`
                : isSecondary
                  ? `${t('No classes in')} ${activeDept?.name ?? ''} ${t('yet. Click "Add Class" to create one.')}`
                  : t('No classes yet. Add your first class to get started.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {!isUniversity && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Order')}</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{tt('Class Name', 'Department Name')}</th>
                  {isUniversity && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Abbr.')}</th>}
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Max Score')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">
                    {t('Fee')}
                    {isUniversity && <span className="ml-1 text-[10px] normal-case font-normal text-muted-foreground">{activeLevel === 'Level 1' ? '(2-yr program)' : activeLevel === 'Level 2' ? '(½ of L1)' : '(annual)'}</span>}
                  </th>
                  {isUniversity && activeLevel === 'Level 2' && (
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">HND Reg. Fee</th>
                  )}
                  {isSecondary && (
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">GCE Reg. Fee</th>
                  )}
                  {!isUniversity && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Stream')}</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((cls, idx) => {
                  const i = start + idx
                  return (
                    <tr key={cls.id} className="hover:bg-muted dark:hover:bg-muted transition">
                      {!isUniversity && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => moveClass(i, 'up')} disabled={i === 0}
                              className="p-0.5 text-muted-foreground disabled:opacity-20 transition">
                              <ChevronUp size={14} />
                            </button>
                            <button onClick={() => moveClass(i, 'down')} disabled={i === displayedClasses.length - 1}
                              className="p-0.5 text-muted-foreground disabled:opacity-20 transition">
                              <ChevronDown size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {i + 1}
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {displayClassName(cls)}
                          </span>
                        </div>
                      </td>
                      {isUniversity && (
                        <td className="px-4 py-3">
                          {cls.abbreviation
                            ? <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{cls.abbreviation}</span>
                            : <span className="text-muted-foreground text-sm">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-primary">/ {cls.maxScore ?? 20}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cls.feeAmount > 0
                          ? <span className={`text-sm font-medium ${isUniversity && (activeLevel === 'Level 1' || activeLevel === 'Level 2') ? 'text-indigo-600' : 'text-foreground'}`}>{formatXAF(cls.feeAmount)}</span>
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </td>
                      {isUniversity && activeLevel === 'Level 2' && (
                        <td className="px-4 py-3 text-right">
                          {cls.hndRegistrationFee != null
                            ? <span className="text-sm font-medium text-indigo-600">{formatXAF(cls.hndRegistrationFee)}</span>
                            : <span className="text-xs text-amber-600">not set</span>}
                        </td>
                      )}
                      {isSecondary && (
                        <td className="px-4 py-3 text-right">
                          {!isExamRegistrationClass(cls.name)
                            ? <span className="text-muted-foreground text-sm">—</span>
                            : cls.hndRegistrationFee != null
                              ? <span className="text-sm font-medium text-indigo-600">{formatXAF(cls.hndRegistrationFee)}</span>
                              : <span className="text-xs text-amber-600">not set</span>}
                        </td>
                      )}
                      {!isUniversity && (
                        <td className="px-4 py-3">
                          {cls.hasStream
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{t('Arts')} / {t('Science')}</span>
                            : <span className="text-muted-foreground text-sm">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(cls)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteTarget(cls)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                            <Trash2 size={14} />
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

      {/* ── Add / Edit class modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-zinc-800 max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{editing ? tt('Edit Class', 'Edit Department') : tt('Add Class', 'Add Department')}</h3>
                {isUniversity && (
                  <p className="text-xs text-muted-foreground mt-0.5">{UNI_LEVEL_LABELS[form.uniLevel]}</p>
                )}
                {isSecondary && activeDept && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t('Department:')} <span className="font-medium text-foreground">{activeDept.name}</span></p>
                )}
              </div>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* University: department name + level picker */}
              {isUniversity ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Department Name <span className="text-destructive">*</span></label>
                    <input type="text" placeholder="e.g. Hardware Maintenance, Software Development"
                      value={form.deptName}
                      onChange={(e) => setForm({ ...form, deptName: e.target.value })}
                      required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    {form.deptName.trim() && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Will be saved as: <span className="font-medium text-foreground">{buildClassName(form.deptName.trim(), form.uniLevel)}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground mb-2">Class <span className="text-destructive">*</span></label>
                    <div className="grid grid-cols-3 gap-2">
                      {UNI_LEVELS.map((lv) => (
                        <button key={lv} type="button"
                          onClick={() => {
                            // Never pre-fill the Level 2 entry fee on create — the half-fee is
                            // only ever shown as a placeholder suggestion, not auto-applied.
                            if (lv === 'Level 2' && !editing) {
                              setForm({ ...form, uniLevel: lv, feeAmount: '' })
                              return
                            }
                            setForm({ ...form, uniLevel: lv })
                          }}
                          className={`py-2 px-1 rounded-lg border text-xs font-medium transition text-center ${
                            form.uniLevel === lv
                              ? 'bg-primary text-white border-primary'
                              : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          }`}>
                          {lv}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{UNI_LEVEL_LABELS[form.uniLevel]}</p>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t('Class Name')}
                    {isSecondary && !editing && <span className="text-muted-foreground font-normal"> ({t('without section')})</span>}
                    {' '}<span className="text-destructive">*</span>
                  </label>
                  <input type="text" placeholder={isSecondary ? 'e.g. Form 1, Lower Sixth Science' : 'e.g. Form 3, Class 5, Lower Sixth'}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />

                  {/* Section letters — secondary, create only. Each becomes its own class. */}
                  {isSecondary && !editing && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-foreground mb-1.5">{t('Sections')}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SECTION_LETTERS.map((l) => {
                          const on = sections.includes(l)
                          return (
                            <button key={l} type="button"
                              onClick={() => setSections((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l].sort())}
                              className={`w-9 h-9 rounded-lg border text-sm font-semibold transition ${on ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                              {l}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {form.name.trim()
                          ? <>{t('Creates')}: <span className="font-medium text-foreground">{(sections.length ? sections : ['A']).map((l) => `${stripDeptSuffix(form.name)} ${l}`).join(', ')}</span></>
                          : t('Each section is its own class. Most schools just use A.')}
                      </p>
                    </div>
                  )}

                  {/* Copy subjects from an existing class in this department (optional) */}
                  {isSecondary && !editing && classes.some((c) => c.departmentId === activeDeptId) && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t('Copy subjects from')} <span className="text-muted-foreground font-normal">({t('optional')})</span>
                      </label>
                      <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">{t('Start empty')}</option>
                        {classes.filter((c) => c.departmentId === activeDeptId).map((c) => (
                          <option key={c.id} value={c.name}>{stripDeptSuffix(c.name)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {isSecondary && activeDept && !activeDept.isDefault && editing && form.name.trim() && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('Saved as')}: <span className="font-medium text-foreground">{composeClassName(form.name)}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Abbreviation (university only) */}
              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Abbreviation')} <span className="text-muted-foreground font-normal">(for student matricule)</span> <span className="text-destructive">*</span></label>
                  <input type="text" placeholder="e.g. HWM, SWE, MF"
                    value={form.abbreviation}
                    onChange={(e) => setForm({ ...form, abbreviation: e.target.value.toUpperCase() })}
                    maxLength={10}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}

              {/* Max score */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{isUniversity ? t('Max Score per Course') : t('Max Score per Subject')} <span className="text-destructive">*</span></label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t('out of')}</span>
                  <input type="number" min="1" max="1000" placeholder={isUniversity ? '100' : '20'}
                    value={form.maxScore}
                    onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                    required
                    className="w-24 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>

              {/* School fee */}
              {isUniversity && form.uniLevel === 'Level 2' ? (() => {
                const l1 = form.deptName.trim()
                  ? classes.find((c) => c.name === `HND ${form.deptName.trim()} - Level 1`)
                  : null
                const halfFee = l1 && l1.feeAmount > 0 ? Math.round(l1.feeAmount / 2) : null
                return (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Level 2 Entry Fee (XAF) <span className="text-destructive">*</span></label>
                    <input type="number" min="0" step="any" placeholder={halfFee !== null ? String(halfFee) : '0'} required
                      value={form.feeAmount}
                      onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                    {halfFee !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Suggested: half the 2-year program fee ({formatXAF(l1!.feeAmount)}) = {formatXAF(halfFee)}.
                        {Number(form.feeAmount) !== halfFee && (
                          <>
                            {' '}
                            <button type="button" onClick={() => setForm({ ...form, feeAmount: String(halfFee) })}
                              className="text-primary font-medium hover:underline">Use {formatXAF(halfFee)}</button>
                          </>
                        )}
                        {' '}Enter a different amount if this department's Level 2 entry fee isn't exactly half.
                      </p>
                    )}
                    {halfFee === null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Create the Level 1 department first to see the suggested half-fee, or enter this department's Level 2 entry fee directly.
                      </p>
                    )}
                  </div>
                )
              })() : (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {isUniversity && form.uniLevel === 'Level 1' ? '2-year HND Program Fee (XAF)' : t('School Fee (XAF)')}
                    <span className="text-destructive"> *</span>
                  </label>
                  <input type="number" min="0" step="any" placeholder={isUniversity ? '650000' : '150000'} required
                    value={form.feeAmount}
                    onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isUniversity && form.uniLevel === 'Level 1'
                      ? 'Total fee for the full 2-year HND program. Level 2 direct-entry students are suggested half this amount by default, but it can be set differently.'
                      : tt("Total fee per academic year. Record each student's payments from the Students page.",
                          "Annual fee for this department. Record payments from the Students page.")}
                  </p>
                </div>
              )}

              {/* HND Registration Fee — only for Level 2 university departments */}
              {isUniversity && form.uniLevel === 'Level 2' && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">HND Registration Fee (XAF) <span className="text-destructive">*</span></label>
                  <input type="number" min="0" step="any" placeholder="65000" required
                    value={form.hndRegistrationFee}
                    onChange={(e) => setForm({ ...form, hndRegistrationFee: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-xs text-muted-foreground mt-1">One-time exam registration fee for Level 2 students. Tracked separately from school fees.</p>
                </div>
              )}

              {/* GCE Registration Fee — only for secondary Form 5 / Upper Sixth classes */}
              {!isUniversity && isExamRegistrationClass(composeClassName(form.name)) && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">GCE Registration Fee (XAF) <span className="text-destructive">*</span></label>
                  <input type="number" min="0" step="any" placeholder={GCE_DEFAULT_FEE} required
                    value={form.hndRegistrationFee}
                    onChange={(e) => setForm({ ...form, hndRegistrationFee: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-xs text-muted-foreground mt-1">One-time GCE exam registration fee for this class. Tracked separately from school fees.</p>
                </div>
              )}

              {/* Stream toggle — non-university only */}
              {!isUniversity && (
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => setForm({ ...form, hasStream: !form.hasStream })}
                      className={`relative w-10 h-6 rounded-full transition-colors ${form.hasStream ? 'bg-primary' : 'bg-zinc-400 dark:bg-zinc-600'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.hasStream ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t('Has stream (Arts / Science)')}</p>
                      <p className="text-xs text-muted-foreground">{t('Students in this class must choose a stream')}</p>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">{t('Cancel')}</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition active:scale-95">
                  {saving ? t('Saving...') : editing ? t('Save Changes') : tt('Add Class', 'Add Department')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add / Edit department modal ── */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-zinc-800 animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{editingDept ? t('Rename Department') : t('Add Department')}</h3>
              <button onClick={() => setShowDeptModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            {deptError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{deptError}</div>}

            <form onSubmit={handleDeptSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Department Name')} <span className="text-destructive">*</span></label>
                <input type="text" placeholder="e.g. Technical, Commercial"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  required autoFocus
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                {!editingDept && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {DEPT_SUGGESTIONS.filter(s => !departments.some(d => d.name.toLowerCase() === s.toLowerCase())).map(s => (
                      <button key={s} type="button" onClick={() => setDeptName(s)}
                        className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary transition">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowDeptModal(false)}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">{t('Cancel')}</button>
                <button type="submit" disabled={deptSaving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition active:scale-95">
                  {deptSaving ? t('Saving...') : editingDept ? t('Save Changes') : t('Add Department')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={tt('Delete Class', 'Delete Department')}
        message={`${t('Are you sure you want to delete')} "${deleteTarget ? displayClassName(deleteTarget) : ''}"? ${t('This cannot be undone.')}`}
        confirmLabel={t('Delete')}
        confirmColor="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={!!deleteDeptTarget}
        title={t('Delete Department')}
        message={`${t('Are you sure you want to delete')} "${deleteDeptTarget?.name ?? ''}"? ${t('This cannot be undone.')}`}
        confirmLabel={t('Delete')}
        confirmColor="red"
        onConfirm={handleDeptDelete}
        onCancel={() => setDeleteDeptTarget(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
