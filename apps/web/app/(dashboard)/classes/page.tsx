'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getClassLevelsApi, createClassLevelApi, updateClassLevelApi, deleteClassLevelApi, ClassLevel } from '@/lib/api/classLevels'
import { getDepartmentsApi, createDepartmentApi, updateDepartmentApi, deleteDepartmentApi, Department } from '@/lib/api/departments'
import { copySubjectsApi, getSubjectsApi } from '@/lib/api/subjects'
import { GraduationCap, Plus, Pencil, Trash2, X, ChevronUp, ChevronDown, Layers } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import { useToast } from '@/lib/useToast'
import { Programme, PROGRAMME_LABELS, stripProgrammeSuffix, withProgrammeSuffix } from '@/lib/programme'
import { useT } from '@/lib/i18n'
import { usePagination } from '@/lib/usePagination'
import { formatXAF } from '@/lib/api/fees'

// ── University class-name helpers ────────────────────────────────────────────
type UniLevel = 'Level 1' | 'Level 2' | 'Level 3'

function deptFromClassName(rawName: string): string {
  // Normalised first: these patterns anchor at the end of the name, where the
  // Day/Evening marker sits. The sitting is `ClassLevel.programme`, never part of a
  // department or level.
  const name = stripProgrammeSuffix(rawName)
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}

function levelFromClassName(rawName: string): UniLevel | '' {
  // Past the Day/Evening marker: these patterns anchor at the end of the name, so an
  // evening class would otherwise match no level and vanish from every level tab.
  const name = stripProgrammeSuffix(rawName)
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
// Level 3 is the Degree year. It runs once, follows the day curriculum and continues from
// Level 2 day, so it belongs to the day section even though it is taught in the evening.
// The evening section is Level 1 and Level 2 only.
const levelsForProgramme = (p: Programme | 'ALL'): UniLevel[] =>
  p === 'EVENING' ? UNI_LEVELS.filter((lv) => lv !== 'Level 3') : UNI_LEVELS
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
  programme: Programme
}

