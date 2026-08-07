'use client'
import { useEffect, useMemo, useState } from 'react'
import { getTeachersApi, getTeacherSubjectsApi } from '@/lib/api/teachers'
import {
  getTeacherTimetableApi, saveTimetableApi, getPeriodsApi, savePeriodsApi, getSchoolTimetableApi,
  getTimetableHistoryApi, deleteTimetableHistoryVersionApi,
  TimetableSlot, TimetablePeriod, SchoolTimetableSlot, TimetableHistoryVersion,
} from '@/lib/api/timetable'
import { getClassLevelsApi, ClassLevel as ClassLevelDef } from '@/lib/api/classLevels'
import { getDepartmentsApi } from '@/lib/api/departments'
import { getTermsApi } from '@/lib/api/terms'
import { stripProgrammeSuffix, programmeFromName, Programme, PROGRAMME_LABELS } from '@/lib/programme'
import { useAuthStore } from '@/lib/store/auth.store'
import { Plus, X, ArrowLeft, Search, Briefcase, Clock, Trash2, Pencil } from 'lucide-react'
import CustomSelect from '@/components/ui/CustomSelect'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import DesktopOnly from '@/components/ui/DesktopOnly'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import Pagination from '@/components/ui/Pagination'
import { usePagination } from '@/lib/usePagination'
import WeekGrid, { WeekGridSlot } from '@/components/ui/WeekGrid'
import { levelGroupOf, programmeOf, sortLevelGroups } from '@/lib/universityLevels'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const WEEKEND_DAYS = new Set(['SATURDAY', 'SUNDAY'])
const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()
const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd
const JS_DAY_TO_DAY_OF_WEEK = ['SUNDAY', ...DAYS.slice(0, 6)]
// Which weekday a "YYYY-MM-DD" string falls on — mirrors the API's dateStringToDayOfWeek,
// used so a one-off slot's day column is always derived from its real date.
const dayOfWeekForDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return JS_DAY_TO_DAY_OF_WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
const formatOneOffDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
// "07:30" + 100 -> "09:10". Clamps at 23:59 so a late-day period can't roll past midnight.
const addMinutes = (hhmm: string, mins: number): string => {
  const [h, m] = hhmm.split(':').map(Number)
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const durationMinutes = (start: string, end: string): number => {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}
// How many periods a start-end span covers. Always derived from the real duration, never
// from whatever a "Periods" input currently holds, so a displayed count can't disagree
// with the times shown beside it. null when the school hasn't set its period length yet —
// callers must say so rather than quietly showing 1.
const periodsBetween = (start: string, end: string, periodLen: number | null): number | null =>
  periodLen && start && end ? Math.max(1, Math.round(durationMinutes(start, end) / periodLen)) : null
// True when a span isn't a whole number of periods (e.g. a 160-minute row left over from
// before the school set 50 minutes per period). Such a row is what blocks the whole grid
// from saving, so it has to be visible in the list, not just in the save error.
const isWholePeriods = (start: string, end: string, periodLen: number | null): boolean =>
  !periodLen || durationMinutes(start, end) % periodLen === 0
// A row or class is as many periods as the admin types. Capped only to keep a typo like
// "500" from producing a block that runs to the end of the day.
const MAX_PERIODS_PER_ROW = 20
// 0 means "the field is empty right now" — a number input has to be clearable while being
// retyped, and snapping it back to 1 on every keystroke fights the admin. Submit-time
// checks reject 0, so it can never be saved.
const parsePeriodCount = (raw: string): number => {
  const n = Math.floor(Number(raw))
  if (!raw || !Number.isFinite(n) || n < 1) return 0
  return Math.min(n, MAX_PERIODS_PER_ROW)
}
// The latest end time across every existing period (teaching or break) — used to default
// a new period's start time to right where the schedule currently leaves off, so the
// admin doesn't have to retype it for each consecutive add.
const latestEndTime = (list: { endTime: string }[]): string => list.reduce((max, p) => (p.endTime > max ? p.endTime : max), '')

// University class-name convention: "HND {Department} - Level 1|2", "Degree
// {Department}". Mirrors univDeptFromClassName in the Teachers page.
const univDeptFromClassName = (rawName: string): string => {
  // Normalised first: these patterns anchor at the end of the name, where the
  // Day/Evening marker sits. The sitting is `ClassLevel.programme`, never part of a
  // department or level.
  const name = stripProgrammeSuffix(rawName)
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
// `term` is the semester a university course belongs to; null means the subject runs the
// whole academic year, which is how primary/secondary always store them.
interface TeacherSubjectOption { id: string; name: string; classLevel: string; term?: string | null }
interface TermOption { id: string; name: string; session: string; isCurrent: boolean }

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
  specificDate?: string | null
  // Window for a private class that runs weekly but only for part of the term. Both unset
  // = it runs the whole term. Ignored when specificDate is set.
  startsOn?: string | null
  endsOn?: string | null
  // Course this private class delivers hours toward, if any.
  privateSubjectId?: string | null
}

const slotsOverlap = (a: { dayOfWeek: string; startTime: string; endTime: string; specificDate?: string | null }, b: typeof a) => {
  if (a.dayOfWeek !== b.dayOfWeek) return false
  if (a.specificDate && b.specificDate && a.specificDate !== b.specificDate) return false
  return a.startTime < b.endTime && b.startTime < a.endTime
}

const roleLabels: Record<string, string> = {
  CLASS_TEACHER: 'Class Teacher',
  CLASS_MASTER: 'Class Master',
  SUBJECT_TEACHER: 'Subject Teacher',
  VICE_PRINCIPAL: 'Vice Principal',
}

const emptySlotForm = {
  dayOfWeek: 'MONDAY', periodId: '', numPeriods: 1, startTime: '', endTime: '', mode: 'subject' as 'subject' | 'private',
  level: '', department: '', section: '' as Programme | '', classLevel: '', subjectId: '', label: '', room: '',
  // Private-class-only: recurring weekly (default) vs one-off specific date(s). In edit
  // mode, specificDates holds exactly the one date being edited; in add mode it's a
  // growable list (one slot gets created per date, all sharing the same time/label/room).
  recurring: true, specificDates: [] as string[], dateInput: '',
  // Recurring private class bounded to a window rather than the whole term.
  useWindow: false, windowFrom: '', windowTo: '',
  // Optional course the private class counts toward (hours land on its coverage).
  privateSubjectId: '',
}
// No `programme` field — Day and Evening are edited as two separate lists in the Set Up
// Periods modal, so a row's sitting is whichever tab is open when it's added, not a choice
// made per row.
const emptyPeriodForm = { startTime: '', endTime: '', isBreak: false, numPeriods: 1 }

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
  // The courses/subjects the OPEN teacher is actually assigned to (not the whole school's).
  // The builder schedules what a teacher already teaches; assigning is done on the Teachers
  // page. Loaded per teacher, alongside their timetable.
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubjectOption[]>([])
  const [teacherSubjectsLoading, setTeacherSubjectsLoading] = useState(false)
  const [terms, setTerms] = useState<TermOption[]>([])
  const [classOrder, setClassOrder] = useState<Record<string, number>>({})
  // Class rows, kept for the Day/Evening sitting they carry. The builder works with class
  // NAMES everywhere else, which can't distinguish a morning cohort from an evening one.
  const [classDefs, setClassDefs] = useState<ClassLevelDef[]>([])
  const [schoolSlots, setSchoolSlots] = useState<SchoolTimetableSlot[]>([])
  const [slots, setSlots] = useState<EditableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showSlotModal, setShowSlotModal] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [slotForm, setSlotForm] = useState(emptySlotForm)
  const [slotError, setSlotError] = useState('')
  // Today, for the date pickers' `min`. A class cannot be booked into a day that is over;
  // the API refuses it too (saveTimetable), this just stops it being offered.
  const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const [deleteTarget, setDeleteTarget] = useState<EditableSlot | null>(null)

  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  // Minutes per teaching period ("school hour"), e.g. 50 — one per sitting, since Day and
  // Evening are independent bell schedules with no reason to share a period length. Kept
  // as strings for the inputs; '' means unset.
  const [dayPeriodMinutes, setDayPeriodMinutes] = useState<string>('')
  const [eveningPeriodMinutes, setEveningPeriodMinutes] = useState<string>('')
  const [showPeriodsModal, setShowPeriodsModal] = useState(false)
  // Which sitting's list the modal is currently showing/editing. Non-university schools
  // never leave DAY — there is no tab UI for them at all.
  const [periodsSitting, setPeriodsSitting] = useState<'DAY' | 'EVENING'>('DAY')
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm)
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null)
  const [periodError, setPeriodError] = useState('')
  const [periodsSaving, setPeriodsSaving] = useState(false)
  // Incremented (never reset) each time "Add"/"Save Changes" is rejected for a missing
  // period length — used as a key on the Minutes-per-period field so its shake animation
  // replays on every attempt, not just the first.
  const [minutesShakeKey, setMinutesShakeKey] = useState(0)

  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyVersions, setHistoryVersions] = useState<TimetableHistoryVersion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deleteVersionTarget, setDeleteVersionTarget] = useState<string | null>(null)

  const dayLenNum = Number(dayPeriodMinutes) > 0 ? Number(dayPeriodMinutes) : null
  const eveningLenNum = Number(eveningPeriodMinutes) > 0 ? Number(eveningPeriodMinutes) : null
  // The length that applies to whichever sitting's tab is currently open in the modal.
  const periodLen = periodsSitting === 'EVENING' ? eveningLenNum : dayLenNum

  useBodyScrollLock(showSlotModal || showPeriodsModal || !!deleteTarget || showHistoryModal || !!deleteVersionTarget)

  useEffect(() => {
    Promise.all([getTeachersApi(), getPeriodsApi(), getTermsApi(), getSchoolTimetableApi()])
      .then(([t, p, tm, st]) => {
        setTeachers(t.teachers)
        setPeriods(p.periods)
        setDayPeriodMinutes(p.dayPeriodMinutes != null ? String(p.dayPeriodMinutes) : '')
        setEveningPeriodMinutes(p.eveningPeriodMinutes != null ? String(p.eveningPeriodMinutes) : '')
        setTerms(tm.terms ?? [])
        setSchoolSlots(st.slots)
      })
      .catch(() => showToast(tr('Failed to load data'), 'error'))
      .finally(() => setLoading(false))
    // Class order (for sorting the Class picker) — every school type has this.
    // Secondary also maps each class to its department, same as the Teachers
    // page, so a teacher's department shows up here even if it was only
    // derived from their assigned subjects rather than set explicitly.
    getClassLevelsApi()
      .then((cl) => {
        setClassOrder(Object.fromEntries(cl.classLevels.map((c) => [c.name, c.order])))
        setClassDefs(cl.classLevels)
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
  // The Set Up Periods modal only ever shows/edits ONE sitting's rows at a time — Day and
  // Evening are independent lists now, not one shared list with per-row tags.
  const sittingPeriods = periods.filter((p) => p.programme === periodsSitting).sort((a, b) => a.startTime.localeCompare(b.startTime))

  const startEditPeriod = (p: TimetablePeriod) => {
    setEditingPeriodId(p.id)
    // A teaching row can span any number of periods (a "double period" block, a triple,
    // ...) — derive how many from its actual duration so editing shows what's really
    // there. A row that isn't a whole number of periods opens with the field blank, since
    // rounding it silently would hide the very thing the admin came here to correct.
    const exact = !p.isBreak && isWholePeriods(p.startTime, p.endTime, periodLen)
    const numPeriods = exact ? (periodsBetween(p.startTime, p.endTime, periodLen) ?? 1) : 0
    setPeriodForm({ startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak, numPeriods })
    setPeriodError('')
  }

  // The pending "add a row" form always starts where the CURRENT SITTING's schedule
  // leaves off, so consecutive rows need no retyping. Recomputed from that sitting's list
  // after EVERY change to it: adding, editing, deleting AND switching sittings all move
  // where its day now ends. Taking the list as an argument rather than reading `periods` is
  // deliberate — a caller that just called setPeriods still sees the OLD state in its own
  // closure, which is exactly how the form came to offer 13:50 as a start when the last row
  // ended at 13:00.
  const resetPendingPeriodRow = (list: { endTime: string }[]) => {
    setEditingPeriodId(null)
    setPeriodForm({ ...emptyPeriodForm, startTime: latestEndTime(list) })
    setPeriodError('')
  }

  const cancelEditPeriod = () => resetPendingPeriodRow(sittingPeriods)

  // Switching tabs cancels whatever was mid-edit on the other sitting and starts the "add a
  // row" form fresh from where THIS sitting's schedule leaves off.
  const switchPeriodsSitting = (sitting: 'DAY' | 'EVENING') => {
    setPeriodsSitting(sitting)
    resetPendingPeriodRow(periods.filter((p) => p.programme === sitting))
  }

  const submitPeriodRow = () => {
    if (!periodForm.startTime) { setPeriodError(tr('Start time is required')); return }
    if (!periodForm.isBreak && !periodLen) {
      setPeriodError(tr('Set the minutes per period first'))
      setMinutesShakeKey((k) => k + 1)
      return
    }

    if (!periodForm.isBreak && periodForm.numPeriods < 1) {
      setPeriodError(tr('Enter how many periods this row is')); return
    }

    // A teaching period's end is fixed by the period length (admin only picks the
    // start) times how many periods this ONE row spans — the admin types that number, so
    // one row can be a double period and the next a single. A break can be any length, so
    // it keeps a free end-time input.
    const endTime = periodForm.isBreak ? periodForm.endTime : addMinutes(periodForm.startTime, periodLen! * periodForm.numPeriods)
    if (!endTime) { setPeriodError(tr('End time is required')); return }
    if (endTime <= periodForm.startTime) { setPeriodError(tr('End time must be after start time')); return }
    // Overlap is only checked within the SAME sitting — Day and Evening are independent
    // schedules, so nothing stops their clock windows from overlapping (in practice Evening
    // simply starts once Day is over).
    const overlap = periods
      .filter((p) => p.id !== editingPeriodId && p.programme === periodsSitting)
      .find((p) => periodForm.startTime < p.endTime && p.startTime < endTime)
    if (overlap) {
      // A class may never run across a break, so a teaching row that reaches into one is
      // refused by name — "overlaps an existing period" would leave the admin hunting for
      // which row, when the answer is almost always that the row is one period too long.
      setPeriodError(overlap.isBreak && !periodForm.isBreak
        ? `${tr('This runs across the break at')} ${overlap.startTime}–${overlap.endTime}. ${tr('Use fewer periods, or start after the break.')}`
        : `${tr('This overlaps the existing')} ${overlap.startTime}–${overlap.endTime} ${tr('row')}`)
      return
    }

    const row = { startTime: periodForm.startTime, endTime, isBreak: periodForm.isBreak, programme: periodsSitting }
    const updatedList = editingPeriodId
      ? periods.map((p) => p.id === editingPeriodId ? { ...p, ...row } : p)
      : [...periods, { id: `new-${Date.now()}`, ...row }]
    setPeriods(updatedList.sort((a, b) => a.startTime.localeCompare(b.startTime)))
    resetPendingPeriodRow(updatedList.filter((p) => p.programme === periodsSitting))
  }

  const removePeriodRow = (id: string) => {
    const next = periods.filter((p) => p.id !== id)
    setPeriods(next)
    // Deleting the last row of the day moves where the next one starts, so the pending form
    // follows it down. An edit in progress on a DIFFERENT row is left alone — dropping it
    // would throw away typing the admin hasn't submitted yet.
    if (!editingPeriodId || editingPeriodId === id) resetPendingPeriodRow(next.filter((p) => p.programme === periodsSitting))
  }

  // Rows that aren't a whole number of periods, for the sitting currently open — normally
  // rows saved before the school set that sitting's period length, which the API rejects
  // outright. Listed together so the admin fixes every one in a single pass.
  const nonConformingPeriods = sittingPeriods.filter((p) => !p.isBreak && !isWholePeriods(p.startTime, p.endTime, periodLen))

  const handleSavePeriods = async () => {
    // Both sittings are validated before saving, not just whichever tab happens to be open —
    // Save persists the whole combined list in one call.
    for (const sitting of ['DAY', 'EVENING'] as const) {
      const len = sitting === 'EVENING' ? eveningLenNum : dayLenNum
      const rows = periods.filter((p) => p.programme === sitting)
      const label = tr(sitting === 'EVENING' ? 'Evening' : 'Day')
      if (rows.some((p) => !p.isBreak) && !len) {
        switchPeriodsSitting(sitting)
        setPeriodError(`${tr('Enter how many minutes count as one')} ${label} ${tr('period')}`)
        setMinutesShakeKey((k) => k + 1)
        return
      }
      const bad = rows.filter((p) => !p.isBreak && !isWholePeriods(p.startTime, p.endTime, len))
      if (bad.length > 0) {
        switchPeriodsSitting(sitting)
        const badList = bad.map((p) => `${p.startTime}–${p.endTime} (${durationMinutes(p.startTime, p.endTime)} min)`).join(', ')
        setPeriodError(`${tr('These')} ${label} ${tr('rows are not a whole number of')} ${len} ${tr('minute periods')}: ${badList}. ${tr('Edit each one and set how many periods it is.')}`)
        return
      }
    }
    setPeriodsSaving(true)
    try {
      const result = await savePeriodsApi(periods.map(({ startTime, endTime, isBreak, programme }) => ({ startTime, endTime, isBreak, programme })), dayLenNum, eveningLenNum)
      showToast(result.message)
      setShowPeriodsModal(false)
      // A period's time moving can carry teacher slots along with it (school-wide, not
      // just the one open here) — refresh whatever's currently on screen so it's not
      // showing stale times.
      getSchoolTimetableApi().then((st) => setSchoolSlots(st.slots)).catch(() => {})
      if (activeTeacher) {
        getTeacherTimetableApi(activeTeacher.id)
          .then(({ slots: fetched }) => setSlots(fetched.map((s: TimetableSlot) => ({
            id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
            subjectId: s.subjectId ?? null, label: s.label ?? null, room: s.room ?? null,
            subjectName: s.subjectName, classLevel: s.classLevel, specificDate: s.specificDate ?? null,
          }))))
          .catch(() => {})
      }
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
  const TEACHER_COLS = 3
  const TEACHER_ROWS_PER_PAGE = 7
  const { page: teacherPage, setPage: setTeacherPage, pageItems: teacherPageItems, totalPages: teacherTotalPages } =
    usePagination(filteredTeachers, TEACHER_COLS * TEACHER_ROWS_PER_PAGE, `${activeDept ?? ''}|${search}`)

  // The current teaching period, by name: universities teach a different set of courses each
  // semester, primary/secondary run their subjects across the whole year. `Subject.term`
  // holds a term NAME (not an id, and not session-qualified), which is the same match the
  // rest of the app already does for this field.
  const currentTerm = terms.find((t) => t.isCurrent)
  const sessionTermNames = currentTerm ? terms.filter((t) => t.session === currentTerm.session).map((t) => t.name) : []

  // Only what this teacher actually teaches, scoped to the period now running:
  //   University        → courses whose semester IS the current semester
  //   Primary/secondary → subjects for the current academic year (term null = the whole
  //                       year, which is how every one of them is stored)
  // Assigning a course is NOT done here — an admin does that on the Teachers page, and for
  // universities that is also where the "one lecturer per course" hand-over happens. The
  // API enforces the same rule (see saveTimetable), so a stale page can't get round it.
  const inCurrentPeriod = (s: TeacherSubjectOption): boolean =>
    isUniversity
      ? !!currentTerm && s.term === currentTerm.name
      : s.term == null || sessionTermNames.includes(s.term)

  const activeAssignableSubjects = activeTeacher ? teacherSubjects.filter(inCurrentPeriod) : []

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

  // A lecturer can teach the same programme in both sittings, so the class picker labels
  // each option with its sitting instead of filtering one out: both are legitimately
  // theirs, and the times are what differ.
  const sittingOfClass = (name: string): Programme =>
    classDefs.find((c) => c.name === name)?.programme ?? programmeFromName(name)
  const classOptionLabel = (name: string, base: string): string =>
    sittingOfClass(name) === 'EVENING' ? `${base} (${tr('Evening')})` : base

  // Both sittings of the same course share the same Level + Department, so when a teacher
  // holds both, Department alone can't tell them apart any more (it collapses to one option,
  // see slotDeptOptions above). An explicit Section step is the only way to say which one is
  // meant — skipped, exactly like Department, when there's only one to answer.
  const slotSectionOptions = isUniversity
    ? ([...new Set(activeAssignableSubjects
        .filter((s) => levelGroupOf(s.classLevel) === slotForm.level && programmeOf(s.classLevel) === effectiveDepartment)
        .map((s) => sittingOfClass(s.classLevel)))] as Programme[])
        .sort()
        .map((p) => ({ value: p, label: tr(PROGRAMME_LABELS[p]) }))
    : []
  const effectiveSection: Programme | '' = slotSectionOptions.length === 1 ? slotSectionOptions[0].value : slotForm.section

  const slotClassOptions = isSecondary
    ? [...new Set(activeAssignableSubjects.filter((s) => classToDept[s.classLevel] === effectiveDepartment).map((s) => s.classLevel))]
        .sort((a, b) => (classOrder[a] ?? 0) - (classOrder[b] ?? 0))
        .map((name) => ({ value: name, label: classOptionLabel(name, stripProgrammeSuffix(stripDeptSuffix(name))) }))
    : !hasDeptView
      ? [...new Set(activeAssignableSubjects.map((s) => s.classLevel))]
          .sort((a, b) => (classOrder[a] ?? 0) - (classOrder[b] ?? 0))
          .map((name) => ({ value: name, label: classOptionLabel(name, stripProgrammeSuffix(name)) }))
      : []

  // University has no separate Class step — Level + Department together
  // already resolve to exactly one class, so resolving a Department (whether
  // auto or picked) goes straight to it.
  const resolveUniClass = (level: string, department: string, section: Programme | '') =>
    activeAssignableSubjects.find((s) =>
      levelGroupOf(s.classLevel) === level && programmeOf(s.classLevel) === department &&
      (!section || sittingOfClass(s.classLevel) === section)
    )?.classLevel ?? ''
  // Genuinely ambiguous (both sittings exist) and not yet answered: resolving to the first
  // match anyway would silently guess a class while the Section field still shows required
  // and unanswered — nothing should be pickable until the admin actually says which one.
  const sectionUnanswered = slotSectionOptions.length > 1 && !effectiveSection
  const effectiveClassLevel = isUniversity
    ? (effectiveDepartment && !sectionUnanswered ? resolveUniClass(slotForm.level, effectiveDepartment, effectiveSection) : '')
    : slotForm.classLevel

  // Only the periods this class's own sitting defines — an Evening class never sees a Day
  // period, and a Day class never sees an Evening one. Every period now belongs to exactly
  // one sitting (no more shared/"whole school" rows).
  const availableTeachingPeriods = effectiveClassLevel
    ? teachingPeriods.filter((p) => p.programme === sittingOfClass(effectiveClassLevel))
    : teachingPeriods

  // How many periods actually fit back-to-back from the selected start, within THIS
  // sitting's own structure — a double period can only be as long as the structure defines,
  // never longer. Measured in actual continuous minutes up to the first gap (a break, or
  // simply no period defined past that point), not in how many rows the periods table
  // happens to be split into — a school that defines one row per 100-minute double period
  // (rather than two 50-minute rows) still gets 2 here, not 1, as long as "minutes per
  // period" is set to 50. Without a period length there's no unit to count in, so a single
  // row is the most that can ever be offered.
  const maxPeriodsFromStart = (() => {
    if (!slotForm.periodId) return MAX_PERIODS_PER_ROW
    const idx = availableTeachingPeriods.findIndex((p) => p.id === slotForm.periodId)
    if (idx === -1) return MAX_PERIODS_PER_ROW
    if (!periodLen) return 1
    let end = availableTeachingPeriods[idx].endTime
    for (let i = idx; i < availableTeachingPeriods.length - 1; i++) {
      if (availableTeachingPeriods[i].endTime === availableTeachingPeriods[i + 1].startTime) end = availableTeachingPeriods[i + 1].endTime
      else break
    }
    return Math.max(1, Math.floor(durationMinutes(availableTeachingPeriods[idx].startTime, end) / periodLen))
  })()
  const exceedsStructureMessage = (slotForm.mode === 'subject' && !WEEKEND_DAYS.has(slotForm.dayOfWeek) && slotForm.periodId && slotForm.numPeriods > maxPeriodsFromStart)
    ? `${tr('Only')} ${maxPeriodsFromStart} ${maxPeriodsFromStart === 1 ? tr('period is') : tr('periods are')} ${tr('defined from this start — add more in "Set Up Periods" first.')}`
    : ''

  // Live clash check, for every school type: who already holds this exact time on this
  // day. Checked in two steps, since they're two different scarce resources —
  // 1) the CURRENT teacher's own other slots first: nobody, not even them, can be in two
  //    places at once, whatever class or label the other slot is under.
  // 2) then any OTHER teacher already running the SAME class then (a class of students
  //    can't be in two lessons at once) — which is why this gates the Period picker, not
  //    the Course one: whichever course gets picked next is free to be any of them.
  // One function so the period dropdown and the live banner below can never drift apart.
  const slotClash = (start: string, end: string): { self: boolean; teacherLabel: string; startTime: string; endTime: string } | undefined => {
    const selfClash = slots.find((o) =>
      o.id !== editingSlotId && o.dayOfWeek === slotForm.dayOfWeek && timesOverlap(start, end, o.startTime, o.endTime)
    )
    if (selfClash) return { self: true, teacherLabel: tr('the current teacher'), startTime: selfClash.startTime, endTime: selfClash.endTime }
    if (!activeTeacher || !effectiveClassLevel) return undefined
    const otherClash = schoolSlots.find((o) =>
      o.teacherId !== activeTeacher.id && o.classLevel === effectiveClassLevel &&
      o.dayOfWeek === slotForm.dayOfWeek && timesOverlap(start, end, o.startTime, o.endTime)
    )
    return otherClash ? { self: false, teacherLabel: otherClash.teacherName, startTime: otherClash.startTime, endTime: otherClash.endTime } : undefined
  }

  const periodConflict = (p: TimetablePeriod) => slotClash(p.startTime, p.endTime)

  // Same check against whatever period is actually selected right now — a
  // fallback safety net (e.g. editing a slot whose class just changed), since
  // the Period picker above should normally have already kept this from
  // happening by disabling the option in the first place.
  const modalConflict = (slotForm.mode === 'subject' && slotForm.startTime && slotForm.endTime)
    ? slotClash(slotForm.startTime, slotForm.endTime)
    : undefined
  const modalConflictMessage = modalConflict
    ? modalConflict.self
      ? `${tr('This period is already taken by the current teacher')} (${modalConflict.startTime}-${modalConflict.endTime}).`
      : `${tr('This period is already taken')} — ${modalConflict.teacherLabel} ${tr('is already teaching')} ${effectiveClassLevel} ${tr('on')} ${tr(dayLabel(slotForm.dayOfWeek))} ${tr('at')} ${modalConflict.startTime}-${modalConflict.endTime}`
    : ''

  // A slot already on the grid keeps its own course selectable even when that course is out
  // of scope now — a timetable built under the old "any course in the department" rule can
  // hold a course since unassigned, or one from a past semester, and opening such a slot
  // just to change its room must not silently blank its course. Only what can be picked
  // NEW is restricted.
  const editingSlot = editingSlotId ? slots.find((s) => s.id === editingSlotId) : undefined
  const existingSlotCourse = editingSlot?.subjectId && !activeAssignableSubjects.some((s) => s.id === editingSlot.subjectId)
    ? { value: editingSlot.subjectId, label: `${editingSlot.subjectName ?? tr('Current course')} (${tr('already scheduled')})` }
    : undefined
  const slotSubjectOptions = [
    ...activeAssignableSubjects
      .filter((s) => s.classLevel === effectiveClassLevel)
      .map((s) => ({ value: s.id, label: s.name })),
    ...(existingSlotCourse ? [existingSlotCourse] : []),
  ]

  const isWeekendDay = WEEKEND_DAYS.has(slotForm.dayOfWeek)
  // Saturday/Sunday classes don't necessarily follow the school's period grid, so subject
  // slots on those days use free start/end time inputs instead of the period picker.
  const useFreeSubjectTime = slotForm.mode === 'subject' && isWeekendDay

  // A class must never run across a break — a double period that reaches into the break is
  // really two blocks either side of it, and counting the break as teaching time would
  // inflate both the hours total and any absence logged against it. Private/extra classes
  // are exempt (they're off-grid by nature, which is the whole point of them), as are
  // weekend classes, which already don't follow the period grid.
  const breakCrossed = (slotForm.mode === 'subject' && !isWeekendDay && slotForm.startTime && slotForm.endTime)
    ? breakPeriods.find((b) => timesOverlap(slotForm.startTime, slotForm.endTime, b.startTime, b.endTime))
    : undefined
  const breakCrossedMessage = breakCrossed
    ? `${tr('A class cannot run across the break at')} ${breakCrossed.startTime}–${breakCrossed.endTime}. ${tr('Use fewer periods, or start after the break.')}`
    : ''

  const openTeacher = async (teacher: Teacher) => {
    setActiveTeacher(teacher)
    setSlotsLoading(true)
    // Their own course assignments, fetched here rather than up front: the school-wide list
    // is no longer used at all, and only the open teacher's matters. Cleared first so the
    // previous teacher's courses can't be offered during the fetch.
    setTeacherSubjects([])
    setTeacherSubjectsLoading(true)
    getTeacherSubjectsApi(teacher.id)
      .then(({ subjects }) => setTeacherSubjects(subjects))
      .catch(() => showToast(tr('Failed to load this teacher\'s courses'), 'error'))
      .finally(() => setTeacherSubjectsLoading(false))
    try {
      const { slots: fetched } = await getTeacherTimetableApi(teacher.id)
      setSlots(fetched.map((s: TimetableSlot) => ({
        id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
        subjectId: s.subjectId ?? null, label: s.label ?? null, room: s.room ?? null,
        subjectName: s.subjectName, classLevel: s.classLevel, specificDate: s.specificDate ?? null,
      })))
    } catch {
      showToast(tr('Failed to load timetable'), 'error')
    } finally {
      setSlotsLoading(false)
    }
  }

  const closeTeacher = () => { setActiveTeacher(null); setSlots([]); setTeacherSubjects([]) }

  const openHistory = async () => {
    if (!activeTeacher) return
    setShowHistoryModal(true)
    setHistoryLoading(true)
    try {
      const { versions } = await getTimetableHistoryApi(activeTeacher.id)
      setHistoryVersions(versions)
    } catch {
      showToast(tr('Failed to load timetable history'), 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleDeleteHistoryVersion = async () => {
    if (!activeTeacher || !deleteVersionTarget) return
    try {
      await deleteTimetableHistoryVersionApi(activeTeacher.id, deleteVersionTarget)
      setHistoryVersions((prev) => prev.filter((v) => v.archivedAt !== deleteVersionTarget))
      showToast(tr('Timetable version removed'))
    } catch (err) {
      // Surface the API's own reason. The common one is a refusal because absences are
      // recorded against this version — "Failed to remove" alone would leave the admin
      // retrying a delete that is deliberately blocked, with no idea why.
      const e = err as { response?: { data?: { message?: string } } }
      showToast(e.response?.data?.message || tr('Failed to remove timetable version'), 'error')
    } finally {
      setDeleteVersionTarget(null)
    }
  }

  const openAddSlot = () => {
    setEditingSlotId(null)
    setSlotForm(emptySlotForm)
    setSlotError('')
    setShowSlotModal(true)
  }

  const openEditSlot = (slot: EditableSlot) => {
    setEditingSlotId(slot.id)
    // A slot can now span several periods, so match the STARTING period by start time
    // (not start+end), and derive how many periods it covers from its duration.
    const matchingPeriod = teachingPeriods.find((p) => p.startTime === slot.startTime)
    const numPeriods = periodsBetween(slot.startTime, slot.endTime, periodLen) ?? 1
    const cls = slot.classLevel ?? ''
    setSlotForm({
      ...emptySlotForm,
      dayOfWeek: slot.dayOfWeek, periodId: matchingPeriod?.id ?? '', numPeriods, startTime: slot.startTime, endTime: slot.endTime,
      mode: slot.subjectId ? 'subject' : 'private',
      level: isUniversity && cls ? levelGroupOf(cls) : '',
      department: !cls ? '' : isUniversity ? programmeOf(cls) : isSecondary ? (classToDept[cls] ?? '') : '',
      section: isUniversity && cls ? sittingOfClass(cls) : '',
      classLevel: cls, subjectId: slot.subjectId ?? '', label: slot.label ?? '', room: slot.room ?? '',
      recurring: !slot.specificDate, specificDates: slot.specificDate ? [slot.specificDate] : [],
      useWindow: !!(slot.startsOn || slot.endsOn),
      windowFrom: slot.startsOn ?? '', windowTo: slot.endsOn ?? '',
      privateSubjectId: slot.privateSubjectId ?? '',
    })
    setSlotError('')
    setShowSlotModal(true)
  }

  // A class spans `numPeriods` periods from its start period. End time = start + N × the
  // period length, so the class is always a whole number of periods. Without a period
  // length the row's own end time is all there is to go on — the class-time line says so
  // rather than presenting it as a period count.
  const handlePeriodSelect = (periodId: string) => {
    const period = teachingPeriods.find((p) => p.id === periodId)
    const start = period?.startTime ?? ''
    const end = start && periodLen && slotForm.numPeriods >= 1
      ? addMinutes(start, slotForm.numPeriods * periodLen)
      : (period?.endTime ?? '')
    setSlotForm({ ...slotForm, periodId, startTime: start, endTime: end })
  }

  const handleNumPeriodsChange = (n: number) => {
    // n < 1 means the field is mid-edit (empty). Blank the end time rather than computing
    // a zero-length class, so the form can't be submitted in that state.
    const end = slotForm.startTime && periodLen ? (n >= 1 ? addMinutes(slotForm.startTime, n * periodLen) : '') : slotForm.endTime
    setSlotForm({ ...slotForm, numPeriods: n, endTime: end })
  }

  const handleSlotSubmit = () => {
    if (slotForm.mode === 'subject' && isUniversity && !slotForm.level) { setSlotError(tr('Please select a level')); return }
    if (slotForm.mode === 'subject' && hasDeptView && !effectiveDepartment) { setSlotError(tr('Please select a department')); return }
    if (slotForm.mode === 'subject' && !effectiveClassLevel) { setSlotError(tr('Please select a class')); return }
    if (slotForm.mode === 'subject' && !useFreeSubjectTime && !slotForm.periodId) { setSlotError(tr('Please select a period')); return }
    if (slotForm.mode === 'subject' && !useFreeSubjectTime && slotForm.numPeriods < 1) { setSlotError(tr('Enter how many periods this class spans')); return }
    if (breakCrossed) { setSlotError(breakCrossedMessage); return }
    if (exceedsStructureMessage) { setSlotError(exceedsStructureMessage); return }
    if (!slotForm.startTime || !slotForm.endTime) { setSlotError(tr('Start and end time are required')); return }
    if (slotForm.endTime <= slotForm.startTime) { setSlotError(tr('End time must be after start time')); return }
    if (slotForm.mode === 'subject' && !slotForm.subjectId) { setSlotError(tr('Please select a subject')); return }
    if (slotForm.mode === 'subject' && modalConflict) { setSlotError(modalConflictMessage); return }
    if (slotForm.mode === 'private' && !slotForm.label.trim()) { setSlotError(tr('Please enter a label')); return }
    if (slotForm.mode === 'private' && slotForm.recurring && slotForm.useWindow) {
      if (!slotForm.windowFrom || !slotForm.windowTo) { setSlotError(tr('Choose the dates the class runs between')); return }
      // A backwards window produces zero hours, which reads as "it never ran".
      if (slotForm.windowFrom > slotForm.windowTo) { setSlotError(tr('The end date is before the start date')); return }
      // A window that started earlier is fine — that class is still running. One that has
      // already finished can never run again.
      if (slotForm.windowTo < todayStr) { setSlotError(tr('That class finishes in the past. Pick an end date of today or later.')); return }
    }

    // One-off private slot(s): one EditableSlot per chosen date, all sharing this same
    // time/label/room — adding creates all of them at once, editing only ever has one.
    if (slotForm.mode === 'private' && !slotForm.recurring) {
      if (slotForm.specificDates.length === 0) { setSlotError(tr('Add at least one date')); return }
      // `min` on the input is only a hint — a typed or pasted date walks straight past it.
      if (slotForm.specificDates.some((d) => d < todayStr)) { setSlotError(tr('That date has already passed. Pick today or a later date.')); return }
      const candidates: EditableSlot[] = slotForm.specificDates.map((date, i) => ({
        id: editingSlotId && slotForm.specificDates.length === 1 ? editingSlotId : `new-${Date.now()}-${i}`,
        dayOfWeek: dayOfWeekForDate(date),
        startTime: slotForm.startTime, endTime: slotForm.endTime,
        subjectId: null, label: slotForm.label.trim(), room: slotForm.room.trim() || null,
        specificDate: date,
        privateSubjectId: slotForm.privateSubjectId || null,
      }))
      const others = editingSlotId ? slots.filter((s) => s.id !== editingSlotId) : slots
      for (const c of candidates) {
        if (others.some((o) => slotsOverlap(o, c))) { setSlotError(tr('This overlaps with another slot on the same day')); return }
      }
      setSlots((prev) => [...(editingSlotId ? prev.filter((s) => s.id !== editingSlotId) : prev), ...candidates])
      setShowSlotModal(false)
      return
    }

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
      specificDate: null,
      // Only a private class can be time-boxed or tied to a course this way; a school
      // period runs the whole term and already has subjectId.
      startsOn: slotForm.mode === 'private' && slotForm.useWindow ? (slotForm.windowFrom || null) : null,
      endsOn: slotForm.mode === 'private' && slotForm.useWindow ? (slotForm.windowTo || null) : null,
      privateSubjectId: slotForm.mode === 'private' ? (slotForm.privateSubjectId || null) : null,
    }
    const overlap = slots.some((s) => s.id !== next.id && slotsOverlap(s, next))
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
      await saveTimetableApi(activeTeacher.id, slots.map(({ dayOfWeek, startTime, endTime, subjectId, label, room, specificDate, startsOn, endsOn, privateSubjectId }) => ({
        dayOfWeek, startTime, endTime, subjectId, label, room,
        specificDate: specificDate ?? null, startsOn: startsOn ?? null, endsOn: endsOn ?? null,
        privateSubjectId: privateSubjectId ?? null,
      })))
      // Scheduling never moves a course between lecturers any more (that happens on the
      // Teachers page), so there's no reassignment to report and no derived department to
      // refresh — this only ever arranges courses the teacher already holds.
      showToast(tr('Timetable saved'))
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
    subtitle: s.subjectId ? s.classLevel : [s.room, s.specificDate ? formatOneOffDate(s.specificDate) : null].filter(Boolean).join(' · ') || null,
    isPrivate: !s.subjectId,
    isOneOff: !!s.specificDate,
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
              <button onClick={() => { setPeriodsSitting('DAY'); resetPendingPeriodRow(periods.filter((p) => p.programme === 'DAY')); setShowPeriodsModal(true) }}
                className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-hover transition flex-shrink-0">
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
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teacherPageItems.map((t) => (
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
                <div className="mt-3">
                  <Pagination page={teacherPage} totalPages={teacherTotalPages} total={filteredTeachers.length} pageSize={TEACHER_COLS * TEACHER_ROWS_PER_PAGE} onPage={setTeacherPage} />
                </div>
              </>
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
                <button onClick={openHistory}
                  className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-hover transition">
                  <Clock size={15} /> {tr('History')}
                </button>
                <button onClick={openAddSlot} disabled={teachingPeriods.length === 0}
                  title={teachingPeriods.length === 0 ? tr('Set up your period structure first ("Set Up Periods")') : undefined}
                  className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-hover transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                  <Plus size={16} /> {tr('Add Slot')}
                </button>
                <button onClick={handleSaveTimetable} disabled={saving}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                  {saving ? tr('Saving...') : tr('Save Timetable')}
                </button>
              </div>
            </div>

            {teachingPeriods.length === 0 && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-sm text-amber-800">{tr("This school hasn't set up its period structure yet — slots can't be added until it is.")}</p>
                <button onClick={() => { setPeriodsSitting('DAY'); resetPendingPeriodRow(periods.filter((p) => p.programme === 'DAY')); setShowPeriodsModal(true) }}
                  className="flex items-center gap-2 border border-amber-300 bg-white text-amber-900 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition flex-shrink-0">
                  <Clock size={14} /> {tr('Set Up Periods')}
                </button>
              </div>
            )}

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
                {/* One-off private slots derive their day from the date(s) picked below —
                    asking for a day here too would just be a second, contradictable
                    answer to the same question. */}
                {!(slotForm.mode === 'private' && !slotForm.recurring) && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{tr('Day')}</label>
                    <select value={slotForm.dayOfWeek} onChange={(e) => setSlotForm({ ...slotForm, dayOfWeek: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                      {DAYS.map((d) => <option key={d} value={d}>{tr(dayLabel(d))}</option>)}
                    </select>
                  </div>
                )}
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
                    {/* Nothing to schedule: every picker below is derived from this teacher's
                        own assignments, so with none in the current period they'd all sit
                        empty with no clue why. Say where the courses come from instead. */}
                    {!teacherSubjectsLoading && activeAssignableSubjects.length === 0 && (
                      <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 rounded-lg">
                        <p className="text-xs text-sky-900 dark:text-sky-200">
                          {activeTeacher?.name} {tr(isUniversity ? 'has no courses assigned for' : 'has no subjects assigned for')}{' '}
                          <span className="font-semibold">{currentTerm ? currentTerm.name : tr('the current period')}</span>
                          {currentTerm && !isUniversity ? ` (${currentTerm.session})` : ''}.{' '}
                          {tr(isUniversity
                            ? 'Assign their courses on the Teachers page first, then come back to schedule them. You can still add a Private Class here.'
                            : 'Assign their subjects on the Teachers page first, then come back to schedule them. You can still add a Private Class here.')}
                        </p>
                      </div>
                    )}
                    {isUniversity && (
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('Level')} <span className="text-destructive">*</span></label>
                        <CustomSelect
                          value={slotForm.level}
                          onChange={(v) => setSlotForm({ ...slotForm, level: v, department: '', section: '', classLevel: '', periodId: '', startTime: '', endTime: '', subjectId: '' })}
                          options={slotLevelOptions}
                          placeholder={tr('Select a level...')}
                        />
                      </div>
                    )}
                    {hasDeptView && (!isUniversity || slotForm.level) && (
                      slotDeptOptions.length > 1 ? (
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">{tr('Department')} <span className="text-destructive">*</span></label>
                          <CustomSelect
                            value={slotForm.department}
                            onChange={(v) => setSlotForm({ ...slotForm, department: v, section: '', periodId: '', startTime: '', endTime: '', subjectId: '' })}
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
                    {isUniversity && effectiveDepartment && (
                      slotSectionOptions.length > 1 ? (
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">{tr('Section')} <span className="text-destructive">*</span></label>
                          <CustomSelect
                            value={slotForm.section}
                            onChange={(v) => setSlotForm({ ...slotForm, section: v as Programme, periodId: '', startTime: '', endTime: '', subjectId: '' })}
                            options={slotSectionOptions}
                            placeholder={tr('Select a section...')}
                          />
                        </div>
                      ) : slotSectionOptions.length === 1 ? (
                        // Only one sitting to choose from — nothing to actually ask, same
                        // pattern as Department just above.
                        <p className="text-xs text-muted-foreground">
                          {tr('Section')}: <span className="font-medium text-foreground">{slotSectionOptions[0].label}</span>
                        </p>
                      ) : null
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
                    {useFreeSubjectTime ? (
                      // Weekend classes don't necessarily follow the weekday period grid,
                      // so Saturday/Sunday subject slots get free start/end times instead.
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">{tr('Start Time')} <span className="text-destructive">*</span></label>
                          <TimeInput value={slotForm.startTime} onChange={(v) => setSlotForm({ ...slotForm, startTime: v })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">{tr('End Time')} <span className="text-destructive">*</span></label>
                          <TimeInput value={slotForm.endTime} onChange={(v) => setSlotForm({ ...slotForm, endTime: v })} />
                        </div>
                      </div>
                    ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('Starts at period')} <span className="text-destructive">*</span></label>
                        <select value={slotForm.periodId} onChange={(e) => handlePeriodSelect(e.target.value)}
                          disabled={!effectiveClassLevel}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed">
                          <option value="">{tr(effectiveClassLevel ? 'Select...' : 'Select a class first')}</option>
                          {availableTeachingPeriods.map((p) => {
                            const clash = periodConflict(p)
                            return (
                              <option key={p.id} value={p.id} disabled={!!clash}>
                                {p.startTime}{clash ? ` (${tr('taken by')} ${clash.teacherLabel})` : ''}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div>
                        {/* A class is measured in whole periods; the end time is derived. Typed
                            rather than picked from a list, so a long block isn't capped by
                            whatever maximum the dropdown happened to offer. */}
                        <label className="block text-xs font-medium text-foreground mb-1">{tr('Periods')} <span className="text-destructive">*</span></label>
                        <input
                          type="number" min={1} max={maxPeriodsFromStart} placeholder="1"
                          value={slotForm.numPeriods || ''}
                          onChange={(e) => handleNumPeriodsChange(Math.min(parsePeriodCount(e.target.value), maxPeriodsFromStart))}
                          disabled={!effectiveClassLevel || !periodLen}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      {teachingPeriods.length === 0 ? (
                        <p className="col-span-3 text-xs text-muted-foreground">{tr("This school hasn't set up its period structure yet — use \"Set Up Periods\" first.")}</p>
                      ) : availableTeachingPeriods.length === 0 ? (
                        // Periods exist, just none open to this class's section — distinct from
                        // the message above so the fix is "tag one for this section" rather
                        // than "set up periods from scratch".
                        <p className="col-span-3 text-xs text-muted-foreground">
                          {tr('No periods are open to the')} {tr(effectiveClassLevel && sittingOfClass(effectiveClassLevel) === 'EVENING' ? 'Evening' : 'Day')} {tr('section yet — use "Set Up Periods" to tag one.')}
                        </p>
                      ) : slotForm.startTime && slotForm.endTime ? (
                        <div className="col-span-3 space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {tr('Class time')}: <span className="font-semibold text-foreground">{slotForm.startTime} – {slotForm.endTime}</span>{' '}
                            {(() => {
                              // Counted from the times themselves. A slot saved before the school
                              // set its period length keeps its own end time, and saying "1 period"
                              // for a 100-minute class would be a plain lie about the schedule.
                              const n = periodsBetween(slotForm.startTime, slotForm.endTime, periodLen)
                              if (n == null) return <span className="text-destructive">({tr('minutes per period not set yet')})</span>
                              return `(${n} ${n === 1 ? tr('period') : tr('periods')})`
                            })()}
                          </p>
                          {breakCrossedMessage && <p className="text-xs text-destructive">{breakCrossedMessage}</p>}
                          {exceedsStructureMessage && <p className="text-xs text-destructive">{exceedsStructureMessage}</p>}
                        </div>
                      ) : null}
                    </div>
                    )}
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
                    {/* How long the class runs. Three shapes, one of them at a time:
                        the whole term, a window inside it, or specific days. */}
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => setSlotForm({ ...slotForm, recurring: true, useWindow: false, specificDates: [] })}
                        className={`py-1.5 rounded-lg text-xs font-semibold border transition ${slotForm.recurring && !slotForm.useWindow ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                        {isUniversity ? tr('All semester') : tr('All year')}
                      </button>
                      <button type="button" onClick={() => setSlotForm({ ...slotForm, recurring: true, useWindow: true, specificDates: [] })}
                        className={`py-1.5 rounded-lg text-xs font-semibold border transition ${slotForm.recurring && slotForm.useWindow ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                        {tr('For a period')}
                      </button>
                      <button type="button" onClick={() => setSlotForm({ ...slotForm, recurring: false, useWindow: false, specificDates: editingSlotId && slotForm.specificDates.length ? slotForm.specificDates : [] })}
                        className={`py-1.5 rounded-lg text-xs font-semibold border transition ${!slotForm.recurring ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary'}`}>
                        {tr('One-off date(s)')}
                      </button>
                    </div>

                    {slotForm.recurring && slotForm.useWindow && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">{tr('From')} <span className="text-destructive">*</span></label>
                          <input type="date" min={todayStr} value={slotForm.windowFrom}
                            onChange={(e) => setSlotForm({ ...slotForm, windowFrom: e.target.value })}
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">{tr('To')} <span className="text-destructive">*</span></label>
                          <input type="date" min={slotForm.windowFrom || todayStr} value={slotForm.windowTo}
                            onChange={(e) => setSlotForm({ ...slotForm, windowTo: e.target.value })}
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                        <p className="col-span-2 text-xs text-muted-foreground">
                          {tr('It runs on this weekday only between these dates. Anything outside the term is ignored.')}
                        </p>
                      </div>
                    )}

                    {/* Optional: which course these hours count toward. Left blank the class
                        still happens, it just does not land on any course's coverage. */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        {tr('Counts toward')} <span className="text-muted-foreground font-normal">({tr('optional')})</span>
                      </label>
                      <CustomSelect
                        value={slotForm.privateSubjectId}
                        onChange={(v) => setSlotForm({ ...slotForm, privateSubjectId: v })}
                        placeholder={tr('No course — just a private class')}
                        options={[
                          { value: '', label: tr('No course — just a private class') },
                          ...activeAssignableSubjects.map((sub) => ({ value: sub.id, label: `${sub.name} · ${stripProgrammeSuffix(sub.classLevel)}` })),
                        ]}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {tr('Its hours are added to that course\'s taught hours. The required hours target does not change.')}
                      </p>
                    </div>
                    {!slotForm.recurring && (
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          {editingSlotId ? tr('Date') : tr('Dates')} <span className="text-destructive">*</span>
                        </label>
                        {editingSlotId ? (
                          <input type="date" min={todayStr} value={slotForm.specificDates[0] ?? ''}
                            onChange={(e) => setSlotForm({ ...slotForm, specificDates: e.target.value ? [e.target.value] : [] })}
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <input type="date" min={todayStr} value={slotForm.dateInput}
                                onChange={(e) => setSlotForm({ ...slotForm, dateInput: e.target.value })}
                                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                              <button type="button"
                                onClick={() => {
                                  if (!slotForm.dateInput || slotForm.specificDates.includes(slotForm.dateInput)) return
                                  setSlotForm({ ...slotForm, specificDates: [...slotForm.specificDates, slotForm.dateInput].sort(), dateInput: '' })
                                }}
                                className="px-3 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-hover transition">
                                {tr('Add')}
                              </button>
                            </div>
                            {slotForm.specificDates.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {slotForm.specificDates.map((date) => (
                                  <span key={date} className="flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-800 text-xs px-2 py-1 rounded-full">
                                    {formatOneOffDate(date)}
                                    <button type="button" onClick={() => setSlotForm({ ...slotForm, specificDates: slotForm.specificDates.filter((d) => d !== date) })}
                                      className="hover:text-amber-950"><X size={11} /></button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
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
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">
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

        {/* Timetable History Modal — every past version of this teacher's schedule,
            kept purely for reference (hours/coverage math only ever looks at the
            CURRENT timetable, never these). The admin can permanently purge one. */}
        {showHistoryModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-foreground text-lg">{tr('Previous Timetables')}</h3>
                <button onClick={() => setShowHistoryModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {tr('Older versions of this timetable, kept for reference. Hours already counted are not affected by these.')}
              </p>
              {historyLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">{tr('Loading...')}</div>
              ) : historyVersions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">{tr('No previous timetables yet — this schedule has never been changed.')}</div>
              ) : (
                <div className="space-y-4">
                  {historyVersions.map((v) => (
                    <div key={v.archivedAt} className="border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-foreground">
                          {tr('Replaced on')} {new Date(v.archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <button onClick={() => setDeleteVersionTarget(v.archivedAt)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded transition"><Trash2 size={13} /></button>
                      </div>
                      <div className="space-y-1">
                        {v.slots.map((s) => (
                          <p key={s.id} className="text-xs text-muted-foreground">
                            {tr(dayLabel(s.dayOfWeek))} {s.startTime}–{s.endTime} · {s.subjectId ? `${s.subjectName} (${s.classLevel})` : s.label}
                            {s.specificDate ? ` · ${formatOneOffDate(s.specificDate)}` : ''}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowHistoryModal(false)}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">
                  {tr('Close')}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!deleteVersionTarget}
          title={tr('Remove Timetable Version')}
          message={tr('Permanently delete this previous timetable? This cannot be undone.')}
          confirmLabel={tr('Remove')}
          confirmColor="red"
          onConfirm={handleDeleteHistoryVersion}
          onCancel={() => setDeleteVersionTarget(null)}
        />

        {/* Period Structure Modal */}
        {showPeriodsModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-foreground text-lg">{tr('Period Structure')}</h3>
                <button onClick={() => setShowPeriodsModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {isUniversity
                  ? tr('Day and Evening each have their own bell schedule — every teacher’s timetable picks periods from their own sitting’s list.')
                  : tr("Define the school's daily bell schedule once — every teacher's timetable picks periods from this same list.")}
              </p>

              {/* Only universities have an Evening sitting — every other school type stays
                  exactly as before, one plain list, no tabs. */}
              {isUniversity && (
                <div className="flex gap-2 mb-4">
                  {(['DAY', 'EVENING'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => switchPeriodsSitting(s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                        periodsSitting === s ? 'bg-primary text-white border-primary' : 'border-border text-foreground hover:bg-hover'
                      }`}>
                      {tr(s === 'DAY' ? 'Day' : 'Evening')}
                    </button>
                  ))}
                </div>
              )}

              {periodError && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{periodError}</div>}

              {/* Minutes per period is the foundation — every teaching period of THIS
                  sitting is exactly this long, and a class is measured in whole periods.
                  Set it before adding rows. Day and Evening each keep their own value. */}
              <div key={`${periodsSitting}-${minutesShakeKey}`} className={`mb-4 p-3 bg-muted/50 border rounded-lg ${minutesShakeKey > 0 ? 'animate-shake' : ''} ${minutesShakeKey > 0 && !periodLen ? 'border-destructive/40' : 'border-border'}`}>
                <label className="block text-xs font-medium text-foreground mb-1">
                  {tr('Minutes per period')}{isUniversity ? ` (${tr(periodsSitting === 'EVENING' ? 'Evening' : 'Day')})` : ''} <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} placeholder="50"
                    value={periodsSitting === 'EVENING' ? eveningPeriodMinutes : dayPeriodMinutes}
                    onChange={(e) => periodsSitting === 'EVENING' ? setEveningPeriodMinutes(e.target.value) : setDayPeriodMinutes(e.target.value)}
                    className="w-24 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">{tr('minutes — one teaching period. Breaks can be any length.')}</span>
                </div>
              </div>

              {sittingPeriods.length > 0 && (
                <div className="mb-4 border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {sittingPeriods.map((p) => {
                    const rowPeriods = p.isBreak ? null : periodsBetween(p.startTime, p.endTime, periodLen)
                    const rowBroken = !p.isBreak && !isWholePeriods(p.startTime, p.endTime, periodLen)
                    return (
                    <div key={p.id} className={`flex items-center justify-between px-3 py-2 ${editingPeriodId === p.id ? 'bg-primary/5' : rowBroken ? 'bg-destructive/5' : 'bg-card'}`}>
                      <span className="text-sm text-foreground">{p.startTime} – {p.endTime}</span>
                      <div className="flex items-center gap-2">
                        {/* Each row states its own length in periods, so a mixed grid (a double
                            period followed by a single) reads correctly at a glance, and a row
                            left over from before the period length was set is visibly broken
                            here rather than only when the save fails. */}
                        {rowBroken ? (
                          <span className="text-[10px] font-semibold text-destructive">{durationMinutes(p.startTime, p.endTime)} {tr('min, not whole periods')}</span>
                        ) : rowPeriods != null ? (
                          <span className="text-[10px] font-medium text-muted-foreground">{rowPeriods} {rowPeriods === 1 ? tr('period') : tr('periods')}</span>
                        ) : null}
                        {p.isBreak && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{tr('Break')}</span>}
                        <button onClick={() => startEditPeriod(p)} className="text-muted-foreground hover:text-primary p-1 rounded transition"><Pencil size={13} /></button>
                        <button onClick={() => removePeriodRow(p.id)} className="text-muted-foreground hover:text-destructive p-1 rounded transition"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}

              <div className="border border-border rounded-lg p-3 space-y-2">
                {editingPeriodId && (
                  <p className="text-xs font-medium text-primary">{tr('Editing period')} — {tr('update the fields below')}</p>
                )}
                <div className={`grid gap-2 ${!periodForm.isBreak ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{tr('Start Time')}</label>
                    <TimeInput value={periodForm.startTime} onChange={(v) => setPeriodForm({ ...periodForm, startTime: v })} />
                  </div>
                  {/* How many periods this ONE row spans — 2 makes a single combined
                      "double period" block, not two separate rows. Want two separate
                      rows instead? Add each one manually. */}
                  {!periodForm.isBreak && (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">{tr('Length (periods)')}</label>
                      <input
                        type="number" min={1} max={MAX_PERIODS_PER_ROW} placeholder="1"
                        value={periodForm.numPeriods || ''}
                        onChange={(e) => setPeriodForm({ ...periodForm, numPeriods: parsePeriodCount(e.target.value) })}
                        disabled={!periodLen}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">{tr('End Time')}</label>
                    {periodForm.isBreak ? (
                      <TimeInput value={periodForm.endTime} onChange={(v) => setPeriodForm({ ...periodForm, endTime: v })} />
                    ) : (
                      // A teaching period's end is fixed by the period length times how
                      // many periods long this row is — shown, not editable.
                      <div className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground">
                        {periodForm.startTime && periodLen ? addMinutes(periodForm.startTime, periodLen * periodForm.numPeriods) : tr('auto')}
                      </div>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={periodForm.isBreak} onChange={(e) => setPeriodForm({ ...periodForm, isBreak: e.target.checked, endTime: '', numPeriods: 1 })} />
                  {tr('This is a break (not a teaching period)')}
                </label>
                <div className="flex gap-2">
                  {editingPeriodId && (
                    <button onClick={cancelEditPeriod}
                      className="border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-hover transition">
                      {tr('Cancel')}
                    </button>
                  )}
                  <button onClick={submitPeriodRow}
                    className="flex-1 flex items-center justify-center gap-2 border border-border text-foreground py-2 rounded-lg text-sm font-medium hover:bg-hover transition">
                    {editingPeriodId ? tr('Save Changes') : <><Plus size={14} /> {tr('Add')}</>}
                  </button>
                </div>
                {minutesShakeKey > 0 && !periodLen && (
                  <p className="text-xs text-destructive">{tr('Set the minutes per period above first')}</p>
                )}
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowPeriodsModal(false)}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">
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
