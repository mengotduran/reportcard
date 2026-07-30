'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getSubjectsApi, createSubjectApi, updateSubjectApi, deleteSubjectApiWithConfirm, getSubjectDeleteImpactApi, SubjectDeleteImpact } from '@/lib/api/subjects'
import { getClassLevelsApi, ClassLevel as ClassLevelOption } from '@/lib/api/classLevels'
import { useProgrammeFilter, ProgrammeChips, EveningBadge } from '@/components/ui/ProgrammeFilter'
import { stripProgrammeSuffix } from '@/lib/programme'
import { getDepartmentsApi, Department } from '@/lib/api/departments'
import { getTermsApi } from '@/lib/api/terms'
import { BookOpen, Plus, Trash2, Pencil, X, Check, AlertTriangle, ArrowLeft, ChevronRight, Calendar, Layers } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { levelGroupOf, programmeOf, sortLevelGroups } from '@/lib/universityLevels'

// Non-default departments store classes with a " (Department)" suffix; strip it
// for display since the department is already the active context.
const stripDeptSuffix = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

interface Subject {
  id: string
  name: string
  code?: string | null
  classLevel: string
  maxScore: number
  coefficient: number
  credit?: number | null
  term?: string | null
  requiredHours?: number | null
}

interface TermOption { id: string; name: string; session: string; startDate: string; isCurrent?: boolean }

