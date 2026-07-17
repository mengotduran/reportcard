'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  getClassOverviewApi, getReportCardApi, createReportCardApi,
  saveEntriesWithSeqApi,
} from '@/lib/api/reportcards'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getGradingScaleApi, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { gradeFromScore, isFailingMark } from '@/lib/grading'
import { seqShort, seqFull } from '@/lib/sequences'
import { ArrowLeft, Save, Copy, AlertTriangle } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useAuthStore } from '@/lib/store/auth.store'
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
  const { user, school } = useAuthStore()
  const searchParams = useSearchParams()
  const classLevel = decodeURIComponent(String(params.classLevel))
  const subjectId = decodeURIComponent(String(params.subjectId))
  const termId = searchParams.get('termId') ?? ''
  const subjectName = decodeURIComponent(searchParams.get('subjectName') ?? '')
  const seqIndex = Number(searchParams.get('sequence') ?? 0)
  const termName = searchParams.get('termName') ?? ''
  const lang = useLang()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isResit = isUniversity && seqIndex === 2
  const seqLabel    = isUniversity ? (seqIndex === 0 ? 'CA' : seqIndex === 1 ? 'Exam' : 'Resit Exam') : seqFull(termName, seqIndex, lang)
  const otherSeqLabel = isUniversity ? (seqIndex === 0 ? 'Exam' : 'CA') : seqShort(termName, seqIndex === 0 ? 1 : 0, lang)
  const otherSeqFull  = isUniversity ? (seqIndex === 0 ? 'Exam' : 'CA') : seqFull(termName, seqIndex === 0 ? 1 : 0, lang)

  const [rows, setRows] = useState<Row[]>([])
  const [maxScore, setMaxScore] = useState(20)
  const effectiveMax = isUniversity ? (seqIndex === 0 ? 30 : 70) : maxScore
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast, hideToast } = useToast()
  const t = useT()

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
  const fetchData = useCallback(async () => {
    const [subjectData, scaleData] = await Promise.all([
      getSubjectsApi(),
      getGradingScaleApi().catch(() => ({ ranges: DEFAULT_RANGES })),
    ])
    const subject = subjectData.subjects.find((s: any) => s.id === subjectId)
    if (subject?.maxScore) setMaxScore(subject.maxScore)
    if (scaleData.ranges.length > 0) setGradingRanges(scaleData.ranges)

    const overview = await getClassOverviewApi(termId, classLevel)
    const sorted = [...overview.students].sort((a, b) => a.name.localeCompare(b.name))
    const loaded: Row[] = await Promise.all(
      sorted.map(async (s) => {
        let score = ''
        let otherSeqScore: number | null = null
        let resitEligible = false
        if (s.reportCard) {
          try {
            const rc = await getReportCardApi(s.reportCard.id)
            const entry = rc.entries.find((e: any) => e.subject.id === subjectId) as any
            if (entry) {
              if (isResit) {
                score = entry.resitScore != null ? String(entry.resitScore) : ''
                // A resit re-sits the EXAM only (CA carries over), so it's offered when the
                // student failed the exam AND failed the course overall. A poor CA alone is
                // not a resit matter, and someone whose CA already carried them to a pass
                // isn't asked to re-sit anything.
                //
                // Judged against the ORIGINAL CA+Exam (ignoring any resit already recorded),
                // so a row stays editable after its resit mark is entered.
                //
                // Both tests go through the school's own scale rather than a hardcoded 'F' or
                // pass mark: CITEC juries grade D as FAIL, which a grade-letter test misses.
                const ca = entry.seq1Score, exam = entry.seq2Score
                resitEligible = ca != null && exam != null
                  && isFailingMark(exam, EXAM_MAX, scaleData.ranges)
                  && isFailingMark(ca + exam, COURSE_MAX, scaleData.ranges)
              } else {
                score = seqIndex === 0
                  ? (entry.seq1Score != null ? String(entry.seq1Score) : '')
                  : (entry.seq2Score != null ? String(entry.seq2Score) : '')
                otherSeqScore = seqIndex === 0 ? entry.seq2Score : entry.seq1Score
              }
            }
          } catch { /* no entries yet */ }
        }
        const isPublished  = s.reportCard?.status === 'PUBLISHED'
        const grantedToMe  = s.reportCard?.marksEditGrantedTo === user?.id
        return {
          studentId: s.id, name: s.name, studentIdCode: s.studentId,
          reportCardId: s.reportCard?.id ?? null,
          score, otherSeqScore,
          isLocked: (isPublished && !grantedToMe) || (isResit && !resitEligible),
          isPublished: isPublished && !grantedToMe,
          resitEligible,
        }
      })
    )
    setRows(loaded)
    setInvalidRows({})
    setSelectedIndices(new Set())
    setEditingIndex(null)
  }, [termId, classLevel, subjectId, seqIndex])

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [fetchData])

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
  const handleCopyFromOther = () => {
    const hasOther = rows.some(r => r.otherSeqScore !== null)
    if (!hasOther) { showToast(`${otherSeqFull} has no marks yet`, 'error'); return }
    const hasCurrent = rows.some(r => r.score !== '')
    const doCopy = () => setRows(prev => prev.map(r =>
      r.otherSeqScore !== null ? { ...r, score: String(r.otherSeqScore) } : r
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

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">{t('Loading...')}</div>
  )

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-0 pb-4">
        <button onClick={() => router.back()}
          className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-lg transition">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-foreground">{subjectName} · {seqLabel}</h2>
          <p className="text-sm text-muted-foreground">{classLevel}</p>
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

      {/* Copy-from-other-seq bar — resit has nothing to copy from */}
      {isResit ? (
        <div className="w-full flex items-center gap-3 bg-sky-50 border-b border-sky-200 px-4 py-3 text-left">
          <span className="flex-1 text-sm text-sky-700">
            {t('Only students who failed the exam and failed the course overall can resit, and only the exam is re-sat. Enter their new exam mark out of 70 here; their CA stays as it is.')}
          </span>
        </div>
      ) : (
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
      {publishedCount > 0 && (
        <div className="flex items-center gap-2 bg-orange-50 border-b border-orange-200 px-4 py-2.5 text-sm text-orange-700">
          🔒 {publishedCount === rows.length
            ? t('All report cards are published')
            : `${publishedCount} ${t('report card(s) are published')}`
          } {t('— those rows are locked. Contact your admin to make changes.')}
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
              ? t('All Cards Published')
              : t('Save All Marks')}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
