'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  getClassOverviewApi, getReportCardApi, createReportCardApi,
  saveEntriesWithSeqApi, setPastTermGrantApi,
} from '@/lib/api/reportcards'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getGradingScaleApi, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { gradeFromScore, isFailingMark } from '@/lib/grading'
import { seqShort, seqFull } from '@/lib/sequences'
import { ArrowLeft, Save, Copy, AlertTriangle } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { onRealtimeDebounced } from '@/lib/socket'
import { useAuthStore } from '@/lib/store/auth.store'
import { getMeApi } from '@/lib/api/auth'
import { useT, useLang } from '@/lib/i18n'

// University marking split: CA is out of 30, the exam out of 70, the course out of 100.
// The same numbers the column headers below print.
const EXAM_MAX = 70
const COURSE_MAX = 100

interface Row {
  studentId: string
  name: string
  studentIdCode: string
  reportCardId: string | null
  score: string
  otherSeqScore: number | null
  /** Not editable, for ANY reason (published, or not eligible for this resit). */
  isLocked: boolean
  /** Locked specifically because the report card is published — the only case an admin
   *  can unlock. Kept apart from isLocked so the banner can't blame publishing for a
   *  row that's simply passed the course. */
  isPublished?: boolean
  resitEligible?: boolean
}