// feeAmount deliberately starts empty, not a real number: it used to default to a stock
// 150000/650000 that LOOKED like a deliberately entered value (not greyed-out placeholder
// text), so a distracted admin could save every class with a fee that has nothing to do
// with their school's actual tuition. The input's placeholder already shows the same
// number as a hint — this just stops it from also being the submitted value.
const STD_EMPTY: FormState  = { name: '', deptName: '', uniLevel: 'Level 1', abbreviation: '', hasStream: false, maxScore: '20',  feeAmount: '', hndRegistrationFee: GCE_DEFAULT_FEE, programme: 'DAY' }
const UNI_EMPTY: FormState  = { name: '', deptName: '', uniLevel: 'Level 1', abbreviation: '', hasStream: false, maxScore: '100', feeAmount: '', hndRegistrationFee: '65000', programme: 'DAY' }

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
  // Day/Evening filter. 'ALL' by default so a school with no evening programme sees no
  // change at all, and the chips only earn their place once an evening class exists.
  const [activeProgramme, setActiveProgramme] = useState<Programme | 'ALL'>('ALL')

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

  // ── Secondary class sections (A/B/C…) ── Optional: a school with one stream per
  // class just leaves none selected and gets a single bare class ("Form 1"). Only a
  // school that actually splits a class into streams picks letters, per class — one
  // class at a school can have sections while another at the same school has none.
  const [sections, setSections] = useState<string[]>([])
  const [copyFrom, setCopyFrom] = useState<string>('')  // source class to copy subjects from
  // Creating an evening class from an existing day department: the day class it is based on,
  // and which of its courses to bring over. The department name is then taken from that
  // class rather than retyped, which is what stops a misspelling from silently creating a
  // second department (it already happened once: "Software Enginering").
  const [takeFromDay, setTakeFromDay] = useState(false)
  const [baseClass, setBaseClass] = useState<string>('')
  const [pickedCourses, setPickedCourses] = useState<Set<string>>(new Set())
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string; classLevel: string; term?: string | null }[]>([])

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
    else {
      fetchClasses()
      fetchSubjects()
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

  const fetchSubjects = async () => {
    try {
      const d = await getSubjectsApi()
      setAllSubjects(d.subjects)
    } catch { /* the base-on-day picker just shows no courses */ }
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
    const bySitting = activeProgramme === 'ALL'
      ? classes
      : classes.filter((c) => (c.programme ?? 'DAY') === activeProgramme)
    if (isUniversity) return bySitting.filter((c) => levelFromClassName(c.name) === activeLevel)
    if (isSecondary && activeDeptId) return bySitting.filter((c) => c.departmentId === activeDeptId)
    return bySitting
  }, [isUniversity, isSecondary, classes, activeLevel, activeDeptId, activeProgramme])

  // The chips only appear once the school actually runs an evening sitting, so nothing
  // changes for the schools that don't.
  const hasEveningClasses = classes.some((c) => (c.programme ?? 'DAY') === 'EVENING')

  const baseClassOptions = useMemo(() => {
    if (form.programme !== 'EVENING' || editing) return []
    return classes
      .filter((c) => (c.programme ?? 'DAY') === 'DAY')
      .filter((c) => !isUniversity || levelFromClassName(c.name) === form.uniLevel)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [classes, form.programme, form.uniLevel, editing, isUniversity])

  const baseClassCourses = useMemo(
    () => allSubjects.filter((s) => s.classLevel === baseClass).sort((a, b) => a.name.localeCompare(b.name)),
    [allSubjects, baseClass],
  )

  // Taking a day department as the base fills in everything that must match for the two
  // sittings to stay one programme: the name (never retyped, so it cannot be misspelled into
  // a separate department), the abbreviation (one continuous matricule series), the fee and
  // the max score. All still editable except the name.
  const applyBaseClass = (name: string) => {
    setBaseClass(name)
    const src = classes.find((c) => c.name === name)
    if (!src) { setPickedCourses(new Set()); return }
    setForm((f) => ({
      ...f,
      ...(isUniversity ? { deptName: deptFromClassName(src.name) } : { name: stripDeptSuffix(stripProgrammeSuffix(src.name)) }),
      abbreviation: src.abbreviation ?? '',
      maxScore: String(src.maxScore ?? (isUniversity ? 100 : 20)),
      feeAmount: String(src.feeAmount ?? 0),
    }))
    setPickedCourses(new Set(allSubjects.filter((s) => s.classLevel === name).map((s) => s.id)))
  }

  const composeClassName = (base: string): string => {
    const b = stripDeptSuffix(base)
    if (!isSecondary || !activeDept || activeDept.isDefault) return b
    return `${b} (${activeDept.name})`
  }

  const displayClassName = (cls: ClassLevel): string => {
    const base = stripProgrammeSuffix(cls.name)
    return isUniversity ? deptFromClassName(base) : isSecondary ? stripDeptSuffix(base) : base
  }

  const openAdd = () => {
    setEditing(null)
    // Entry/registration fees are never pre-filled on create — only shown as
    // placeholder suggestions — so the admin has to consciously enter them.
    const seedProgramme: Programme = activeProgramme === 'ALL' ? 'DAY' : activeProgramme
    const seedLevel: UniLevel = seedProgramme === 'EVENING' && activeLevel === 'Level 3' ? 'Level 1' : activeLevel
    setForm(isUniversity
      ? { ...UNI_EMPTY, uniLevel: seedLevel, feeAmount: seedLevel === 'Level 2' ? '' : UNI_EMPTY.feeAmount, hndRegistrationFee: '', programme: seedProgramme }
      : { ...STD_EMPTY, hndRegistrationFee: '', programme: seedProgramme })
    setSections([])
    setCopyFrom('')
    setBaseClass('')
    setPickedCourses(new Set())
    setTakeFromDay(false)
    setError('')
    setShowModal(true)
  }

  const openEdit = (cls: ClassLevel) => {
    setEditing(cls)
    if (isUniversity) {
      setForm({
        name: cls.name,
        deptName: deptFromClassName(stripProgrammeSuffix(cls.name)),
        uniLevel: levelFromClassName(cls.name) || 'Level 1',
        abbreviation: cls.abbreviation ?? '',
        hasStream: false,
        maxScore: String(cls.maxScore ?? 100),
        feeAmount: String(cls.feeAmount ?? 0),
        hndRegistrationFee: String(cls.hndRegistrationFee ?? 65000),
        programme: cls.programme ?? 'DAY',
      })
    } else {
      setForm({
        name: stripProgrammeSuffix(isSecondary ? stripDeptSuffix(cls.name) : cls.name),
        deptName: '',
        uniLevel: 'Level 1',
        abbreviation: cls.abbreviation ?? '',
        hasStream: cls.hasStream,
        maxScore: String(cls.maxScore ?? 20),
        feeAmount: String(cls.feeAmount ?? 0),
        hndRegistrationFee: String(cls.hndRegistrationFee ?? GCE_DEFAULT_FEE),
        programme: cls.programme ?? 'DAY',
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
      if (form.programme === 'EVENING' && form.uniLevel === 'Level 3') {
        setError(t('Level 3 runs once, on the day curriculum. Create it in the Day section.')); return
      }
      finalNames = [withProgrammeSuffix(buildClassName(form.deptName.trim(), form.uniLevel), form.programme)]
    } else if (isSecondary) {
      if (!secBase) { setError(t('Class name is required.')); return }
      finalNames = (editing
        ? [composeClassName(secBase)]
        // No section letters selected → one bare class, e.g. "Form 1". A school with
        // enough students to split a class picks letters instead, one class per letter.
        : sections.length
          ? sections.map((l) => composeClassName(`${secBase} ${l}`))
          : [composeClassName(secBase)]
      ).map((n) => withProgrammeSuffix(n, form.programme))
    } else {
      if (!form.name.trim()) { setError(t('Class name is required.')); return }
      finalNames = [withProgrammeSuffix(form.name.trim(), form.programme)]
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
        programme: form.programme,
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
        // Either an explicitly chosen source (secondary sections) or the day twin of an
        // evening class. Failures are swallowed deliberately: the class itself is created
        // either way, and a failed copy is recoverable from the Classes page.
        // Either the day department this evening class is based on (bringing only the
        // courses that were ticked) or the secondary section-copy picker (whole list).
        // Failures are swallowed deliberately: the class itself exists either way, and the
        // copy can be redone from the Classes page.
        let copied = 0
        if (baseClass && pickedCourses.size > 0) {
          const ids = [...pickedCourses]
          const results = await Promise.all(toCreate.map((nm) => copySubjectsApi(baseClass, nm, ids).catch(() => ({ copied: 0 }))))
          copied = results.reduce((sum, r) => sum + (r?.copied ?? 0), 0)
        } else if (isSecondary && copyFrom) {
          const results = await Promise.all(toCreate.map((nm) => copySubjectsApi(copyFrom, nm).catch(() => ({ copied: 0 }))))
          copied = results.reduce((sum, r) => sum + (r?.copied ?? 0), 0)
        }
        const addedMsg = toCreate.length > 1 ? `${toCreate.length} ${t('classes added')}` : tt('Class added', 'Department added')
        showToast(copied > 0 ? `${addedMsg}. ${copied} ${t(isUniversity ? 'courses copied over' : 'subjects copied over')}.` : addedMsg)
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
      const result = await deleteClassLevelApi(deleteTarget.id)
      setDeleteTarget(null)
      fetchClasses()
      // The API's own message names what it also cleaned up (a class master who was
      // assigned to it, say), which a fixed string here would throw away.
      showToast(result?.message || tt('Class deleted', 'Department deleted'))
    } catch (err: unknown) {
      // The refusal explains itself ("still has 22 students and 6 courses"). Replacing it
      // with "Failed to delete" would leave the admin guessing at a rule they can't see.
      const e = err as { response?: { data?: { message?: string } } }
      showToast(e.response?.data?.message || tt('Failed to delete class', 'Failed to delete department'), 'error')
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

      {/* ── Day / Evening sitting ──
          Only shown once the school actually runs an evening sitting: a school with a
          single sitting has nothing to filter and shouldn't be asked to think about it. */}
      {hasEveningClasses && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(['ALL', 'DAY', 'EVENING'] as const).map((p) => {
            const count = p === 'ALL' ? classes.length : classes.filter((c) => (c.programme ?? 'DAY') === p).length
            const active = activeProgramme === p
            return (
              <button key={p} onClick={() => {
                setActiveProgramme(p)
                if (p === 'EVENING' && activeLevel === 'Level 3') setActiveLevel('Level 1')
              }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 active:scale-95 ${
                  active ? 'bg-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}>
                {t(p === 'ALL' ? 'All' : PROGRAMME_LABELS[p])}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

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
          {levelsForProgramme(activeProgramme).map((lv) => {
            const count = classes.filter((c) =>
              levelFromClassName(c.name) === lv &&
              (activeProgramme === 'ALL' || (c.programme ?? 'DAY') === activeProgramme)
            ).length
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
                          {/* The sitting is shown as a tag rather than left in the name,
                              so the name reads the same as it does on a report card. */}
                          {(cls.programme ?? 'DAY') === 'EVENING' && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              {t('Evening')}
                            </span>
                          )}
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
              {/* Which SECTION the class belongs to, not what time it is taught. Level 3
                  runs in the evening by the clock but follows the day curriculum, so it is a
                  Day class. The word never reaches a printed report card. */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Section')}</label>
                <div className="flex gap-2">
                  {(['DAY', 'EVENING'] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setForm({
                      ...form,
                      programme: p,
                      // Level 3 exists only in the day section, so a switch to Evening has to
                      // move off it rather than leave an invalid choice selected but hidden.
                      uniLevel: p === 'EVENING' && form.uniLevel === 'Level 3' ? 'Level 1' : form.uniLevel,
                    })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition active:scale-95 ${
                        form.programme === p ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'
                      }`}>
                      {t(PROGRAMME_LABELS[p])}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.programme === 'EVENING'
                    ? t('A separate intake following the evening programme, with its own students, marks and fees. Used to group and filter inside the app only, it never appears on a printed report card.')
                    : t('Follows the day curriculum. Choose this even for a class taught in the evening, if it follows the day programme.')}
                </p>

                {/* Evening intakes are almost always the same programme run again, so the
                    department is TAKEN from the day one rather than retyped. The courses are
                    then copied, and copied is the point: the evening cohort may edit theirs
                    without touching the day class. Which ones to bring is a choice, since an
                    evening intake need not take every course the day one does. */}
                {form.programme === 'EVENING' && !editing && baseClassOptions.length > 0 && (
                  <div className="mt-3 rounded-lg border border-border p-3 space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={takeFromDay}
                        onChange={(e) => {
                          setTakeFromDay(e.target.checked)
                          // Unticking hands the form back: the name unlocks and nothing is
                          // queued for copying.
                          if (!e.target.checked) { setBaseClass(''); setPickedCourses(new Set()) }
                        }}
                        className="mt-0.5 accent-primary w-4 h-4 flex-shrink-0" />
                      <span>
                        <span className="block text-sm text-foreground">
                          {t(isUniversity ? 'Take the department from the day section' : 'Take the class from the day section')}
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {t('Same programme run again in the evening. Leave this unticked to type a new one.')}
                        </span>
                      </span>
                    </label>

                    {takeFromDay && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {t(isUniversity ? 'Base it on a day department' : 'Base it on a day class')}
                      </label>
                      <select value={baseClass} onChange={(e) => applyBaseClass(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">{t('Select a department...')}</option>
                        {baseClassOptions.map((c) => (
                          <option key={c.id} value={c.name}>{displayClassName(c)}</option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {baseClass
                          ? t('Name, abbreviation, fee and max score are taken from it. Pick the courses to copy below.')
                          : t('Pick the day department this evening intake belongs to.')}
                      </p>
                    </div>
                    )}

                    {baseClass && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-medium text-foreground">
                            {t(isUniversity ? 'Courses to copy' : 'Subjects to copy')}
                            <span className="text-muted-foreground font-normal"> ({pickedCourses.size}/{baseClassCourses.length})</span>
                          </label>
                          {baseClassCourses.length > 0 && (
                            <button type="button"
                              onClick={() => setPickedCourses(pickedCourses.size === baseClassCourses.length ? new Set() : new Set(baseClassCourses.map((c) => c.id)))}
                              className="text-xs text-primary font-medium hover:underline">
                              {pickedCourses.size === baseClassCourses.length ? t('Clear all') : t('Select all')}
                            </button>
                          )}
                        </div>
                        {baseClassCourses.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('That class has no courses yet, so there is nothing to copy.')}</p>
                        ) : (
                          <div className="max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                            {baseClassCourses.map((c) => (
                              <label key={c.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40">
                                <input type="checkbox" checked={pickedCourses.has(c.id)}
                                  onChange={(e) => {
                                    const next = new Set(pickedCourses)
                                    if (e.target.checked) next.add(c.id); else next.delete(c.id)
                                    setPickedCourses(next)
                                  }}
                                  className="accent-primary w-4 h-4 flex-shrink-0" />
                                <span className="text-sm text-foreground flex-1">{c.name}</span>
                                {c.term && <span className="text-[10px] text-muted-foreground">{c.term}</span>}
                              </label>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('Copies, not shared: editing an evening course never changes the day one. Lecturers are not copied, assign the evening teachers yourself.')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>


              {/* University: department name + level picker */}
              {isUniversity ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Department Name <span className="text-destructive">*</span></label>
                    <input type="text" placeholder="e.g. Hardware Maintenance, Software Development"
                      value={form.deptName}
                      onChange={(e) => setForm({ ...form, deptName: e.target.value })}
                      required
                      // Taken from the day department and locked: the two sittings are one
                      // department only while their names agree exactly, and one stray
                      // keystroke here is what created a phantom department last time.
                      readOnly={!!baseClass}
                      className={`w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${baseClass ? 'bg-muted cursor-not-allowed' : ''}`} />
                    {baseClass && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('Taken from the day department, so both sittings stay one department. Untick "Take the department from the day section" to type your own.')}
                      </p>
                    )}
                    {form.deptName.trim() && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Will be saved as: <span className="font-medium text-foreground">{buildClassName(form.deptName.trim(), form.uniLevel)}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground mb-2">Class <span className="text-destructive">*</span></label>
                    <div className={`grid gap-2 ${levelsForProgramme(form.programme).length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {levelsForProgramme(form.programme).map((lv) => (
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

                  {/* Section letters — secondary, create only, optional. Each selected letter
                      becomes its own class; leaving none selected creates a single bare class. */}
                  {isSecondary && !editing && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-foreground mb-1.5">
                        {t('Sections')} <span className="text-muted-foreground font-normal">({t('optional')})</span>
                      </label>
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
                          ? <>{t('Creates')}: <span className="font-medium text-foreground">{(sections.length ? sections.map((l) => `${stripDeptSuffix(form.name)} ${l}`) : [stripDeptSuffix(form.name)]).join(', ')}</span></>
                          : t('Only pick letters if this class is split into streams — most classes need none.')}
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
                // Same section: an evening Level 2's programme fee lives on the EVENING
                // Level 1, so suggesting half the day programme's fee would quote the
                // wrong figure entirely.
                const l1 = form.deptName.trim()
                  ? classes.find((c) => c.name === withProgrammeSuffix(`HND ${form.deptName.trim()} - Level 1`, form.programme))
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
