'use client'
import { useEffect, useMemo, useState } from 'react'
import { getTeachersApi } from '@/lib/api/teachers'
import { getTeacherTimetableApi, saveTimetableApi, getPeriodsApi, savePeriodsApi, getSchoolTimetableApi, TimetableSlot, TimetablePeriod, SchoolTimetableSlot } from '@/lib/api/timetable'
import { getClassLevelsApi } from '@/lib/api/classLevels'
import { getDepartmentsApi } from '@/lib/api/departments'
import { getSubjectsApi } from '@/lib/api/subjects'
import { useAuthStore } from '@/lib/store/auth.store'
import { Plus, X, ArrowLeft, Search, Briefcase, Clock, Trash2, Pencil } from 'lucide-react'
import CustomSelect from '@/components/ui/CustomSelect'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import DesktopOnly from '@/components/ui/DesktopOnly'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import WeekGrid, { WeekGridSlot } from '@/components/ui/WeekGrid'
import { levelGroupOf, programmeOf, sortLevelGroups } from '@/lib/universityLevels'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()
const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd

// University class-name convention: "HND {Department} - Level 1|2", "Degree
// {Department}". Mirrors univDeptFromClassName in the Teachers page.
const univDeptFromClassName = (name: string): string => {
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}

// Non-default secondary departments store classes with a " (Department)"
// suffix; strip it once the department is already the active context.
// Mirrors stripDeptSuffix in the Subjects page.
const stripDeptSuffix = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim()

// A plain <input type="time"> only opens its picker if you hit the tiny clock
// icon, and looks like editable text everywhere else — clicking anywhere on
// it here opens the picker instead, with a pointer cursor over the whole
// field so it reads as a dropdown rather than a text box.
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
      className="w-full cursor-pointer border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

interface Teacher { id: string; name: string; email: string; role: string; departments?: string[]; classLevels?: string[] }
interface TeacherSubjectOption { id: string; name: string; classLevel: string }

type EditableSlot = {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  subjectId: string | null
  label: string | null
  room: string | null
  subjectName?: string | null
  classLevel?: string | null
}

const roleLabels: Record<string, string> = {
  CLASS_TEACHER: 'Class Teacher',
  CLASS_MASTER: 'Class Master',
  SUBJECT_TEACHER: 'Subject Teacher',
  VICE_PRINCIPAL: 'Vice Principal',
}

const emptySlotForm = { dayOfWeek: 'MONDAY', periodId: '', startTime: '', endTime: '', mode: 'subject' as 'subject' | 'private', level: '', department: '', classLevel: '', subjectId: '', label: '', room: '' }
const emptyPeriodForm = { startTime: '', endTime: '', isBreak: false }