export default function MarksEntryPage() {
  const router = useRouter()
  const params = useParams()
  const { user, school, updateSchool } = useAuthStore()
  const searchParams = useSearchParams()
  const classLevel = decodeURIComponent(String(params.classLevel))
  const subjectId = decodeURIComponent(String(params.subjectId))
  const termId = searchParams.get('termId') ?? ''
  const subjectName = decodeURIComponent(searchParams.get('subjectName') ?? '')
  const seqIndex = Number(searchParams.get('sequence') ?? 0)
  const termName = searchParams.get('termName') ?? ''
  const lang = useLang()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  // True when the signed-in user isn't who this school's policy lets record marks: a
  // teacher when the school routes entry through the administration, or an admin
  // anywhere except the one arrangement built for them (university + ADMIN_ONLY) — an
  // admin has no standing to enter marks themselves otherwise. An older cached session
  // with no mode reads as TEACHERS, matching the API's permissive default: the API is
  // the real gate, so guessing wrong here only costs a pointless 403 rather than letting
  // anything through.
  const adminOnlyMarks = isAdminRole
    ? !(isUniversity && school?.marksEntryMode === 'ADMIN_ONLY')
    : school?.marksEntryMode === 'ADMIN_ONLY'
  // Under ADMIN_ONLY, a university teacher may still record the CA themselves — only the
  // Exam and Resit stay the administration's. The CA tab (seqIndex 0) is the one exception
  // to the lock below; Exam/Resit stay locked exactly as before. Admins are never in this
  // branch: adminOnlyMarks already means something different for them (see above).
  const caExemptForTeacher = !isAdminRole && isUniversity && seqIndex === 0 && adminOnlyMarks
  const isResit = isUniversity && seqIndex === 2
  const seqLabel    = isUniversity ? (seqIndex === 0 ? 'CA' : seqIndex === 1 ? 'Exam' : 'Resit Exam') : seqFull(termName, seqIndex, lang)
  const otherSeqLabel = isUniversity ? (seqIndex === 0 ? 'Exam' : 'CA') : seqShort(termName, seqIndex === 0 ? 1 : 0, lang)
  const otherSeqFull  = isUniversity ? (seqIndex === 0 ? 'Exam' : 'CA') : seqFull(termName, seqIndex === 0 ? 1 : 0, lang)

  const [rows, setRows] = useState<Row[]>([])
  // Scores exactly as last loaded from the server, keyed by student. `rows` is the EDIT
  // BUFFER, so this is the only way to tell a typed-but-unsaved grid from a clean one.
  // Derived by comparison rather than a flag set in each edit handler, so any future edit
  // path (bulk clear, copy, paste) is covered without remembering to mark it dirty.
  const loadedScoresRef = useRef<Record<string, string>>({})
  // Someone else saved marks for this class while this grid held unsaved edits. We refuse
  // to refetch over the top of typing, so the user is offered the reload instead.
  const [staleFromElsewhere, setStaleFromElsewhere] = useState(false)
  const [maxScore, setMaxScore] = useState(20)
  const effectiveMax = isUniversity ? (seqIndex === 0 ? 30 : 70) : maxScore
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  // Whether this term is still the currently active one, and (if not) whether an admin
  // has unlocked THIS subject for teachers to edit anyway. Defaults to true/false so
  // nothing looks locked while the real values are still loading.
  const [isCurrentTerm, setIsCurrentTerm] = useState(true)
  const [pastTermEditGranted, setPastTermEditGranted] = useState(false)
  const [grantSaving, setGrantSaving] = useState(false)
  // A teacher may only edit a NON-current term if an admin has explicitly granted this
  // exact subject+term. Admins are never subject to this — only a teacher's own standing
  // changes once a term closes. Same rule the API actually enforces in saveEntries.
  const pastTermLockedForTeacher = !isAdminRole && !isCurrentTerm && !pastTermEditGranted

  // ── Spreadsheet state ───────────────────────────────────────────────────────
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [anchorIndex, setAnchorIndex]         = useState<number | null>(null)
  const [editingIndex, setEditingIndex]       = useState<number | null>(null)
  const [editValue, setEditValue]             = useState('')
  const [invalidRows, setInvalidRows]         = useState<Record<string, string>>({})

  const isDraggingRef    = useRef(false)
  const mouseDownTimeRef = useRef(0)          // timestamp of the last mouseDown
  // anchorIndex as a ref so mouseEnter always reads the value set in the SAME mouseDown
  // event — the state update is async and would still hold the previous anchor during drag start
  const anchorIndexRef   = useRef<number | null>(null)
  const editInputRef     = useRef<HTMLInputElement | null>(null)
  const editStartedWithCharRef = useRef(false)   // true when edit began from a keypress (not F2/dbl-click)
  const tableRef       = useRef<HTMLDivElement>(null)
  // Keep a live ref to rows so event handlers never see stale data
  const rowsRef = useRef<Row[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

  // ── Data loading ────────────────────────────────────────────────────────────
  // Ignore a fetch that finishes after a newer one already started — switching CA →
  // Exam → Resit quickly used to fire overlapping requests, and whichever happened to
  // resolve last "won", occasionally leaving a stale sequence's marks on screen.
  const fetchGenerationRef = useRef(0)

  const fetchData = useCallback(async () => {
    const myGeneration = ++fetchGenerationRef.current

    // Refresh school (marksEntryMode in particular) on every load of this screen, not
    // just once per login — a school-wide policy switch made in another session used to
    // never reach an already-open marks sheet, so a teacher kept editing Exam/Resit marks
    // an admin had just locked to ADMIN_ONLY. adminOnlyMarks/caExemptForTeacher below are
    // recomputed from `school` on the next render once this lands (see the dependency
    // array), which is what makes a stale grid self-correct without a re-login.
    getMeApi().then((me) => { if (me.school) updateSchool(me.school) }).catch(() => {})

    const [subjectData, scaleData] = await Promise.all([
      getSubjectsApi(),
      getGradingScaleApi().catch(() => ({ ranges: DEFAULT_RANGES })),
    ])
    const subject = subjectData.subjects.find((s: any) => s.id === subjectId)
    if (subject?.maxScore) setMaxScore(subject.maxScore)
    if (scaleData.ranges.length > 0) setGradingRanges(scaleData.ranges)

    // One request for the whole class — entries come straight off the overview response
    // (it already loads them server-side). This used to fetch every student's report
    // card individually, one request per student, which is what made switching sequence
    // tabs slow, especially on mobile networks (the mobile app's own marks screen was
    // fixed the same way previously; the web grid never was).
    const overview = await getClassOverviewApi(termId, classLevel, subjectId)
    setIsCurrentTerm(overview.isCurrentTerm)
    setPastTermEditGranted(overview.pastTermEditGranted)
    // Computed from THIS fetch's own result, not the outer pastTermLockedForTeacher —
    // that's derived from state which wouldn't be updated yet inside this same closure.
    const freshPastTermLocked = !isAdminRole && !overview.isCurrentTerm && !overview.pastTermEditGranted
    const sorted = [...overview.students].sort((a, b) => a.name.localeCompare(b.name))
    const loaded: Row[] = sorted.map((s) => {
      let score = ''
      let otherSeqScore: number | null = null
      let resitEligible = false
      const entry = s.reportCard?.entries.find((e) => e.subjectId === subjectId)
      if (entry) {
        if (isResit) {
          score = entry.resitScore != null ? String(entry.resitScore) : ''
          // A resit is offered to anyone who FAILED THE COURSE, whatever their exam
          // mark was. Re-sitting only replaces the exam (the CA carries over), so a
          // student who passed the exam but failed the course on a weak CA is exactly
          // who a resit helps: a better exam mark is their only way to lift the total.
          // Requiring a failed exam too locked those students out of their own remedy.
          //
          // Someone who PASSED the course is not offered one: there is nothing to fix.
          //
          // Judged against the ORIGINAL CA+Exam (ignoring any resit already recorded),
          // so a row stays editable after its resit mark is entered. Via the school's
          // own scale, never a hardcoded 'F' or pass mark: CITEC juries grade D as FAIL.
          const ca = entry.seq1Score, exam = entry.seq2Score
          resitEligible = ca != null && exam != null
            && isFailingMark(ca + exam, COURSE_MAX, scaleData.ranges)
        } else {
          score = seqIndex === 0
            ? (entry.seq1Score != null ? String(entry.seq1Score) : '')
            : (entry.seq2Score != null ? String(entry.seq2Score) : '')
          otherSeqScore = seqIndex === 0 ? entry.seq2Score : entry.seq1Score
        }
      }
      const isPublished  = s.reportCard?.status === 'PUBLISHED'
      const grantedToMe  = s.reportCard?.marksEditGrantedTo === user?.id
      // Publishing freezes a card for EVERYONE, the administration included: to change a
      // mark you unpublish it first, which the API enforces too. Publishing is what fixes
      // the class's averages and positions, so a mark moving underneath a published card
      // would silently invalidate the cards already handed out.
      const frozenByPublish = isPublished && !grantedToMe
      // School policy: some universities record marks centrally so a teacher never
      // enters marks for a course they teach. The sheet stays READABLE (they can check
      // their subject); only saving is refused, and the API refuses it too. An admin
      // can still grant one teacher one class without changing the policy. The CA tab
      // is the one exception — see caExemptForTeacher above.
      const marksLockedToAdmin = adminOnlyMarks && !grantedToMe && !caExemptForTeacher
      return {
        studentId: s.id, name: s.name, studentIdCode: s.studentId,
        reportCardId: s.reportCard?.id ?? null,
        score, otherSeqScore,
        isLocked: frozenByPublish || (isResit && !resitEligible) || marksLockedToAdmin || freshPastTermLocked,
        isPublished: frozenByPublish,
        resitEligible,
      }
    })

    if (fetchGenerationRef.current !== myGeneration) return // a newer fetch has since started
    setRows(loaded)
    // Baseline for "does this grid hold unsaved edits" — see isDirty below. Captured from
    // the same rows that were just rendered, so a fresh load always starts clean.
    loadedScoresRef.current = Object.fromEntries(loaded.map((r) => [r.studentId, r.score]))
    setStaleFromElsewhere(false)
    setInvalidRows({})
    setSelectedIndices(new Set())
    setEditingIndex(null)
  }, [termId, classLevel, subjectId, seqIndex, adminOnlyMarks, caExemptForTeacher, isResit, user?.id, updateSchool, isAdminRole])

  // setLoading(true) here matters as much as the initial mount: `fetchData`'s identity
  // also changes when the CA/Exam/Resit tab switches `seqIndex` (see its deps above), and
  // without re-arming loading, the OLD sequence's rows stayed rendered but got re-labeled
  // /re-graded against the NEW sequence's max score (e.g. a CA mark out of 30 briefly
  // graded as an Exam mark out of 70 — a false "FAIL") until the refetch quietly resolved.
  useEffect(() => { setLoading(true); fetchData().finally(() => setLoading(false)) }, [fetchData])

  // Unsaved edits present? Compared against the last load rather than tracked by a flag,
  // so typing a mark and then undoing it correctly reads as clean again.
  const isDirty = rows.some((r) => (loadedScoresRef.current[r.studentId] ?? '') !== r.score)
  // Mirrored into a ref so the realtime subscription below can read the CURRENT value
  // without re-subscribing on every keystroke.
  const isDirtyRef = useRef(false)
  isDirtyRef.current = isDirty

  // Someone else saved marks for this class/subject.
  //
  // This grid is the one screen that must NOT blindly refetch: `rows` is the edit buffer,
  // so refetching over a half-typed column would destroy work with no undo. When the grid
  // is clean there is nothing to lose and it silently refreshes; when it is dirty the user
  // is told and decides. Debounced because the signal arrives once per student.
  //
  // Also fires for the user's OWN save (they are in the school room too). Harmless: by then
  // handleSaveAll has already refetched and the grid is clean, so this is one redundant
  // fetch rather than a surprise.
  useEffect(() => onRealtimeDebounced('marks:changed', () => {
    if (isDirtyRef.current) setStaleFromElsewhere(true)
    else fetchData()
  }), [fetchData])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const rangeSet = (a: number, b: number): Set<number> => {
    const s = new Set<number>()
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    for (let i = lo; i <= hi; i++) s.add(i)
    return s
  }

  const cleanScore = (raw: string) => {
    let v = raw.replace(/[^0-9.]/g, '')
    const dot = v.indexOf('.')
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
    return v
  }

  const clearInvalidForStudent = (studentId: string) =>
    setInvalidRows(prev => { const n = { ...prev }; delete n[studentId]; return n })

  // ── Edit commit / cancel ────────────────────────────────────────────────────
  const commitEdit = () => {
    const idx = editingIndex
    if (idx === null) return
    const row = rowsRef.current[idx]
    if (row && !row.isLocked) {
      const clean = cleanScore(editValue)
      setRows(prev => prev.map(r => r.studentId === row.studentId ? { ...r, score: clean } : r))
      clearInvalidForStudent(row.studentId)
    }
    setEditingIndex(null)
    setEditValue('')
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditValue('')
  }

  const startEditing = (index: number, initialChar = '') => {
    const row = rowsRef.current[index]
    if (!row || row.isLocked) return
    editStartedWithCharRef.current = initialChar !== ''
    setEditingIndex(index)
    // If a char key was pressed, start fresh with that char; else keep existing score
    setEditValue(initialChar !== '' ? initialChar : row.score)
    setSelectedIndices(new Set([index]))
    setAnchorIndex(index)
  }

  // Auto-focus the edit input whenever editing starts.
  // select-all for F2/double-click (replace existing value);
  // cursor-to-end for character-key start (append to the typed char).
  useEffect(() => {
    if (editingIndex !== null) {
      requestAnimationFrame(() => {
        const el = editInputRef.current
        if (!el) return
        el.focus({ preventScroll: true })
        if (editStartedWithCharRef.current) {
          const len = el.value.length
          el.setSelectionRange(len, len)
        } else {
          el.select()
        }
      })
    }
  }, [editingIndex])

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  const handleCellMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault()
    // Commit any active edit on a different cell
    if (editingIndex !== null && editingIndex !== index) commitEdit()
    if (editingIndex === index) return
    isDraggingRef.current  = true
    mouseDownTimeRef.current = Date.now()
    tableRef.current?.focus({ preventScroll: true })
    if (e.shiftKey && anchorIndexRef.current !== null) {
      setSelectedIndices(rangeSet(anchorIndexRef.current, index))
    } else {
      anchorIndexRef.current = index   // sync update — read immediately by mouseEnter
      setAnchorIndex(index)
      setSelectedIndices(new Set([index]))
    }
  }

  const handleCellMouseEnter = (index: number) => {
    if (!isDraggingRef.current || anchorIndexRef.current === null) return
    // Ignore same-cell re-entry and micro-movements during a click gesture.
    // On trackpads the touchpad physically depresses on click, which can send
    // mouseEnter to 3-4 adjacent rows before mouseUp. Treat cross-row movement
    // within 120ms of mouseDown as click wobble, not an intentional drag.
    if (index === anchorIndexRef.current) return
    if (Date.now() - mouseDownTimeRef.current < 120) return
    setSelectedIndices(rangeSet(anchorIndexRef.current, index))
  }

  // Global mouseup to end drag
  useEffect(() => {
    const stop = () => { isDraggingRef.current = false }
    document.addEventListener('mouseup', stop)
    return () => document.removeEventListener('mouseup', stop)
  }, [])

  // ── Keyboard handler (table container) ──────────────────────────────────────
  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (editingIndex !== null) return
    const sorted = [...selectedIndices].sort((a, b) => a - b)
    if (sorted.length === 0) return

    const firstIdx = sorted[0]
    const lastIdx  = sorted[sorted.length - 1]
    const anchor   = anchorIndex ?? firstIdx
    const currentRows = rowsRef.current

    const moveDown = () => {
      const next = Math.min(lastIdx + 1, currentRows.length - 1)
      setAnchorIndex(next); setSelectedIndices(new Set([next]))
    }
    const moveUp = () => {
      const prev = Math.max(firstIdx - 1, 0)
      setAnchorIndex(prev); setSelectedIndices(new Set([prev]))
    }

    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey && e.key === 'ArrowDown') {
        setSelectedIndices(rangeSet(anchor, Math.min(lastIdx + 1, currentRows.length - 1)))
      } else {
        moveDown()
      }
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault()
      if (e.shiftKey && e.key === 'ArrowUp') {
        setSelectedIndices(rangeSet(anchor, Math.max(firstIdx - 1, 0)))
      } else {
        moveUp()
      }
    } else if (e.key === 'F2') {
      e.preventDefault()
      startEditing(firstIdx)
    } else if (e.key === 'Escape') {
      setSelectedIndices(new Set()); setAnchorIndex(null)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      setRows(prev => prev.map((r, i) => selectedIndices.has(i) && !r.isLocked ? { ...r, score: '' } : r))
      setInvalidRows(prev => {
        const n = { ...prev }
        sorted.forEach(i => { if (currentRows[i]) delete n[currentRows[i].studentId] })
        return n
      })
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault()
      const vals = sorted.map(i => currentRows[i]?.score ?? '').join('\n')
      navigator.clipboard.writeText(vals).catch(() => {})
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[0-9.]$/.test(e.key)) {
      e.preventDefault()
      startEditing(firstIdx, e.key === '.' ? '0.' : e.key)
    }
  }

  // ── Paste handler (table container) ─────────────────────────────────────────
  const handleTablePaste = (e: React.ClipboardEvent) => {
    if (editingIndex !== null) return
    e.preventDefault()
    const values = e.clipboardData.getData('text').split(/[\r\n]+/).filter(Boolean)
    const sorted = [...selectedIndices].sort((a, b) => a - b)
    if (!sorted.length || !values.length) return
    const startIdx = sorted[0]
    setRows(prev => {
      const next = [...prev]
      values.forEach((val, offset) => {
        const idx = startIdx + offset
        if (idx >= next.length || next[idx].isLocked) return
        next[idx] = { ...next[idx], score: cleanScore(val.trim()) }
      })
      return next
    })
    const newSel = new Set<number>()
    for (let i = 0; i < values.length && startIdx + i < rows.length; i++) newSel.add(startIdx + i)
    setSelectedIndices(newSel)
    setInvalidRows({})
  }

  // ── Edit input keyboard ─────────────────────────────────────────────────────
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault(); cancelEdit()
      tableRef.current?.focus({ preventScroll: true })
    } else if (e.key === 'Enter' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault(); commitEdit()
      const next = Math.min((editingIndex ?? 0) + 1, rowsRef.current.length - 1)
      setAnchorIndex(next); setSelectedIndices(new Set([next]))
      setTimeout(() => tableRef.current?.focus(), 0)
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault(); commitEdit()
      const prev = Math.max((editingIndex ?? 0) - 1, 0)
      setAnchorIndex(prev); setSelectedIndices(new Set([prev]))
      setTimeout(() => tableRef.current?.focus(), 0)
    }
  }

  // ── Copy-from-other-seq ─────────────────────────────────────────────────────
  // Same lock every individual cell already respects (row.isLocked) — otherwise this
  // was a back door around ADMIN_ONLY: a teacher couldn't type into a locked Exam cell,
  // but could still bulk-fill every row from CA through this button.
  const handleCopyFromOther = () => {
    const hasOther = rows.some(r => !r.isLocked && r.otherSeqScore !== null)
    if (!hasOther) { showToast(`${otherSeqFull} has no marks yet`, 'error'); return }
    const hasCurrent = rows.some(r => !r.isLocked && r.score !== '')
    const doCopy = () => setRows(prev => prev.map(r =>
      !r.isLocked && r.otherSeqScore !== null ? { ...r, score: String(r.otherSeqScore) } : r
    ))
    if (hasCurrent) {
      if (confirm(`This will overwrite current marks with ${otherSeqFull} scores. Continue?`)) doCopy()
    } else doCopy()
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  // Only rows locked BY PUBLISHING — the ones an admin can actually unlock. Counting
  // every locked row here told teachers on the Resit tab that N report cards were
  // published and to go contact their admin, when those rows were simply students who
  // passed the course and were never resit-eligible.
  const publishedCount = rows.filter(r => r.isPublished).length
  const editableRows   = rows.filter(r => !r.isLocked)

  // Admin-only: unlock/lock this exact subject+term for teachers to edit again, once it's
  // no longer current. Contextual here rather than a separate management page — the
  // admin is already looking at exactly the (subject, term) pair this decision is about.
  const handleTogglePastTermGrant = async (granted: boolean) => {
    setGrantSaving(true)
    try {
      const res = await setPastTermGrantApi(subjectId, termId, granted)
      setPastTermEditGranted(res.granted)
    } catch {
      showToast(t('Failed to update access'), 'error')
    } finally {
      setGrantSaving(false)
    }
  }

  const handleSaveAll = async () => {
    if (editingIndex !== null) commitEdit()

    // Validate — no clamping at input time; catch errors here
    const errors: Record<string, string> = {}
    for (const row of editableRows) {
      if (row.score === '') continue
      const num = Number(row.score)
      if (isNaN(num) || !/^\d+(\.\d+)?$/.test(row.score)) {
        errors[row.studentId] = `"${row.score}" is not a valid number`
      } else if (num < 0) {
        errors[row.studentId] = 'Score cannot be negative'
      } else if (num > effectiveMax) {
        errors[row.studentId] = `${num} exceeds max of ${effectiveMax}`
      }
    }
    if (Object.keys(errors).length > 0) {
      setInvalidRows(errors)
      const n = Object.keys(errors).length
      showToast(`${n} invalid mark${n > 1 ? 's' : ''} — fix highlighted rows before saving`, 'error')
      return
    }

    setSaving(true)
    try {
      const updated = await Promise.all(editableRows.map(async (r) => {
        if (!r.reportCardId) {
          const data = await createReportCardApi({ studentId: r.studentId, termId })
          return { ...r, reportCardId: data.reportCard.id }
        }
        return r
      }))
      const rcDetails = await Promise.all(updated.map(r => getReportCardApi(r.reportCardId!)))
      await Promise.all(updated.map((r, i) => {
        const rc = rcDetails[i]
        const allSubjectIds = Array.from(new Set([...rc.entries.map((e: any) => e.subject.id), subjectId]))
        const entries = allSubjectIds.map((sid) => {
          const existing = rc.entries.find((e: any) => e.subject.id === sid) as any
          if (sid === subjectId) {
            const cur = r.score !== '' ? Number(r.score) : null
            return {
              subjectId: sid,
              seq1Score: seqIndex === 0 ? cur : (existing?.seq1Score ?? null),
              seq2Score: seqIndex === 1 ? cur : (existing?.seq2Score ?? null),
              resitScore: isResit ? cur : (existing?.resitScore ?? null),
              remarks: existing?.remarks || '',
            }
          }
          return {
            subjectId: sid,
            seq1Score: existing?.seq1Score ?? undefined,
            seq2Score: existing?.seq2Score ?? undefined,
            resitScore: existing?.resitScore ?? undefined,
            score: existing?.score ?? 0,
            remarks: existing?.remarks || '',
          }
        })
        return saveEntriesWithSeqApi(r.reportCardId!, { entries: entries as any })
      }))
      showToast(t('Marks saved for all students'))
      fetchData()
    } catch {
      showToast(t('Failed to save marks'), 'error')
    } finally { setSaving(false) }
  }

  const filled       = rows.filter(r => r.score !== '').length
  const invalidCount = Object.keys(invalidRows).length
  const getGrade     = (score: number) => gradeFromScore(score, effectiveMax, gradingRanges)

  // Mirrors the real table's structure (header + N rows, same column widths) instead of
  // a plain centered message, so the page doesn't blank out then pop — and it can't be
  // mistaken for actual data, unlike leaving stale rows on screen during a refetch.
  if (loading) return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr style={{ backgroundColor: '#1e3a5f' }}>
              <th className="text-left px-4 py-3 text-xs font-bold text-white w-10 border-r border-white/10">#</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-white border-r border-white/10">{t('STUDENT NAME')}</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-white w-44 border-r border-white/10">{t('MARKS')}</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-white">{t('PERFORMANCE')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                <td className="px-4 py-3 border-r border-border"><div className="h-3 w-4 rounded bg-muted animate-pulse" /></td>
                <td className="px-4 py-3 border-r border-border"><div className="h-3 rounded bg-muted animate-pulse" style={{ width: `${55 + (i % 4) * 10}%` }} /></td>
                <td className="px-4 py-3 border-r border-border flex justify-center"><div className="h-6 w-10 rounded bg-muted animate-pulse" /></td>
                <td className="px-4 py-3 flex justify-center"><div className="h-5 w-16 rounded bg-muted animate-pulse" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>

      {/* Header */}
      <div className="mb-0 pb-4">
        <button onClick={() => router.back()}
          className="p-2 -ml-2 mb-2 text-muted-foreground hover:text-foreground hover:bg-hover rounded-lg transition inline-flex">
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-foreground">{subjectName} · {seqLabel}</h2>
            <p className="text-sm text-muted-foreground">{classLevel}</p>
          </div>

          {/* Switch assessment without leaving the sheet. The sequence has always come from
              the url, so moving from CA to Exam meant navigating back to the class sheet and
              starting again, once per course. Same marks, same students, one click. */}
          <div className="flex items-center gap-1 flex-shrink-0 sm:ml-auto">
            {(isUniversity ? [0, 1, 2] : [0, 1]).map((i) => (
              <button key={i}
                onClick={() => router.replace(`/report-cards/class/${encodeURIComponent(classLevel)}/${encodeURIComponent(subjectId)}?termId=${termId}&termName=${encodeURIComponent(termName)}&subjectName=${encodeURIComponent(subjectName)}&sequence=${i}`)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition ${seqIndex === i
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {isUniversity ? (i === 0 ? t('CA (30)') : i === 1 ? t('Exam (70)') : t('Resit')) : seqShort(termName, i, lang)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between bg-muted border-b border-border px-4 py-2.5">
        <span className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          {classLevel} · <span className="font-semibold text-primary">{seqLabel}</span>
          {isUniversity && termName && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{termName}</span>
          )}
          · {filled}/{rows.length} {t('filled')}
        </span>
        <span className="text-xs text-muted-foreground hidden sm:block">
          Click to select · Drag to select range · Double-click or type to edit · Ctrl+C/V to copy/paste
        </span>
      </div>

      {/* Past-term lock — teacher's view: explains why a non-current term is read-only
          even though nothing here is published. Admin's view: a contextual toggle to
          unlock this exact subject+term, since they're already looking at it. */}
      {!isCurrentTerm && (
        isAdminRole ? (
          <label className="flex items-center gap-3 bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-sm text-sky-700 cursor-pointer">
            <input
              type="checkbox"
              checked={pastTermEditGranted}
              disabled={grantSaving}
              onChange={(e) => handleTogglePastTermGrant(e.target.checked)}
            />
            <span className="flex-1">{t('This term has ended. Allow teachers to edit marks here anyway?')}</span>
            {grantSaving && <span className="text-xs text-sky-500">{t('Saving...')}</span>}
          </label>
        ) : pastTermLockedForTeacher && (
          <div className="flex items-center gap-2 bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-sm text-sky-700">
            🔒 {t("This term is no longer current, so it's locked. Ask an admin to grant you access if you need to fix something here.")}
          </div>
        )
      )}

      {/* Someone else saved marks for this class while this grid holds unsaved edits.
          Offered, never applied automatically: reloading replaces the edit buffer, so
          discarding typed marks has to be the user's decision, not a background event's. */}
      {staleFromElsewhere && (
        <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <span className="flex-1">
            {t('Someone else saved marks for this class. Reload to see them, or finish and save yours first.')}
          </span>
          <button
            onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)) }}
            className="flex-shrink-0 font-semibold text-amber-900 underline hover:no-underline"
          >
            {t('Reload')}
          </button>
        </div>
      )}

      {/* Copy-from-other-seq bar — resit has nothing to copy from, and it's pointless
          (and would look like a back door around ADMIN_ONLY) to show a "fill this in"
          shortcut on a tab this user has no editable rows on at all.

          NOT shown for universities at all. CA and Exam are marked out of different totals
          (effectiveMax: 30 and 70), so one is never a sensible starting point for the other:
          copying CA into Exam silently halves every student, and copying Exam into CA writes
          scores above the CA maximum. Primary/secondary sequences share one maxScore, which
          is the only case where "same marks again" is a meaningful shortcut. */}
      {isResit ? (
        <div className="w-full flex items-center gap-3 bg-sky-50 border-b border-sky-200 px-4 py-3 text-left">
          <span className="flex-1 text-sm text-sky-700">
            {t('Only students who failed the course can resit, and only the exam is re-sat. Enter their new exam mark out of 70 here; their CA stays as it is, so a better exam mark can lift the total.')}
          </span>
        </div>
      ) : editableRows.length > 0 && !isUniversity && (
        <button
          onClick={handleCopyFromOther}
          className="w-full flex items-center gap-3 bg-violet-50 hover:bg-violet-100 border-b border-violet-200 px-4 py-3 transition text-left"
        >
          <Copy size={15} className="text-violet-600 flex-shrink-0" />
          <span className="flex-1 text-sm font-semibold text-violet-600">
            {t('Copy marks from')} {otherSeqLabel} {t('→ fill here')}
          </span>
          <span className="text-violet-400 text-sm">›</span>
        </button>
      )}

      {/* Published banner */}
      {/* Why the sheet is read-only. Without this a teacher meets a dead grid and assumes
          the app is broken, rather than seeing a school policy. Shown above the published
          banner because it explains the whole sheet, not a few rows. */}
      {adminOnlyMarks && (
        <div className="flex items-center gap-2 bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-sm text-sky-700">
          🔒 {isAdminRole
            ? t('Marks are entered by teachers at this school. You can check the marks here, but not change them.')
            : caExemptForTeacher
              ? t('Exam and Resit marks are entered by the administration at this school. You can record CA marks here.')
              : t('Marks are entered by the administration at this school. You can check the marks here, but not change them. Ask an admin if something needs correcting.')}
        </div>
      )}
      {publishedCount > 0 && (
        <div className="flex items-center gap-2 bg-orange-50 border-b border-orange-200 px-4 py-2.5 text-sm text-orange-700">
          🔒 {publishedCount === rows.length
            ? t('All report cards are published')
            : `${publishedCount} ${t('report card(s) are published')}`
          }{' '}
          {/* The remedy depends on who is reading. Telling an admin to "contact your
              admin" is a dead end: unpublishing is theirs to do. */}
          {isAdminRole
            ? t('and those rows are locked. Unpublish a report card to change its marks.')
            : t('and those rows are locked. Ask your admin to unpublish it, or to grant you access.')}
        </div>
      )}

      {/* Validation error banner */}
      {invalidCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 px-4 py-2.5 text-sm text-red-700">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {invalidCount} mark{invalidCount > 1 ? 's' : ''} exceed{invalidCount === 1 ? 's' : ''} the allowed maximum
          ({effectiveMax}). Correct the highlighted rows before saving.
        </div>
      )}

      {/* Spreadsheet table */}
      <div
        ref={tableRef}
        tabIndex={0}
        className="flex-1 bg-card border-x border-border focus:outline-none"
        onKeyDown={handleTableKeyDown}
        onPaste={handleTablePaste}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]" style={{ userSelect: 'none' }}>
            <thead>
              <tr style={{ backgroundColor: '#1e3a5f' }}>
                <th className="text-left px-4 py-3 text-xs font-bold text-white w-10 border-r border-white/10">#</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-white border-r border-white/10">{t('STUDENT NAME')}</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-white w-44 border-r border-white/10">
                  {isUniversity ? (seqIndex === 0 ? 'CA / 30' : seqIndex === 1 ? 'MARKS / 70' : 'RESIT / 70') : `${t('MARKS /')} ${effectiveMax}`}
                </th>
                <th className="text-center px-4 py-3 text-xs font-bold text-white">{t('PERFORMANCE')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => {
                const isSelected = selectedIndices.has(index)
                const isEditing  = editingIndex === index
                const isInvalid  = !!invalidRows[row.studentId]
                const score      = Number(row.score)
                const hasScore   = row.score !== ''
                const gr         = hasScore && !isInvalid ? getGrade(score) : null

                return (
                  <tr
                    key={row.studentId}
                    className={row.isLocked ? 'opacity-60' : index % 2 === 0 ? 'bg-card' : 'bg-muted/30'}
                  >
                    {/* Row number */}
                    <td className="px-4 py-1 text-xs text-muted-foreground font-mono border-r border-border">{index + 1}</td>

                    {/* Student name */}
                    <td className="px-4 py-1 border-r border-border">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{row.name}</p>
                        {row.isLocked && <span className="text-xs text-orange-500">🔒</span>}
                      </div>
                    </td>

                    {/* Score cell — spreadsheet style */}
                    <td
                      className={`px-2 py-1 border-r border-border ${row.isLocked ? 'cursor-not-allowed' : 'cursor-cell'}`}
                      onMouseDown={row.isLocked ? undefined : (e) => handleCellMouseDown(index, e)}
                      onMouseEnter={() => handleCellMouseEnter(index)}
                      onDoubleClick={() => startEditing(index)}
                    >
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleEditKeyDown}
                          className="w-full h-10 text-center text-xl font-bold text-foreground bg-white dark:bg-zinc-900 border-2 border-blue-500 rounded outline-none"
                          style={{ appearance: 'textfield', MozAppearance: 'textfield' } as React.CSSProperties}
                        />
                      ) : (
                        <div
                          className={[
                            'h-10 flex items-center justify-center rounded text-xl font-bold transition-colors border-2',
                            isInvalid
                              ? 'bg-red-50 dark:bg-red-950/30 border-red-500 text-red-600'
                              : isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-500 text-foreground'
                                : 'border-transparent text-foreground',
                          ].join(' ')}
                        >
                          {hasScore
                            ? <><span>{row.score}</span><span className="text-xs font-normal text-muted-foreground ml-0.5">/{effectiveMax}</span></>
                            : <span className="text-muted-foreground/40 text-sm font-normal select-none">—</span>
                          }
                        </div>
                      )}
                    </td>

                    {/* Performance */}
                    <td className="px-4 py-1 text-center">
                      {isInvalid ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded">
                          <AlertTriangle size={10} />
                          {invalidRows[row.studentId]}
                        </span>
                      ) : gr ? (
                        <span
                          className="inline-flex items-center justify-center px-3 py-1 rounded text-xs font-semibold"
                          style={{ backgroundColor: gr.bgColor, color: gr.color }}
                        >
                          {gr.remark || gr.grade}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm font-bold">--</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save button */}
      <div className="border border-border rounded-b-xl overflow-hidden">
        <button
          onClick={handleSaveAll}
          disabled={saving || editableRows.length === 0}
          className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-[#d63429] disabled:opacity-50 text-white py-4 text-base font-bold transition"
        >
          <Save size={18} />
          {saving
            ? t('Saving...')
            : editableRows.length === 0
              // Nothing editable has two causes now, and blaming publishing when the real
              // reason is school policy sends the teacher to argue with the wrong person.
              ? (adminOnlyMarks ? (isAdminRole ? t('Teachers enter marks here') : t('Administration enters marks here')) : t('All Cards Published'))
              : t('Save All Marks')}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
