'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  getClassOverviewApi, getReportCardApi, createReportCardApi,
  saveEntriesWithSeqApi,
} from '@/lib/api/reportcards'
import { getSubjectsApi } from '@/lib/api/subjects'
import { getGradingScaleApi, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { gradeFromScore } from '@/lib/grading'
import { seqShort, seqFull } from '@/lib/sequences'
import { ArrowLeft, Save, Copy } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT, useLang } from '@/lib/i18n'

interface Row {
  studentId: string
  name: string
  studentIdCode: string
  reportCardId: string | null
  score: string
  otherSeqScore: number | null
  isLocked: boolean
  isPublished?: boolean
}


export default function MarksEntryPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuthStore()
  const searchParams = useSearchParams()
  const classLevel = decodeURIComponent(String(params.classLevel))
  const subjectId = decodeURIComponent(String(params.subjectId))
  const termId = searchParams.get('termId') ?? ''
  const subjectName = decodeURIComponent(searchParams.get('subjectName') ?? '')
  const seqIndex = Number(searchParams.get('sequence') ?? 0)
  const termName = searchParams.get('termName') ?? ''
  const lang = useLang()
  const seqLabel = seqFull(termName, seqIndex, lang)
  const otherSeqLabel = seqShort(termName, seqIndex === 0 ? 1 : 0, lang)
  const otherSeqFull = seqFull(termName, seqIndex === 0 ? 1 : 0, lang)

  const [rows, setRows] = useState<Row[]>([])
  const [maxScore, setMaxScore] = useState(20)
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const { toast, showToast, hideToast } = useToast()
  const t = useT()

  const fetchData = useCallback(async () => {
    // Load subject maxScore + grading scale in parallel
    const [subjectData, scaleData] = await Promise.all([getSubjectsApi(), getGradingScaleApi().catch(() => ({ ranges: DEFAULT_RANGES }))])
    const subject = subjectData.subjects.find((s: any) => s.id === subjectId)
    if (subject?.maxScore) setMaxScore(subject.maxScore)
    if (scaleData.ranges.length > 0) setGradingRanges(scaleData.ranges)

    const overview = await getClassOverviewApi(termId, classLevel)
    const sorted = [...overview.students].sort((a, b) => a.name.localeCompare(b.name))
    const loaded: Row[] = await Promise.all(
      sorted.map(async (s) => {
        let score = ''
        let otherSeqScore: number | null = null
        if (s.reportCard) {
          try {
            const rc = await getReportCardApi(s.reportCard.id)
            const entry = rc.entries.find((e: any) => e.subject.id === subjectId) as any
            if (entry) {
              score = seqIndex === 0
                ? (entry.seq1Score != null ? String(entry.seq1Score) : '')
                : (entry.seq2Score != null ? String(entry.seq2Score) : '')
              otherSeqScore = seqIndex === 0 ? entry.seq2Score : entry.seq1Score
            }
          } catch { /* no entries yet */ }
        }
        const isPublished = s.reportCard?.status === 'PUBLISHED'
        const grantedToMe = s.reportCard?.marksEditGrantedTo === user?.id
        return { studentId: s.id, name: s.name, studentIdCode: s.studentId, reportCardId: s.reportCard?.id ?? null, score, otherSeqScore, isLocked: isPublished && !grantedToMe }
      })
    )
    setRows(loaded)
  }, [termId, classLevel, subjectId, seqIndex])

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [fetchData])

  const updateScore = (studentId: string, value: string) => {
    // Allow digits and a single decimal point (e.g. 15.5). Clamp to maxScore
    // only when the value already parses to a number above it — without
    // reformatting, so a trailing "." while typing isn't stripped.
    let clean = value.replace(/[^0-9.]/g, '')
    const firstDot = clean.indexOf('.')
    if (firstDot !== -1) clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '')
    if (clean !== '' && clean !== '.' && Number(clean) > maxScore) clean = String(maxScore)
    setRows((prev) => prev.map((r) => r.studentId === studentId ? { ...r, score: clean } : r))
  }

  const getGrade = (score: number) => gradeFromScore(score, maxScore, gradingRanges)

  const handleCopyFromOther = () => {
    const hasOther = rows.some((r) => r.otherSeqScore !== null)
    if (!hasOther) { showToast(`${otherSeqFull} has no marks yet`, 'error'); return }
    const hasCurrent = rows.some((r) => r.score !== '')
    const doCopy = () => setRows((prev) => prev.map((r) =>
      r.otherSeqScore !== null ? { ...r, score: String(r.otherSeqScore) } : r
    ))
    if (hasCurrent) {
      if (confirm(`This will overwrite current marks with ${otherSeqFull} scores. Continue?`)) doCopy()
    } else doCopy()
  }

  const publishedCount = rows.filter(r => r.isLocked).length
  const editableRows = rows.filter(r => !r.isLocked)

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      const updated = await Promise.all(editableRows.map(async (r) => {
        if (!r.reportCardId) {
          const data = await createReportCardApi({ studentId: r.studentId, termId })
          return { ...r, reportCardId: data.reportCard.id }
        }
        return r
      }))
      const rcDetails = await Promise.all(updated.map((r) => getReportCardApi(r.reportCardId!)))
      await Promise.all(updated.map((r, i) => {
        const rc = rcDetails[i]
        const allSubjectIds = Array.from(new Set([...rc.entries.map((e: any) => e.subject.id), subjectId]))
        const entries = allSubjectIds.map((sid) => {
          const existing = rc.entries.find((e: any) => e.subject.id === sid) as any
          if (sid === subjectId) {
            // null = teacher left blank (not filled); 0 = explicitly entered zero
            const cur = r.score !== '' ? Number(r.score) : null
            return {
              subjectId: sid,
              seq1Score: seqIndex === 0 ? cur : (existing?.seq1Score ?? null),
              seq2Score: seqIndex === 1 ? cur : (existing?.seq2Score ?? null),
              remarks: existing?.remarks || '',
            }
          }
          return {
            subjectId: sid,
            seq1Score: existing?.seq1Score ?? undefined,
            seq2Score: existing?.seq2Score ?? undefined,
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

  const filled = rows.filter((r) => r.score !== '').length

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">{t('Loading...')}</div>

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
        <span className="text-sm text-muted-foreground">
          {classLevel} · <span className="font-semibold text-primary">{seqLabel}</span> · {filled}/{rows.length} {t('filled')}
        </span>
      </div>

      {/* Copy bar — full width purple banner like mobile */}
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

      {/* Published banner */}
      {publishedCount > 0 && (
        <div className="flex items-center gap-2 bg-orange-50 border-b border-orange-200 px-4 py-2.5 text-sm text-orange-700">
          🔒 {publishedCount === rows.length ? t('All report cards are published') : `${publishedCount} ${t('report card(s) are published')}`} {t('— those rows are locked. Contact your admin to make changes.')}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 bg-card border-x border-border">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead>
            <tr style={{ backgroundColor: '#1e3a5f' }}>
              <th className="text-left px-4 py-3 text-xs font-bold text-white w-10 border-r border-white/10">#</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-white border-r border-white/10">{t('STUDENT NAME')}</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-white w-36 border-r border-white/10">{t('MARKS /')} {maxScore}</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-white w-36">{t('PERFORMANCE')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => {
              const score = Number(row.score)
              const hasScore = row.score !== ''
              const gr = hasScore ? getGrade(score) : null
              return (
                <tr key={row.studentId} className={row.isPublished ? 'bg-muted opacity-60' : (index % 2 === 0 ? 'bg-card' : 'bg-muted/40')}>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono border-r border-border">{index + 1}</td>
                  <td className="px-4 py-3 border-r border-border">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{row.name}</p>
                      {row.isPublished && <span className="text-xs text-orange-500">🔒</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center border-r border-border">
                    <div className="flex items-center justify-center gap-1">
                    <input
                      ref={(el) => { inputRefs.current[row.studentId] = el }}
                      type="number" min="0" max={maxScore} step="any" inputMode="decimal"
                      value={row.score}
                      disabled={row.isPublished}
                      onChange={(e) => updateScore(row.studentId, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          const next = rows[index + 1]
                          if (next) { e.preventDefault(); inputRefs.current[next.studentId]?.focus() }
                        }
                      }}
                      placeholder="--"
                      className="w-16 bg-transparent text-center text-xl font-bold text-foreground focus:outline-none placeholder-gray-300 border-0 disabled:cursor-not-allowed"
                      style={{ appearance: 'textfield' }}
                    />
                    <span className="text-xs text-muted-foreground font-medium">/{maxScore}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {gr ? (
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
        </table></div>
      </div>

      {/* Full-width Save button at bottom — exactly like mobile */}
      <div className="border border-border rounded-b-xl overflow-hidden">
        <button
          onClick={handleSaveAll}
          disabled={saving || editableRows.length === 0}
          className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-[#d63429] disabled:opacity-50 text-white py-4 text-base font-bold transition"
        >
          <Save size={18} />
          {saving ? t('Saving...') : editableRows.length === 0 ? t('All Cards Published') : t('Save All Marks')}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