export default function TimetablePage() {
  const { toast, showToast, hideToast } = useToast()
  const tr = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  const hasDeptView = isUniversity || isSecondary

  const [loading, setLoading] = useState(true)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classToDept, setClassToDept] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [activeDept, setActiveDept] = useState<string | null>(null)

  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null)
  const [allSubjects, setAllSubjects] = useState<TeacherSubjectOption[]>([])
  const [classOrder, setClassOrder] = useState<Record<string, number>>({})
  const [schoolSlots, setSchoolSlots] = useState<SchoolTimetableSlot[]>([])
  const [slots, setSlots] = useState<EditableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showSlotModal, setShowSlotModal] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [slotForm, setSlotForm] = useState(emptySlotForm)
  const [slotError, setSlotError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EditableSlot | null>(null)

  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [showPeriodsModal, setShowPeriodsModal] = useState(false)
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm)
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null)
  const [periodError, setPeriodError] = useState('')
  const [periodsSaving, setPeriodsSaving] = useState(false)

  useBodyScrollLock(showSlotModal || showPeriodsModal || !!deleteTarget)

  useEffect(() => {
    Promise.all([getTeachersApi(), getPeriodsApi(), getSubjectsApi(), getSchoolTimetableApi()])
      .then(([t, p, sd, st]) => { setTeachers(t.teachers); setPeriods(p.periods); setAllSubjects(sd.subjects); setSchoolSlots(st.slots) })
      .catch(() => showToast(tr('Failed to load data'), 'error'))
      .finally(() => setLoading(false))
    // Class order (for sorting the Class picker) — every school type has this.
    // Secondary also maps each class to its department, same as the Teachers
    // page, so a teacher's department shows up here even if it was only
    // derived from their assigned subjects rather than set explicitly.
    getClassLevelsApi()
      .then((cl) => {
        setClassOrder(Object.fromEntries(cl.classLevels.map((c) => [c.name, c.order])))
        if (isSecondary) {
          getDepartmentsApi()
            .then((d) => {
              const byId = new Map(d.departments.map((dep) => [dep.id, dep.name]))
              setClassToDept(Object.fromEntries(cl.classLevels.map((c) => [c.name, byId.get(c.departmentId ?? '') ?? 'Grammar'])))
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  const teachingPeriods = periods.filter((p) => !p.isBreak).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const breakPeriods = periods.filter((p) => p.isBreak)

  const startEditPeriod = (p: TimetablePeriod) => {
    setEditingPeriodId(p.id)
    setPeriodForm({ startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak })
    setPeriodError('')
  }

  const cancelEditPeriod = () => {
    setEditingPeriodId(null)
    setPeriodForm(emptyPeriodForm)
    setPeriodError('')
  }

  const submitPeriodRow = () => {
    if (!periodForm.startTime || !periodForm.endTime) { setPeriodError(tr('Start and end time are required')); return }
    if (periodForm.endTime <= periodForm.startTime) { setPeriodError(tr('End time must be after start time')); return }
    const overlap = periods
      .filter((p) => p.id !== editingPeriodId)
      .some((p) => periodForm.startTime < p.endTime && p.startTime < periodForm.endTime)
    if (overlap) { setPeriodError(tr('This overlaps with an existing period')); return }

    setPeriods((prev) => {
      const next = editingPeriodId
        ? prev.map((p) => p.id === editingPeriodId ? { ...p, ...periodForm } : p)
        : [...prev, { id: `new-${Date.now()}`, ...periodForm }]
      return next.sort((a, b) => a.startTime.localeCompare(b.startTime))
    })
    setEditingPeriodId(null)
    setPeriodForm(emptyPeriodForm)
    setPeriodError('')
  }

  const removePeriodRow = (id: string) => {
    setPeriods((prev) => prev.filter((p) => p.id !== id))
    if (editingPeriodId === id) cancelEditPeriod()
  }

  const handleSavePeriods = async () => {
    setPeriodsSaving(true)
    try {
      await savePeriodsApi(periods.map(({ startTime, endTime, isBreak }) => ({ startTime, endTime, isBreak })))
      showToast(tr('Period structure saved'))
      setShowPeriodsModal(false)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setPeriodError(e.response?.data?.message || tr('Failed to save period structure'))
    } finally {
      setPeriodsSaving(false)
    }
  }

  // A teacher's department(s) are the union of where they're explicitly placed
  // (t.departments) and what's derived from the classes they teach/master —
  // same rule as the Teachers page, so a teacher shows up here under a
  // department the moment they're placed there OR assigned a subject in it.
  const teacherDeptNames = (t: Teacher): string[] => {
    const cls = t.classLevels ?? []
    const derived = isSecondary
      ? cls.map((c) => classToDept[c]).filter((d): d is string => !!d)
      : isUniversity
        ? cls.map((c) => univDeptFromClassName(c))
        : []
    return [...new Set([...(t.departments ?? []), ...derived])]
  }
  const deptNames = useMemo(() => [...new Set(teachers.flatMap((t) => teacherDeptNames(t)))].sort(), [teachers, classToDept])
  const filteredTeachers = teachers.filter((t) => {
    if (activeDept && !teacherDeptNames(t).includes(activeDept)) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
  })

  // Which department a subject belongs to, same convention as teacherDeptNames.
  const subjectDept = (classLevel: string): string | undefined =>
    isSecondary ? classToDept[classLevel] : isUniversity ? univDeptFromClassName(classLevel) : undefined

  // Any teacher in a department can be given any course from that department —
  // picking one from here is the assignment itself (see saveTimetable), it no
  // longer has to already belong to this specific teacher. Primary schools have
  // no department concept, so every subject in the school is fair game there.
  const assignableSubjects = (t: Teacher): TeacherSubjectOption[] => {
    if (!hasDeptView) return allSubjects
    const depts = teacherDeptNames(t)
    return allSubjects.filter((s) => { const d = subjectDept(s.classLevel); return d ? depts.includes(d) : false })
  }
  const activeAssignableSubjects = activeTeacher ? assignableSubjects(activeTeacher) : []

  // Slot modal pickers — same drill-down as the Subjects page, just as
  // cascading dropdowns instead of click-through screens:
  //   University:  Level  → Department → Course
  //   Secondary:   Department → Class  → Subject
  //   Primary:     Class → Subject (no department concept at all)
  // All derived from activeAssignableSubjects, which is already scoped to
  // this teacher's own department(s) — so nothing here can surface a class or
  // department they don't belong to.
  const slotLevelOptions = isUniversity
    ? [...new Set(activeAssignableSubjects.map((s) => levelGroupOf(s.classLevel)))]
        .sort(sortLevelGroups)
        .map((g) => ({ value: g, label: tr(g) }))
    : []
  const slotDeptOptions = isUniversity
    ? [...new Set(activeAssignableSubjects.filter((s) => levelGroupOf(s.classLevel) === slotForm.level).map((s) => programmeOf(s.classLevel)))]
        .sort()
        .map((d) => ({ value: d, label: d }))
    : isSecondary
      ? [...new Set(activeAssignableSubjects.map((s) => classToDept[s.classLevel]).filter((d): d is string => !!d))]
          .sort()
          .map((d) => ({ value: d, label: d }))
      : []
  // A teacher (or a chosen Level, for university) very often only has ONE
  // possible department — asking them to click a dropdown to confirm
  // something there's no actual choice about is pure busywork. Only make
  // Department an interactive question when there's a real one to answer;
  // otherwise resolve it silently and just show it as context.
  const effectiveDepartment = slotDeptOptions.length === 1 ? slotDeptOptions[0].value : slotForm.department

  const slotClassOptions = isSecondary
    ? [...new Set(activeAssignableSubjects.filter((s) => classToDept[s.classLevel] === effectiveDepartment).map((s) => s.classLevel))]
        .sort((a, b) => (classOrder[a] ?? 0) - (classOrder[b] ?? 0))
        .map((name) => ({ value: name, label: stripDeptSuffix(name) }))
    : !hasDeptView
      ? [...new Set(activeAssignableSubjects.map((s) => s.classLevel))]
          .sort((a, b) => (classOrder[a] ?? 0) - (classOrder[b] ?? 0))
          .map((name) => ({ value: name, label: name }))
      : []

  // University has no separate Class step — Level + Department together
  // already resolve to exactly one class, so resolving a Department (whether
  // auto or picked) goes straight to it.
  const resolveUniClass = (level: string, department: string) =>
    activeAssignableSubjects.find((s) => levelGroupOf(s.classLevel) === level && programmeOf(s.classLevel) === department)?.classLevel ?? ''
  const effectiveClassLevel = isUniversity
    ? (effectiveDepartment ? resolveUniClass(slotForm.level, effectiveDepartment) : '')
    : slotForm.classLevel

  // Live cross-teacher clash check. The scarce thing here is a TIME SLOT for
  // this class (a class of students can't be in two lessons at once) — not
  // any particular course, which is why this gates the Period picker, not the
  // Course one: whichever course gets picked next is free to be any of them.
  const periodConflict = (p: TimetablePeriod) =>
    (activeTeacher && effectiveClassLevel)
      ? schoolSlots.find((o) =>
          o.teacherId !== activeTeacher.id && o.classLevel === effectiveClassLevel &&
          o.dayOfWeek === slotForm.dayOfWeek && timesOverlap(p.startTime, p.endTime, o.startTime, o.endTime)
        )
      : undefined

  // Same check against whatever period is actually selected right now — a
  // fallback safety net (e.g. editing a slot whose class just changed), since
  // the Period picker above should normally have already kept this from
  // happening by disabling the option in the first place.
  const modalConflict = (slotForm.mode === 'subject' && activeTeacher && effectiveClassLevel && slotForm.startTime && slotForm.endTime)
    ? schoolSlots.find((o) =>
        o.teacherId !== activeTeacher.id && o.classLevel === effectiveClassLevel &&
        o.dayOfWeek === slotForm.dayOfWeek && timesOverlap(slotForm.startTime, slotForm.endTime, o.startTime, o.endTime)
      )
    : undefined
  const modalConflictMessage = modalConflict
    ? `${tr('This period is already taken')} — ${modalConflict.teacherName} ${tr('is already teaching')} ${effectiveClassLevel} ${tr('on')} ${tr(dayLabel(slotForm.dayOfWeek))} ${tr('at')} ${modalConflict.startTime}-${modalConflict.endTime}`
    : ''

  const slotSubjectOptions = activeAssignableSubjects
    .filter((s) => s.classLevel === effectiveClassLevel)
    .map((s) => ({ value: s.id, label: s.name }))

  const openTeacher = async (teacher: Teacher) => {
    setActiveTeacher(teacher)
    setSlotsLoading(true)
    try {
      const { slots: fetched } = await getTeacherTimetableApi(teacher.id)
      setSlots(fetched.map((s: TimetableSlot) => ({
        id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
        subjectId: s.subjectId ?? null, label: s.label ?? null, room: s.room ?? null,
        subjectName: s.subjectName, classLevel: s.classLevel,
      })))
    } catch {
      showToast(tr('Failed to load timetable'), 'error')
    } finally {
      setSlotsLoading(false)
    }
  }

  const closeTeacher = () => { setActiveTeacher(null); setSlots([]) }

  const openAddSlot = () => {
    setEditingSlotId(null)
    setSlotForm(emptySlotForm)
    setSlotError('')
    setShowSlotModal(true)
  }

  const openEditSlot = (slot: EditableSlot) => {
    setEditingSlotId(slot.id)
    const matchingPeriod = teachingPeriods.find((p) => p.startTime === slot.startTime && p.endTime === slot.endTime)
    const cls = slot.classLevel ?? ''
    setSlotForm({
      dayOfWeek: slot.dayOfWeek, periodId: matchingPeriod?.id ?? '', startTime: slot.startTime, endTime: slot.endTime,
      mode: slot.subjectId ? 'subject' : 'private',
      level: isUniversity && cls ? levelGroupOf(cls) : '',
      department: !cls ? '' : isUniversity ? programmeOf(cls) : isSecondary ? (classToDept[cls] ?? '') : '',
      classLevel: cls, subjectId: slot.subjectId ?? '', label: slot.label ?? '', room: slot.room ?? '',
    })
    setSlotError('')
    setShowSlotModal(true)
  }

  const handlePeriodSelect = (periodId: string) => {
    const period = teachingPeriods.find((p) => p.id === periodId)
    setSlotForm({ ...slotForm, periodId, startTime: period?.startTime ?? '', endTime: period?.endTime ?? '' })
  }

  const handleSlotSubmit = () => {
    if (slotForm.mode === 'subject' && isUniversity && !slotForm.level) { setSlotError(tr('Please select a level')); return }
    if (slotForm.mode === 'subject' && hasDeptView && !effectiveDepartment) { setSlotError(tr('Please select a department')); return }
    if (slotForm.mode === 'subject' && !effectiveClassLevel) { setSlotError(tr('Please select a class')); return }
    if (slotForm.mode === 'subject' && !slotForm.periodId) { setSlotError(tr('Please select a period')); return }
    if (!slotForm.startTime || !slotForm.endTime) { setSlotError(tr('Start and end time are required')); return }
    if (slotForm.endTime <= slotForm.startTime) { setSlotError(tr('End time must be after start time')); return }
    if (slotForm.mode === 'subject' && !slotForm.subjectId) { setSlotError(tr('Please select a subject')); return }
    if (slotForm.mode === 'subject' && modalConflict) { setSlotError(modalConflictMessage); return }
    if (slotForm.mode === 'private' && !slotForm.label.trim()) { setSlotError(tr('Please enter a label')); return }

    const chosenSubject = activeAssignableSubjects.find((s) => s.id === slotForm.subjectId)
    const next: EditableSlot = {
      id: editingSlotId ?? `new-${Date.now()}`,
      dayOfWeek: slotForm.dayOfWeek,
      startTime: slotForm.startTime,
      endTime: slotForm.endTime,
      subjectId: slotForm.mode === 'subject' ? slotForm.subjectId : null,
      label: slotForm.mode === 'private' ? slotForm.label.trim() : null,
      room: slotForm.room.trim() || null,
      subjectName: slotForm.mode === 'subject' ? chosenSubject?.name : null,
      classLevel: slotForm.mode === 'subject' ? chosenSubject?.classLevel : null,
    }
    const overlap = slots.some((s) =>
      s.id !== next.id && s.dayOfWeek === next.dayOfWeek &&
      next.startTime < s.endTime && s.startTime < next.endTime
    )
    if (overlap) { setSlotError(tr('This overlaps with another slot on the same day')); return }

    setSlots((prev) => editingSlotId
      ? prev.map((s) => s.id === editingSlotId ? next : s)
      : [...prev, next])
    setShowSlotModal(false)
  }

  const handleDeleteSlot = () => {
    if (!deleteTarget) return
    setSlots((prev) => prev.filter((s) => s.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const handleSaveTimetable = async () => {
    if (!activeTeacher) return
    setSaving(true)
    try {
      await saveTimetableApi(activeTeacher.id, slots.map(({ dayOfWeek, startTime, endTime, subjectId, label, room }) => ({ dayOfWeek, startTime, endTime, subjectId, label, room })))
      showToast(tr('Timetable saved'))
      // A newly-picked course may have just given this teacher a new derived
      // department — refresh so the list/filter reflect it immediately.
      getTeachersApi().then((t) => setTeachers(t.teachers)).catch(() => {})
      // Keep the cross-teacher clash check current for whoever's opened next.
      getSchoolTimetableApi().then((st) => setSchoolSlots(st.slots)).catch(() => {})
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      showToast(e.response?.data?.message || tr('Failed to save timetable'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const gridSlots: WeekGridSlot[] = slots.map((s) => ({
    id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
    title: s.subjectId ? (s.subjectName ?? tr('Unknown subject')) : (s.label ?? ''),
    subtitle: s.subjectId ? s.classLevel : s.room,
    isPrivate: !s.subjectId,
  }))

  const sortedSlots = [...slots].sort((a, b) =>
    DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime)
  )

  return (
    <DesktopOnly message={tr('The Timetable builder needs the space of a bigger display. Please use a laptop or desktop computer.')}>
      <div>
        {!activeTeacher ? (
          <>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{tr('Timetable')}</h2>
                <p className="text-muted-foreground text-sm mt-1">{tr('Pick a teacher to build their weekly schedule')}</p>
              </div>
              <button onClick={() => { setPeriodForm(emptyPeriodForm); setEditingPeriodId(null); setPeriodError(''); setShowPeriodsModal(true) }}
                className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition flex-shrink-0">
                <Clock size={15} /> {tr('Set Up Periods')}
              </button>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr('Search teachers...')}
                  className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {hasDeptView && deptNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setActiveDept(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${!activeDept ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary'}`}>
                    {tr('All')}
                  </button>
                  {deptNames.map((d) => (
                    <button key={d} onClick={() => setActiveDept(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${activeDept === d ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{tr('Loading...')}</div>
            ) : filteredTeachers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{tr('No teachers found.')}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredTeachers.map((t) => (
                  <button key={t.id} onClick={() => openTeacher(t)}
                    className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition flex items-center gap-3">
                    <div className="w-10 h-10 flex-shrink-0 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-bold">
                      {t.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tr(roleLabels[t.role] || t.role)}</p>
                      {teacherDeptNames(t).length > 0 && (
                        <p className="text-xs text-muted-foreground/80 truncate">{teacherDeptNames(t).join(', ')}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={closeTeacher}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition">
              <ArrowLeft size={14} /> {tr('Back to Teachers')}
            </button>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 flex-shrink-0 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-base font-bold">
                  {activeTeacher.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{activeTeacher.name}</h2>
                  <p className="text-muted-foreground text-sm flex items-center gap-1"><Briefcase size={12} /> {tr(roleLabels[activeTeacher.role] || activeTeacher.role)}</p>
                  {teacherDeptNames(activeTeacher).length > 0 && (
                    <p className="text-muted-foreground text-xs mt-0.5">{teacherDeptNames(activeTeacher).join(', ')}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={openAddSlot}
                  className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition">
                  <Plus size={16} /> {tr('Add Slot')}
                </button>
                <button onClick={handleSaveTimetable} disabled={saving}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? tr('Saving...') : tr('Save Timetable')}
                </button>
              </div>
            </div>

            {slotsLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{tr('Loading...')}</div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary/20 border border-primary/30 inline-block" /> {tr(isUniversity ? 'Course' : 'Subject')}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> {tr('Private class')}</span>
                  <span>{tr('Click a slot to edit')}</span>
                </div>
                <WeekGrid slots={gridSlots} breaks={breakPeriods} onSlotClick={(s) => { const found = sortedSlots.find((x) => x.id === s.id); if (found) openEditSlot(found) }} />
              </>
            )}
          </>
        )}

        {/* Add/Edit Slot Modal */}
        {showSlotModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-foreground text-lg">{editingSlotId ? tr('Edit Slot') : tr('Add Slot')}</h3>
                <button onClick={() => setShowSlotModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              {(slotError || modalConflictMessage) && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{slotError || modalConflictMessage}</div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{tr('Day')}</label>
                  <select value={slotForm.dayOfWeek} onChange={(e) => setSlotForm({ ...slotForm, dayOfWeek: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                    {DAYS.map((d) => <option key={d} value={d}>{tr(dayLabel(d))}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSlotForm({ ...slotForm, mode: 'subject' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${slotForm.mode === 'subject' ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                    {tr(isUniversity ? 'Course' : 'School Subject')}
                  </button>
                  <button type="button" onClick={() => setSlotForm({ ...slotForm, mode: 'private' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${slotForm.mode === 'private' ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                    {tr('Private Class')}
                  </button>
                </div>
                {slotForm.mode === 'subject' ? (
                  <>
                    {isUniversity && (
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('Level')} <span className="text-destructive">*</span></label>
                        <CustomSelect
                          value={slotForm.level}
                          onChange={(v) => setSlotForm({ ...slotForm, level: v, department: '', classLevel: '', periodId: '', startTime: '', endTime: '', subjectId: '' })}
                          options={slotLevelOptions}
                          placeholder={tr('Select a level...')}
                        />
                        {slotLevelOptions.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-1">{tr('No levels found yet — add subjects from the Subjects page, or add a Private Class instead.')}</p>
                        )}
                      </div>
                    )}
                    {hasDeptView && (!isUniversity || slotForm.level) && (
                      slotDeptOptions.length > 1 ? (
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">{tr('Department')} <span className="text-destructive">*</span></label>
                          <CustomSelect
                            value={slotForm.department}
                            onChange={(v) => setSlotForm({ ...slotForm, department: v, periodId: '', startTime: '', endTime: '', subjectId: '' })}
                            options={slotDeptOptions}
                            placeholder={tr('Select a department...')}
                          />
                        </div>
                      ) : slotDeptOptions.length === 1 ? (
                        // Only one department to choose from — nothing to actually ask,
                        // so just show it as context instead of a dropdown with one option.
                        <p className="text-xs text-muted-foreground">
                          {tr('Department')}: <span className="font-medium text-foreground">{slotDeptOptions[0].label}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{tr('No departments found yet — add subjects from the Subjects page, or add a Private Class instead.')}</p>
                      )
                    )}
                    {isSecondary && effectiveDepartment && (
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('Class')} <span className="text-destructive">*</span></label>
                        <CustomSelect
                          value={slotForm.classLevel}
                          onChange={(v) => setSlotForm({ ...slotForm, classLevel: v, periodId: '', startTime: '', endTime: '', subjectId: '' })}
                          options={slotClassOptions}
                          placeholder={tr('Select a class...')}
                        />
                        {slotClassOptions.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-1">{tr('No classes found in this department yet.')}</p>
                        )}
                      </div>
                    )}
                    {!hasDeptView && (
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('Class')} <span className="text-destructive">*</span></label>
                        <CustomSelect
                          value={slotForm.classLevel}
                          onChange={(v) => setSlotForm({ ...slotForm, classLevel: v, periodId: '', startTime: '', endTime: '', subjectId: '' })}
                          options={slotClassOptions}
                          placeholder={tr('Select a class...')}
                        />
                        {slotClassOptions.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-1">{tr('No classes found yet — add subjects from the Subjects page, or add a Private Class instead.')}</p>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">{tr('Period')} <span className="text-destructive">*</span></label>
                      <select value={slotForm.periodId} onChange={(e) => handlePeriodSelect(e.target.value)}
                        disabled={!effectiveClassLevel}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed">
                        <option value="">{tr(effectiveClassLevel ? 'Select...' : 'Select a class first')}</option>
                        {teachingPeriods.map((p) => {
                          const clash = periodConflict(p)
                          return (
                            <option key={p.id} value={p.id} disabled={!!clash}>
                              {p.startTime} – {p.endTime}{clash ? ` (${tr('taken')} — ${clash.teacherName})` : ''}
                            </option>
                          )
                        })}
                      </select>
                      {teachingPeriods.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">{tr("This school hasn't set up its period structure yet — use \"Set Up Periods\" first.")}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">{tr(isUniversity ? 'Course' : 'Subject')} <span className="text-destructive">*</span></label>
                      <CustomSelect
                        value={slotForm.subjectId}
                        onChange={(v) => setSlotForm({ ...slotForm, subjectId: v })}
                        options={slotSubjectOptions}
                        placeholder={tr(effectiveClassLevel ? 'Select...' : 'Select a class first')}
                        disabled={!effectiveClassLevel}
                      />
                      {effectiveClassLevel && slotSubjectOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">{tr('No subjects found for this class yet — add some from the Subjects page.')}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('Start Time')}</label>
                        <TimeInput value={slotForm.startTime} onChange={(v) => setSlotForm({ ...slotForm, startTime: v })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('End Time')}</label>
                        <TimeInput value={slotForm.endTime} onChange={(v) => setSlotForm({ ...slotForm, endTime: v })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">{tr('Label')} <span className="text-destructive">*</span></label>
                      <input type="text" placeholder={tr('e.g. Private tutoring, Extra lessons')} value={slotForm.label}
                        onChange={(e) => setSlotForm({ ...slotForm, label: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">{tr('Room')} <span className="text-muted-foreground">({tr('optional')})</span></label>
                  <input type="text" placeholder={tr('e.g. Room 12')} value={slotForm.room}
                    onChange={(e) => setSlotForm({ ...slotForm, room: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                {editingSlotId && (
                  <button onClick={() => { setShowSlotModal(false); setDeleteTarget(slots.find((s) => s.id === editingSlotId) ?? null) }}
                    className="border border-destructive/30 text-destructive px-4 py-2 rounded-lg text-sm hover:bg-destructive/10 transition">
                    {tr('Delete')}
                  </button>
                )}
                <button onClick={() => setShowSlotModal(false)}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                  {tr('Cancel')}
                </button>
                <button onClick={handleSlotSubmit} disabled={!!modalConflict}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {editingSlotId ? tr('Save Changes') : tr('Add Slot')}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!deleteTarget}
          title={tr('Remove Slot')}
          message={tr('Remove this slot from the timetable?')}
          confirmLabel={tr('Remove')}
          confirmColor="red"
          onConfirm={handleDeleteSlot}
          onCancel={() => setDeleteTarget(null)}
        />

        {/* Period Structure Modal */}
        {showPeriodsModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-foreground text-lg">{tr('Period Structure')}</h3>
                <button onClick={() => setShowPeriodsModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{tr("Define the school's daily bell schedule once — every teacher's timetable picks periods from this same list.")}</p>
              {periodError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{periodError}</div>}

              {periods.length > 0 && (
                <div className="mb-4 border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {periods.map((p) => (
                    <div key={p.id} className={`flex items-center justify-between px-3 py-2 ${editingPeriodId === p.id ? 'bg-primary/5' : 'bg-card'}`}>
                      <span className="text-sm text-foreground">{p.startTime} – {p.endTime}</span>
                      <div className="flex items-center gap-2">
                        {p.isBreak && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{tr('Break')}</span>}
                        <button onClick={() => startEditPeriod(p)} className="text-muted-foreground hover:text-primary p-1 rounded transition"><Pencil size={13} /></button>
                        <button onClick={() => removePeriodRow(p.id)} className="text-muted-foreground hover:text-destructive p-1 rounded transition"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-border rounded-lg p-3 space-y-2">
                {editingPeriodId && (
                  <p className="text-xs font-medium text-primary">{tr('Editing period')} — {tr('update the fields below')}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{tr('Start Time')}</label>
                    <TimeInput value={periodForm.startTime} onChange={(v) => setPeriodForm({ ...periodForm, startTime: v })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{tr('End Time')}</label>
                    <TimeInput value={periodForm.endTime} onChange={(v) => setPeriodForm({ ...periodForm, endTime: v })} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={periodForm.isBreak} onChange={(e) => setPeriodForm({ ...periodForm, isBreak: e.target.checked })} />
                  {tr('This is a break (not a teaching period)')}
                </label>
                <div className="flex gap-2">
                  {editingPeriodId && (
                    <button onClick={cancelEditPeriod}
                      className="border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition">
                      {tr('Cancel')}
                    </button>
                  )}
                  <button onClick={submitPeriodRow}
                    className="flex-1 flex items-center justify-center gap-2 border border-border text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted transition">
                    {editingPeriodId ? tr('Save Changes') : <><Plus size={14} /> {tr('Add Row')}</>}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowPeriodsModal(false)}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted transition">
                  {tr('Cancel')}
                </button>
                <button onClick={handleSavePeriods} disabled={periodsSaving}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {periodsSaving ? tr('Saving...') : tr('Save Period Structure')}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      </div>
    </DesktopOnly>
  )
}