export default function SubjectsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isAuthenticated, school, activeSession, user } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  const t = useT()
  // Universities call subjects "courses" and classes "departments" — same data/routes, just different wording.
  const tt = (subjectStr: string, courseStr: string) => t(isUniversity ? courseStr : subjectStr)
  const tc = (classStr: string, deptStr: string) => t(isUniversity ? deptStr : classStr)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classLevels, setClassLevels] = useState<ClassLevelOption[]>([])
  // Day/Evening. The two sittings carry their own copy of the curriculum, so a course list
  // that mixed them would show every course twice.
  const programmeFilter = useProgrammeFilter(classLevels)
  const [departments, setDepartments] = useState<Department[]>([])
  const [terms, setTerms] = useState<TermOption[]>([])
  const [loading, setLoading] = useState(true)
  // Secondary schools drill down department -> class -> subjects.
  // Where you are in the picker lives in the URL, not only in memory. Entering marks
  // navigates away, and coming back remounts this page: with the position in state alone
  // you landed on the level list again and had to walk Level > Department > Semester back
  // down for every single course. The url also makes a given list linkable and survives a
  // refresh.
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(searchParams.get('dept'))
  // University only: the level chosen on the first screen (Level 1 / Level 2 / Degree).
  const [selectedLevel, setSelectedLevel] = useState<string | null>(searchParams.get('level'))
  const [selectedClass, setSelectedClass] = useState<string | null>(searchParams.get('class'))
  // University only — a course belongs to one semester (see Subject.term in schema.prisma).
  const [selectedTerm, setSelectedTerm] = useState<string | null>(searchParams.get('term'))

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', coefficient: '1', credit: '', requiredHours: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', code: '', coefficient: '1', credit: '', requiredHours: '' })

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteImpact, setDeleteImpact] = useState<SubjectDeleteImpact | null>(null)
  const [impactError, setImpactError] = useState('')
  const [typedName, setTypedName] = useState('')

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    Promise.all([
      getSubjectsApi().then(d => setSubjects(d.subjects)),
      getClassLevelsApi().then(d => setClassLevels(d.classLevels.sort((a, b) => a.order - b.order))),
      getTermsApi().then(d => setTerms(d.terms)),
      isSecondary ? getDepartmentsApi().then(d => setDepartments(d.departments)).catch(() => {}) : Promise.resolve(),
    ]).finally(() => setLoading(false))
  }, [isAuthenticated])

  const fetchSubjects = () =>
    getSubjectsApi().then(d => setSubjects(d.subjects)).catch(() => {})

  // Semesters available to pick from — distinct names within the active academic
  // session, ordered by start date (so "First Semester" lists before "Second").
  // Mirror the picker into the url. `replace`, not `push`: this is where you ARE, not a
  // step you took, so it should not pile up history entries that Back has to walk. The
  // page's own arrows move between steps. Entering marks pushes, so Back from the marks
  // sheet lands on this exact list again.
  useEffect(() => {
    const p = new URLSearchParams()
    if (selectedDeptId) p.set('dept', selectedDeptId)
    if (selectedLevel) p.set('level', selectedLevel)
    if (selectedClass) p.set('class', selectedClass)
    if (selectedTerm) p.set('term', selectedTerm)
    const qs = p.toString()
    const next = qs ? `${pathname}?${qs}` : pathname
    // Guard the no-op: replacing with the url we are already on would loop the router.
    if (next !== `${pathname}${window.location.search}`) router.replace(next, { scroll: false })
  }, [selectedDeptId, selectedLevel, selectedClass, selectedTerm, pathname, router])

  const availableTerms = Array.from(
    new Map(
      terms.filter(tm => tm.session === activeSession).map(tm => [tm.name, tm])
    ).values()
  ).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

  // Marks entry from here is for schools where the administration records marks (see
  // School.marksEntryMode); teachers reach marks through Report Cards as they always have.
  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  const canEnterMarksHere = isUniversity && isAdminRole && school?.marksEntryMode === 'ADMIN_ONLY'

  /** Straight to this course's marks sheet, on the level + semester already chosen here.
   *  Lands on CA; the sheet itself switches between CA, Exam and Resit. termName is
   *  required as well as termId: the sheet filters courses by it. */
  const goToMarks = (subjectId: string, subjectName: string) => {
    const term = availableTerms.find(tm => tm.name === selectedTerm)
    if (!selectedClass || !term) return
    router.push(
      `/report-cards/class/${encodeURIComponent(selectedClass)}/${encodeURIComponent(subjectId)}` +
      `?termId=${term.id}&termName=${encodeURIComponent(term.name)}` +
      `&subjectName=${encodeURIComponent(subjectName)}&sequence=0`
    )
  }

  const classSubjects = selectedClass
    ? subjects.filter(s => s.classLevel === selectedClass && (!isUniversity || s.term === selectedTerm))
    : []

  // Grouped counts for the class picker
  const countByClass = subjects.reduce((acc, s) => {
    acc[s.classLevel] = (acc[s.classLevel] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const openModal = () => {
    setForm({ name: '', code: '', coefficient: '1', credit: '', requiredHours: '' })
    setFormError('')
    setShowModal(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClass) return
    setFormError('')
    setSaving(true)
    try {
      await createSubjectApi({
        name: form.name.trim(),
        classLevel: selectedClass,
        ...(isUniversity && form.code.trim() ? { code: form.code.trim().toUpperCase() } : {}),
        // Universities don't enter a separate coefficient — credit hours double as
        // the weight in the average, same value the seed already uses for this.
        coefficient: isUniversity ? (Number(form.credit) || 1) : Number(form.coefficient),
        ...(isUniversity ? { credit: form.credit === '' ? null : Number(form.credit), term: selectedTerm } : {}),
        requiredHours: form.requiredHours === '' ? null : Number(form.requiredHours),
      })
      setShowModal(false)
      fetchSubjects()
    } catch (err: any) {
      setFormError(err.response?.data?.message || tt('Failed to create subject', 'Failed to create course'))
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (s: Subject) => {
    setEditingId(s.id)
    setEditForm({ name: s.name, code: s.code ?? '', coefficient: String(s.coefficient ?? 1), credit: s.credit != null ? String(s.credit) : '', requiredHours: s.requiredHours != null ? String(s.requiredHours) : '' })
  }

  const handleEdit = async (id: string) => {
    try {
      await updateSubjectApi(id, {
        name: editForm.name.trim(),
        ...(isUniversity ? { code: editForm.code.trim().toUpperCase() || null } : {}),
        coefficient: isUniversity ? (Number(editForm.credit) || 1) : Number(editForm.coefficient),
        ...(isUniversity ? { credit: editForm.credit === '' ? null : Number(editForm.credit) } : {}),
        requiredHours: editForm.requiredHours === '' ? null : Number(editForm.requiredHours),
      })
      setEditingId(null)
      fetchSubjects()
    } catch { /* silently ignore */ }
  }

  // A course with marks on it cannot be deleted on a single click: the marks go with it and
  // there is no undo. The counts come from the server, since this page cannot see how many
  // students have been marked on a course.
  const openDelete = async (s: Subject) => {
    setDeleteTarget(s)
    setDeleteImpact(null)
    setImpactError('')
    setTypedName('')
    try {
      setDeleteImpact(await getSubjectDeleteImpactApi(s.id))
    } catch {
      setImpactError(t('Could not check what deleting this would remove. Try again.'))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSubjectApiWithConfirm(deleteTarget.id, deleteTarget.name)
      setDeleteTarget(null)
      setDeleteImpact(null)
      setTypedName('')
      fetchSubjects()
    } catch (err: unknown) {
      // The refusal explains itself (how many marks, in which class). Swallowing it, as this
      // used to, left the admin clicking Delete on a modal that never closed.
      const e = err as { response?: { data?: { message?: string } } }
      setImpactError(e.response?.data?.message || tt('Failed to delete subject', 'Failed to delete course'))
    }
    finally { setDeleting(false) }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading…')}</div>
  }

  // ── Department picker (secondary only) ────────────────────────────────────
  if (isSecondary && !selectedDeptId) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">{tt('Subjects', 'Courses')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('Select a department, then a class, to manage its subjects')}</p>
        </div>

        {departments.length === 0 ? (
          <div className="bg-card rounded-xl border border-border text-center py-12">
            <Layers size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t('No departments found.')}</p>
            <button onClick={() => router.push('/classes')} className="mt-3 text-primary text-sm hover:underline">
              {t('Go to Classes →')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {departments.map(dep => {
              const depClasses = classLevels.filter(cl => cl.departmentId === dep.id)
              const subjCount = subjects.filter(s => depClasses.some(cl => cl.name === s.classLevel)).length
              return (
                <button
                  key={dep.id}
                  onClick={() => setSelectedDeptId(dep.id)}
                  className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition group active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                      <Layers size={18} />
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition" />
                  </div>
                  <p className="font-semibold text-foreground">{dep.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {depClasses.length} {depClasses.length !== 1 ? t('classes') : t('class')} · {subjCount} {subjCount !== 1 ? t('subjects') : t('subject')}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Level picker (university only) ────────────────────────────────────────
  // A university's programmes repeat per level (HND Nursing exists at Level 1 and Level
  // 2), so the level comes first: it halves the list before you read it, and it is how
  // the school itself thinks about its courses.
  if (isUniversity && !selectedLevel) {
    const sittingClasses = classLevels.filter(cl => programmeFilter.matches(cl.name))
    const groups = Array.from(new Set(sittingClasses.map(cl => levelGroupOf(cl.name)))).sort(sortLevelGroups)
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">{t('Courses')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('Select a level, then a department, to manage its courses')}</p>
        </div>

        {/* Day/Evening sitting. Each sitting keeps its own copy of the curriculum, so this
            decides which one you are editing before any level is chosen. */}
        {programmeFilter.hasEvening && (
          <ProgrammeChips
            value={programmeFilter.programme}
            onChange={programmeFilter.setProgramme}
            className="mb-4"
          />
        )}

        {groups.length === 0 ? (
          <div className="bg-card rounded-xl border border-border text-center py-12">
            <Layers size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t('No departments found.')}</p>
            <button onClick={() => router.push('/classes')} className="mt-3 text-primary text-sm hover:underline">
              {t('Go to Departments →')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {groups.map(g => {
              const inGroup = sittingClasses.filter(cl => levelGroupOf(cl.name) === g)
              const courseCount = subjects.filter(sub => inGroup.some(cl => cl.name === sub.classLevel)).length
              return (
                <button
                  key={g}
                  onClick={() => setSelectedLevel(g)}
                  className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition group active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-bold text-sm">
                      <Layers size={18} />
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition" />
                  </div>
                  <p className="font-semibold text-foreground">{t(g)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {inGroup.length} {inGroup.length !== 1 ? t('departments') : t('department')} · {courseCount} {courseCount !== 1 ? t('courses') : t('course')}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Class picker ─────────────────────────────────────────────────────────
  if (!selectedClass) {
    // The sitting filter belongs on THIS step as much as the level one. Without it the
    // Evening chip listed every day department too, and since the card label strips the
    // marker, "Accountancy" appeared twice with nothing to tell the two apart. Picking the
    // wrong one is unrecoverable in the worst way: deleting a course there deletes the DAY
    // course and its marks, while the admin believes they are in the evening intake.
    const pickerClasses = (isSecondary
      ? classLevels.filter(cl => cl.departmentId === selectedDeptId)
      : isUniversity
        // Only the departments that exist at the chosen level.
        ? classLevels.filter(cl => levelGroupOf(cl.name) === selectedLevel)
        : classLevels
    ).filter(cl => programmeFilter.matches(cl.name))
    const activeDept = departments.find(d => d.id === selectedDeptId)
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          {(isSecondary || isUniversity) && (
            <button onClick={() => isSecondary ? setSelectedDeptId(null) : setSelectedLevel(null)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-hover rounded-lg transition">
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {isSecondary && activeDept ? activeDept.name : isUniversity ? t(selectedLevel ?? 'Courses') : tt('Subjects', 'Courses')}
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">{isUniversity ? t('Select a department to manage its courses') : t('Select a class to manage its subjects')}</p>
          </div>
        </div>

        {/* Kept on this step too. It used to disappear after the level was chosen, so the
            one screen where picking the wrong sitting destroys the other one's courses was
            also the screen that never said which sitting you were in. */}
        {programmeFilter.hasEvening && (
          <ProgrammeChips
            value={programmeFilter.programme}
            onChange={programmeFilter.setProgramme}
            className="mb-4"
          />
        )}

        {pickerClasses.length === 0 ? (
          <div className="bg-card rounded-xl border border-border text-center py-12">
            <BookOpen size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{tc('No classes found.', 'No departments found.')}</p>
            <button onClick={() => router.push('/classes')} className="mt-3 text-primary text-sm hover:underline">
              {tc('Go to Classes →', 'Go to Departments →')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {pickerClasses.map(cl => {
              const count = countByClass[cl.name] ?? 0
              const label = isSecondary ? stripDeptSuffix(cl.name) : isUniversity ? programmeOf(cl.name) : cl.name
              return (
                <button
                  key={cl.id}
                  onClick={() => { setSelectedClass(cl.name); setSelectedTerm(null) }}
                  className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition group active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-bold text-sm">
                      {label.charAt(0)}
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{label}</p>
                    {/* The label strips the sitting marker, so on the All chip a day and an
                        evening department read identically. This is the only thing on the
                        card that tells them apart. */}
                    {programmeFilter.programmeOf(cl.name) === 'EVENING' && (
                      <EveningBadge />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {count === 0 ? tt('No subjects yet', 'No courses yet') : `${count} ${count !== 1 ? tt('subjects', 'courses') : tt('subject', 'course')}`}
                  </p>
                  <p className="text-xs text-primary font-medium mt-1">{t('Max score:')} / {cl.maxScore ?? 20}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Semester picker (university only) — a course belongs to one semester ───
  if (isUniversity && !selectedTerm) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedClass(null)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-hover rounded-lg transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{selectedClass}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{t('Select a semester to manage its courses')}</p>
          </div>
        </div>

        {availableTerms.length === 0 ? (
          <div className="bg-card rounded-xl border border-border text-center py-12">
            <Calendar size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">{t('No semesters found for the active academic year.')}</p>
            <button onClick={() => router.push('/terms')} className="mt-3 text-primary text-sm hover:underline">
              {t('Go to Semesters →')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableTerms.map(tm => {
              const count = subjects.filter(s => s.classLevel === selectedClass && s.term === tm.name).length
              return (
                <button
                  key={tm.id}
                  onClick={() => setSelectedTerm(tm.name)}
                  className={`bg-card border rounded-xl p-5 text-left hover:border-primary/40 hover:bg-primary/5 transition group ${tm.isCurrent ? 'border-primary/50' : 'border-border'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center">
                      <Calendar size={18} />
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{tm.name}</p>
                    {tm.isCurrent && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                        {t('Active')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {count === 0 ? t('No courses yet') : `${count} ${count !== 1 ? t('courses') : t('course')}`}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Subject table for selected class ────────────────────────────────────
  const classMaxScore = classLevels.find(cl => cl.name === selectedClass)?.maxScore ?? 20
  const selectedClassLabel = isSecondary && selectedClass ? stripDeptSuffix(selectedClass) : selectedClass

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { if (isUniversity) setSelectedTerm(null); else setSelectedClass(null); setEditingId(null) }}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-hover rounded-lg transition"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-foreground">{selectedClassLabel}{isUniversity && <span className="text-muted-foreground font-normal"> · {selectedTerm}</span>}</h2>
          {/* Max score belongs here, not in a column. It is set once on the class level and
              every course inherits it, so a per-row cell had nothing to say and rendered a
              dash on every line. Saying where it comes from stops it reading as missing. */}
          <p className="text-muted-foreground text-sm mt-0.5">
            {classSubjects.length} {classSubjects.length !== 1 ? tt('subjects', 'courses') : tt('subject', 'course')}
            <span className="mx-1.5">·</span>
            {t('marked out of')} <span className="font-semibold text-primary">{classMaxScore}</span>
            <span className="text-xs"> ({tc('set on the class', 'set on the department')})</span>
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition"
        >
          <Plus size={16} /> {tt('Add Subject', 'Add Course')}
        </button>
      </div>

      {/* Subjects table */}
      {classSubjects.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-14">
          <BookOpen size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm mb-4">{tt('No subjects for', 'No courses for')} <strong>{selectedClassLabel}</strong> {t('yet.')}</p>
          <button onClick={openModal}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition">
            <Plus size={15} /> {tt('Add First Subject', 'Add First Course')}
          </button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* 512, not 640: the w-32 Max Score column is gone, so the old floor forced a
              horizontal scrollbar on narrow screens for space nothing occupies. */}
          <div className="overflow-x-auto"><table className="w-full min-w-[512px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tt('Subject', 'Course')}</th>
                {!isUniversity && <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{t('Coefficient')}</th>}
                {isUniversity && <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">{t('Credit')}</th>}
                {isUniversity && <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{t('Code')}</th>}
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">
                  {isUniversity ? t('Hours/Semester') : t('Hours/Year')}
                </th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classSubjects.map((s) => (
                <tr key={s.id} className="hover:bg-hover/40 transition">
                  {/* Subject name */}
                  <td className="px-5 py-3">
                    {editingId === s.id ? (
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="border border-border rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-foreground">{s.name}</span>
                      </div>
                    )}
                  </td>

                  {/* Coefficient (not university) */}
                  {!isUniversity && (
                    <td className="px-4 py-3 text-center">
                      {editingId === s.id ? (
                        <input
                          type="number" min="1" max="10"
                          value={editForm.coefficient}
                          onChange={(e) => setEditForm({ ...editForm, coefficient: e.target.value })}
                          className="border border-border rounded-lg px-2 py-1.5 text-sm w-16 text-center focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                        />
                      ) : (
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                          ×{s.coefficient ?? 1}
                        </span>
                      )}
                    </td>
                  )}

                  {/* Credit (university) */}
                  {isUniversity && (
                    <td className="px-4 py-3 text-center">
                      {editingId === s.id ? (
                        <input
                          type="number" min="0" step="1" placeholder="—"
                          value={editForm.credit}
                          onChange={(e) => setEditForm({ ...editForm, credit: e.target.value })}
                          className="border border-border rounded-lg px-2 py-1.5 text-sm w-16 text-center focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                        />
                      ) : (
                        <span className="text-sm font-medium text-foreground">{s.credit ?? '—'}</span>
                      )}
                    </td>
                  )}

                  {/* Course code (university) */}
                  {isUniversity && (
                    <td className="px-4 py-3 text-center">
                      {editingId === s.id ? (
                        <input
                          type="text" placeholder="e.g. CS101"
                          value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                          className="border border-border rounded-lg px-2 py-1.5 text-sm w-24 text-center focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground font-mono"
                          maxLength={12}
                        />
                      ) : (
                        <span className="text-sm font-mono text-muted-foreground">{s.code ?? '—'}</span>
                      )}
                    </td>
                  )}

                  {/* Required teaching hours — per semester (university) / per academic year */}
                  <td className="px-4 py-3 text-center">
                    {editingId === s.id ? (
                      <input
                        type="number" min="0" step="1" placeholder="—"
                        value={editForm.requiredHours}
                        onChange={(e) => setEditForm({ ...editForm, requiredHours: e.target.value })}
                        className="border border-border rounded-lg px-2 py-1.5 text-sm w-16 text-center focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">{s.requiredHours ?? '—'}</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {editingId === s.id ? (
                        <>
                          <button onClick={() => handleEdit(s.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition" title={t('Save')}>
                            <Check size={15} />
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="p-1.5 text-muted-foreground hover:bg-hover rounded-lg transition" title={t('Cancel')}>
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Only where the ADMINISTRATION records marks. Elsewhere marks
                              belong to teachers, who work from Report Cards, and this
                              shortcut would just be a second door to the same room. */}
                          {canEnterMarksHere && (
                            <button onClick={() => goToMarks(s.id, s.name)}
                              className="px-2 py-1 mr-1 text-xs font-medium border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/40 transition whitespace-nowrap"
                              title={t('Enter marks for this course')}>
                              {t('Enter marks')}
                            </button>
                          )}
                          <button onClick={() => openEdit(s)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition" title={t('Edit')}>
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => openDelete(s)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition" title={t('Delete')}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Add subject modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{tt('Add Subject', 'Add Course')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tc('Class:', 'Department:')} <span className="font-semibold text-foreground">{selectedClassLabel}</span>
                  {isUniversity && <> · {t('Semester:')} <span className="font-semibold text-foreground">{selectedTerm}</span></>}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{formError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{tt('Subject Name', 'Course Name')} <span className="text-destructive">*</span></label>
                <input
                  type="text" placeholder={isUniversity ? 'e.g. Calculus I' : 'e.g. Mathematics'}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required autoFocus
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {!isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Coefficient')} <span className="text-destructive">*</span></label>
                  <input
                    type="number" min="1" max="10" placeholder="1"
                    value={form.coefficient}
                    onChange={(e) => setForm({ ...form, coefficient: e.target.value })}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('Weight of this subject in the final average. Max score is inherited from the class.')}</p>
                </div>
              )}

              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Course Code')}</label>
                  <input
                    type="text" placeholder="e.g. CS101"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    maxLength={12}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('Short identifier shown in the transcript (e.g. MATH201).')}</p>
                </div>
              )}

              {isUniversity && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{t('Credit hours')} <span className="text-destructive">*</span></label>
                  <input
                    type="number" min="0" step="1" placeholder="e.g. 3"
                    value={form.credit}
                    onChange={(e) => setForm({ ...form, credit: e.target.value })}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('Credit value of this course — drives the GPA on the transcript and its weight in the average.')}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  {isUniversity ? t('Required hours (this semester)') : t('Required hours (this academic year)')}
                </label>
                <input
                  type="number" min="0" step="1" placeholder="e.g. 45"
                  value={form.requiredHours}
                  onChange={(e) => setForm({ ...form, requiredHours: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('Optional. Used by Teaching Hours Coverage to check the assigned teacher covers this much. Leave blank to skip tracking it.')}</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-hover transition">
                  {t('Cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? t('Saving…') : tt('Add Subject', 'Add Course')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{tt('Delete Subject', 'Delete Course')}</h3>
                <p className="text-xs text-muted-foreground">{t('This cannot be undone.')}</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-2">
              {t('Are you sure you want to delete')} <span className="font-semibold">"{deleteTarget.name}"</span>?
            </p>
            {/* Names the class being deleted FROM, marker and all. A day and an evening
                department read alike everywhere else, and this is the last screen before
                the other sitting's courses and marks are gone. */}
            <p className="text-xs text-muted-foreground mb-4">
              {tt('In class', 'In department')}: <span className="font-medium text-foreground">{deleteTarget.classLevel}</span>
              {deleteTarget.term && <> · <span className="font-medium text-foreground">{deleteTarget.term}</span></>}
            </p>

            {impactError ? (
              <p className="text-sm text-destructive mb-5">{impactError}</p>
            ) : !deleteImpact ? (
              <p className="text-sm text-muted-foreground mb-5">{t('Checking what this would remove…')}</p>
            ) : (
              <>
                {deleteImpact.marks > 0 ? (
                  <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <p className="text-sm font-semibold text-destructive">
                      {deleteImpact.marks} {t(deleteImpact.marks === 1 ? 'mark' : 'marks')}
                      {deleteImpact.students > 0 && <>, {deleteImpact.students} {t(deleteImpact.students === 1 ? 'student' : 'students')}</>}
                    </p>
                    <p className="text-xs text-destructive/90 mt-1">
                      {t('Deleting this course deletes every mark entered on it. Those students lose it from their report cards and it cannot be brought back.')}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('No marks have been entered on it yet, so nothing is lost but the course itself.')}
                  </p>
                )}

                {(deleteImpact.assignments > 0 || deleteImpact.slots > 0) && (
                  <p className="text-xs text-muted-foreground mb-4">
                    {t('It also comes off')} {deleteImpact.assignments > 0 && <>{deleteImpact.assignments} {t(deleteImpact.assignments === 1 ? 'lecturer assignment' : 'lecturer assignments')}</>}
                    {deleteImpact.assignments > 0 && deleteImpact.slots > 0 && ` ${t('and')} `}
                    {deleteImpact.slots > 0 && <>{deleteImpact.slots} {t(deleteImpact.slots === 1 ? 'timetable slot' : 'timetable slots')}</>}.
                  </p>
                )}

                {/* Typing is required only once marks exist. Deleting a course added by
                    mistake a minute ago stays one click. */}
                {deleteImpact.requiresTypedName && (
                  <div className="mb-5">
                    <label className="block text-xs font-medium text-foreground mb-1">
                      {t('Type the exact name to confirm')}: <span className="font-semibold">{deleteTarget.name}</span>
                    </label>
                    <input type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)}
                      autoComplete="off" spellCheck={false}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-destructive/50" />
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteImpact(null); setImpactError(''); setTypedName('') }} disabled={deleting}
                className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-hover transition disabled:opacity-50">
                {impactError ? t('Close') : t('Cancel')}
              </button>
              {!impactError && (
                <button onClick={handleDelete}
                  disabled={!deleteImpact || deleting || (deleteImpact.requiresTypedName && typedName.trim() !== deleteTarget.name.trim())}
                  className="flex-1 bg-destructive text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                  {deleting ? t('Deleting…') : t('Delete')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
