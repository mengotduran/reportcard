'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getClassLevelsApi, createClassLevelApi, updateClassLevelApi, deleteClassLevelApi, ClassLevel } from '@/lib/api/classLevels'
import { GraduationCap, Plus, Pencil, Trash2, X, ChevronUp, ChevronDown } from 'lucide-react'
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

const STD_EMPTY: FormState  = { name: '', deptName: '', uniLevel: 'Level 1', abbreviation: '', hasStream: false, maxScore: '20',  feeAmount: '150000', hndRegistrationFee: '65000' }
const UNI_EMPTY: FormState  = { name: '', deptName: '', uniLevel: 'Level 1', abbreviation: '', hasStream: false, maxScore: '100', feeAmount: '325000', hndRegistrationFee: '65000' }

export default function ClassesPage() {
  const router = useRouter()
  const { isAuthenticated, school } = useAuthStore()
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const isUniversity = school?.type === 'UNIVERSITY'
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

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else fetchClasses()
  }, [isAuthenticated])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const data = await getClassLevelsApi()
      setClasses(data.classLevels)
    } catch { console.error('Failed to fetch classes') }
    finally { setLoading(false) }
  }

  // For university, filter classes by the active level tab
  const displayedClasses = useMemo(() =>
    isUniversity ? classes.filter((c) => levelFromClassName(c.name) === activeLevel) : classes,
  [isUniversity, classes, activeLevel])

  const openAdd = () => {
    setEditing(null)
    setForm(isUniversity ? { ...UNI_EMPTY, uniLevel: activeLevel } : STD_EMPTY)
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
        name: cls.name,
        deptName: '',
        uniLevel: 'Level 1',
        abbreviation: cls.abbreviation ?? '',
        hasStream: cls.hasStream,
        maxScore: String(cls.maxScore ?? 20),
        feeAmount: String(cls.feeAmount ?? 0),
        hndRegistrationFee: String(cls.hndRegistrationFee ?? 65000),
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

    // Derive the final class name
    const finalName = isUniversity
      ? buildClassName(form.deptName.trim(), form.uniLevel)
      : form.name.trim()

    if (!finalName || (isUniversity && !form.deptName.trim())) {
      setError(tt('Class name is required.', 'Department name is required.'))
      return
    }
    // For university Level 2: fee is auto-computed as half of Level 1
    const l1ForDept = (isUniversity && form.uniLevel === 'Level 2' && form.deptName.trim())
      ? classes.find((c) => c.name === `HND ${form.deptName.trim()} - Level 1`)
      : null
    const autoL2Fee = l1ForDept && l1ForDept.feeAmount > 0 ? Math.round(l1ForDept.feeAmount / 2) : null

    const isAutoFee = isUniversity && form.uniLevel === 'Level 2' && autoL2Fee !== null
    if (!isAutoFee && (form.feeAmount.trim() === '' || isNaN(Number(form.feeAmount)) || Number(form.feeAmount) < 0)) {
      setError(tt('Enter the class fee (use 0 if there is none).', 'Enter the department fee (use 0 if there is none).'))
      return
    }

    const hndRegFee = isUniversity && form.uniLevel === 'Level 2'
      ? (Number(form.hndRegistrationFee) || 0) : null

    const payload = {
      name: finalName,
      abbreviation: form.abbreviation.trim() || undefined,
      hasStream: isUniversity ? false : form.hasStream,
      maxScore: Number(form.maxScore),
      feeAmount: isAutoFee ? autoL2Fee! : (Number(form.feeAmount) || 0),
      hndRegistrationFee: hndRegFee,
    }

    setSaving(true)
    try {
      if (editing) {
        await updateClassLevelApi(editing.id, payload)
        showToast(tt('Class updated', 'Department updated'))
      } else {
        await createClassLevelApi({ ...payload, order: classes.length })
        showToast(tt('Class added', 'Department added'))
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

  const moveClass = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= classes.length) return
    const updated = [...classes]
    ;[updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]]
    setClasses(updated)
    try {
      await Promise.all([
        updateClassLevelApi(updated[index].id, { order: index }),
        updateClassLevelApi(updated[swapIndex].id, { order: swapIndex }),
      ])
    } catch { fetchClasses() }
  }

  const { page, setPage, totalPages, pageItems, total, pageSize, start } = usePagination(displayedClasses, 15, activeLevel)

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{tt('Classes', 'Departments')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isUniversity
              ? `${displayedClasses.length} department${displayedClasses.length !== 1 ? 's' : ''} in ${activeLevel}`
              : `${classes.length} ${classes.length !== 1 ? 'classes defined' : 'class defined'}`}
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
          <Plus size={16} /> {tt('Add Class', 'Add Department')}
        </button>
      </div>

      {/* ── University level tabs ── */}
      {isUniversity && (
        <div className="flex gap-2 mb-4">
          {UNI_LEVELS.map((lv) => {
            const count = classes.filter((c) => levelFromClassName(c.name) === lv).length
            return (
              <button key={lv} onClick={() => setActiveLevel(lv)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
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
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
        ) : displayedClasses.length === 0 ? (
          <div className="text-center py-12">
            <GraduationCap size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              {isUniversity
                ? `No departments in ${activeLevel} yet. Click "Add Department" to create one.`
                : tt('No classes yet. Add your first class to get started.', 'No departments yet. Add your first department to get started.')}
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
                            <button onClick={() => moveClass(i, 'down')} disabled={i === classes.length - 1}
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
                            {isUniversity ? deptFromClassName(cls.name) : cls.name}
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
                        {(() => {
                          if (isUniversity && activeLevel === 'Level 2') {
                            // Show auto-computed half of Level 1 fee
                            const dept = deptFromClassName(cls.name)
                            const l1 = classes.find((c) => c.name === `HND ${dept} - Level 1`)
                            const halfFee = l1 && l1.feeAmount > 0 ? Math.round(l1.feeAmount / 2) : cls.feeAmount
                            return halfFee > 0
                              ? <span className="text-sm font-medium text-indigo-600">{formatXAF(halfFee)}</span>
                              : <span className="text-muted-foreground text-sm">—</span>
                          }
                          return cls.feeAmount > 0
                            ? <span className={`text-sm font-medium ${isUniversity && activeLevel === 'Level 1' ? 'text-indigo-600' : 'text-foreground'}`}>{formatXAF(cls.feeAmount)}</span>
                            : <span className="text-muted-foreground text-sm">—</span>
                        })()}
                      </td>
                      {isUniversity && activeLevel === 'Level 2' && (
                        <td className="px-4 py-3 text-right">
                          {cls.hndRegistrationFee != null
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

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-zinc-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{editing ? tt('Edit Class', 'Edit Department') : tt('Add Class', 'Add Department')}</h3>
                {isUniversity && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {UNI_LEVEL_LABELS[form.uniLevel]}
                  </p>
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
                          onClick={() => setForm({ ...form, uniLevel: lv })}
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
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Class Name')} <span className="text-destructive">*</span></label>
                  <input type="text" placeholder="e.g. Form 3, Class 5, Lower Sixth"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}

              {/* Abbreviation (university only) */}
              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Abbreviation')} <span className="text-muted-foreground font-normal">(for student matricule)</span></label>
                  <input type="text" placeholder="e.g. HWM, SWE, MF"
                    value={form.abbreviation}
                    onChange={(e) => setForm({ ...form, abbreviation: e.target.value.toUpperCase() })}
                    maxLength={10}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}

              {/* Max score */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{isUniversity ? t('Max Score per Course') : t('Max Score per Subject')}</label>
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
                // Level 2: auto-computed as half of Level 1 program fee
                const l1 = form.deptName.trim()
                  ? classes.find((c) => c.name === `HND ${form.deptName.trim()} - Level 1`)
                  : null
                const halfFee = l1 && l1.feeAmount > 0 ? Math.round(l1.feeAmount / 2) : null
                return (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Level 2 Entry Fee (XAF)</label>
                    {halfFee !== null ? (
                      <div className="w-full border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg px-3 py-2.5 flex items-center justify-between">
                        <span className="text-sm font-semibold text-indigo-700">{formatXAF(halfFee)}</span>
                        <span className="text-xs text-indigo-500">auto · ½ of {formatXAF(l1!.feeAmount)}</span>
                      </div>
                    ) : (
                      <input type="number" min="0" step="any" placeholder="0" required
                        value={form.feeAmount}
                        onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {halfFee !== null
                        ? 'Fee for students who join directly at Level 2. Auto-calculated as half the 2-year program fee.'
                        : 'Create the Level 1 department first to auto-calculate this fee.'}
                    </p>
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
                      ? 'Total fee for the full 2-year HND program. Level 2 students (direct entry) will automatically be charged half this amount.'
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
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving...') : editing ? t('Save Changes') : tt('Add Class', 'Add Department')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={tt('Delete Class', 'Delete Department')}
        message={`${t('Are you sure you want to delete')} "${deleteTarget ? (isUniversity ? deptFromClassName(deleteTarget.name) : deleteTarget.name) : ''}"? ${t('This cannot be undone.')}`}
        confirmLabel={t('Delete')}
        confirmColor="red"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
