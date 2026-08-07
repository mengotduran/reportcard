'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  getClassOverviewApi, getReportCardApi, createReportCardApi,
  saveEntriesWithSeqApi, setPastTermGrantApi,
} from '@/lib/api/reportcards'
import { COMPETENCY_RATINGS, CompetencyRating, RATING_COLORS, isCompetencyRating } from '@/lib/competency'
import { ArrowLeft, Save, Check } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { onRealtimeDebounced } from '@/lib/socket'
import { useAuthStore } from '@/lib/store/auth.store'
import { getMeApi } from '@/lib/api/auth'
import { useT } from '@/lib/i18n'

/**
 * Marks entry for a COMPETENCY class (nursery / pre-primary).
 *
 * The numeric grid next door is a spreadsheet: a score per pupil, two sequences, a running
 * grade. None of that exists here — a nursery subject carries one of three developmental
 * ratings and nothing else, so this is a picker per pupil rather than a typing surface.
 * Kept as its own component for exactly that reason: threading "no score, no sequence, no
 * maximum, no grade" through 900 lines of arithmetic would have left both modes worse.
 *
 * Everything ELSE is deliberately identical to the numeric sheet: the same locks (published
 * card, school marks policy, closed term), the same realtime staleness handling, the same
 * "create the card if the pupil hasn't got one yet" save.
 */

interface Row {
  studentId: string
  name: string
  studentIdCode: string
  reportCardId: string | null
  /** '' means not yet recorded, which is a legitimate saved state. */
  rating: CompetencyRating | ''
  isLocked: boolean
  /** Locked specifically by publishing — the only case an admin can undo. */
  isPublished?: boolean
}

export default function CompetencyEntryPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const { user, school, updateSchool } = useAuthStore()
  const classLevel = decodeURIComponent(String(params.classLevel))
  const subjectId = decodeURIComponent(String(params.subjectId))
  const termId = searchParams.get('termId') ?? ''
  const subjectName = decodeURIComponent(searchParams.get('subjectName') ?? '')
  const termName = searchParams.get('termName') ?? ''
  const t = useT()

  const isAdminRole = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(user?.role ?? '')
  // Same rule the numeric sheet uses, minus the university branches: a competency class only
  // ever exists at a primary school, so an admin never has standing to record ratings and a
  // teacher loses it only when the school routes entry through the administration.
  const adminOnlyMarks = isAdminRole ? true : school?.marksEntryMode === 'ADMIN_ONLY'

  const [rows, setRows] = useState<Row[]>([])
  // Ratings exactly as last loaded, keyed by pupil. `rows` is the edit buffer, so this is
  // the only way to tell a touched sheet from a clean one — and it is what the save sends,
  // since only a pupil whose rating actually changed needs writing.
  const loadedRatingsRef = useRef<Record<string, string>>({})
  const [staleFromElsewhere, setStaleFromElsewhere] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [isCurrentTerm, setIsCurrentTerm] = useState(true)
  const [pastTermEditGranted, setPastTermEditGranted] = useState(false)
  const [grantSaving, setGrantSaving] = useState(false)
  const pastTermLockedForTeacher = !isAdminRole && !isCurrentTerm && !pastTermEditGranted

  const fetchGenerationRef = useRef(0)

  const fetchData = useCallback(async () => {
    const myGeneration = ++fetchGenerationRef.current

    // Refresh the school (marksEntryMode above in particular) on every load, so a policy
    // change made elsewhere reaches an already-open sheet without a re-login.
    getMeApi().then((me) => { if (me.school) updateSchool(me.school) }).catch(() => {})

    // One request for the whole class — ratings come straight off the overview response,
    // which carries each entry's `grade` for exactly this.
    const overview = await getClassOverviewApi(termId, classLevel, subjectId)
    setIsCurrentTerm(overview.isCurrentTerm)
    setPastTermEditGranted(overview.pastTermEditGranted)
    const freshPastTermLocked = !isAdminRole && !overview.isCurrentTerm && !overview.pastTermEditGranted
    const sorted = [...overview.students].sort((a, b) => a.name.localeCompare(b.name))
    const loaded: Row[] = sorted.map((s) => {
      const entry = s.reportCard?.entries.find((e) => e.subjectId === subjectId)
      // Anything that isn't one of the three is treated as unrecorded rather than shown:
      // a class switched over from marks can still hold a stale numeric grade here.
      const rating: CompetencyRating | '' = isCompetencyRating(entry?.grade) ? entry!.grade as CompetencyRating : ''
      const isPublished = s.reportCard?.status === 'PUBLISHED'
      const grantedToMe = s.reportCard?.marksEditGrantedTo === user?.id
      const frozenByPublish = isPublished && !grantedToMe
      return {
        studentId: s.id, name: s.name, studentIdCode: s.studentId,
        reportCardId: s.reportCard?.id ?? null,
        rating,
        isLocked: frozenByPublish || (adminOnlyMarks && !grantedToMe) || freshPastTermLocked,
        isPublished: frozenByPublish,
      }
    })

    if (fetchGenerationRef.current !== myGeneration) return // a newer fetch has since started
    setRows(loaded)
    loadedRatingsRef.current = Object.fromEntries(loaded.map((r) => [r.studentId, r.rating]))
    setStaleFromElsewhere(false)
  }, [termId, classLevel, subjectId, adminOnlyMarks, user?.id, updateSchool, isAdminRole])

  useEffect(() => { setLoading(true); fetchData().finally(() => setLoading(false)) }, [fetchData])

  const dirtyRows = rows.filter((r) => !r.isLocked && (loadedRatingsRef.current[r.studentId] ?? '') !== r.rating)
  const isDirtyRef = useRef(false)
  isDirtyRef.current = dirtyRows.length > 0

  // Someone else saved for this class. Never refetch over unsaved picks — offer the reload
  // and let the user decide, same as the numeric sheet.
  useEffect(() => onRealtimeDebounced('marks:changed', () => {
    if (isDirtyRef.current) setStaleFromElsewhere(true)
    else fetchData()
  }), [fetchData])

  const editableRows = rows.filter((r) => !r.isLocked)
  const publishedCount = rows.filter((r) => r.isPublished).length
  const filled = rows.filter((r) => r.rating !== '').length

  const setRating = (studentId: string, rating: CompetencyRating) =>
    setRows((prev) => prev.map((r) =>
      // Picking the rating a pupil already has clears it: three chips and no fourth
      // "not recorded" button, so undoing a mistaken tap is the same gesture that made it.
      r.studentId === studentId && !r.isLocked ? { ...r, rating: r.rating === rating ? '' : rating } : r
    ))

  // Fills only the pupils with nothing recorded yet, so it can never overwrite a rating a
  // teacher has deliberately picked — which is what lets it act without a confirmation.
  const fillBlanks = (rating: CompetencyRating) =>
    setRows((prev) => prev.map((r) => (!r.isLocked && r.rating === '' ? { ...r, rating } : r)))

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
    if (dirtyRows.length === 0) { showToast(t('Nothing to save yet'), 'error'); return }
    setSaving(true)
    try {
      const withCards = await Promise.all(dirtyRows.map(async (r) => {
        if (!r.reportCardId) {
          const data = await createReportCardApi({ studentId: r.studentId, termId })
          return { ...r, reportCardId: data.reportCard.id as string }
        }
        return r
      }))
      // The save replaces the card's entries wholesale, so every subject already on the
      // card has to be re-sent or it would be dropped. Only THIS subject carries a
      // `rating` key; the others are sent without one, which is what tells the API to keep
      // the rating each already has (see saveEntriesWithSeqApi).
      const rcDetails = await Promise.all(withCards.map((r) => getReportCardApi(r.reportCardId!)))
      await Promise.all(withCards.map((r, i) => {
        const rc = rcDetails[i]
        const allSubjectIds = Array.from(new Set([...rc.entries.map((e: any) => e.subject.id), subjectId]))
        const entries = allSubjectIds.map((sid) => {
          const existing = rc.entries.find((e: any) => e.subject.id === sid) as any
          if (sid === subjectId) {
            return { subjectId: sid, rating: r.rating === '' ? null : r.rating, remarks: existing?.remarks || '' }
          }
          return { subjectId: sid, remarks: existing?.remarks || '' }
        })
        return saveEntriesWithSeqApi(r.reportCardId!, { entries })
      }))
      showToast(t('Ratings saved'))
      fetchData()
    } catch {
      showToast(t('Failed to save ratings'), 'error')
    } finally { setSaving(false) }
  }

  // Mirrors the real table so the page doesn't blank out and pop.
  if (loading) return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr style={{ backgroundColor: '#1e3a5f' }}>
              <th className="text-left px-4 py-3 text-xs font-bold text-white w-10 border-r border-white/10">#</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-white border-r border-white/10">{t('PUPIL NAME')}</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-white">{t('RATING')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                <td className="px-4 py-3 border-r border-border"><div className="h-3 w-4 rounded bg-muted animate-pulse" /></td>
                <td className="px-4 py-3 border-r border-border"><div className="h-3 rounded bg-muted animate-pulse" style={{ width: `${55 + (i % 4) * 10}%` }} /></td>
                <td className="px-4 py-3 flex justify-center gap-2">
                  {Array.from({ length: 3 }).map((_, j) => <div key={j} className="h-8 w-24 rounded-lg bg-muted animate-pulse" />)}
                </td>
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
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground">{subjectName}</h2>
          <p className="text-sm text-muted-foreground">{classLevel}{termName ? ` · ${termName}` : ''}</p>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between bg-muted border-b border-border px-4 py-2.5">
        <span className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          {classLevel} · <span className="font-semibold text-primary">{t('Ratings')}</span>
          · {filled}/{rows.length} {t('rated')}
        </span>
        <span className="text-xs text-muted-foreground hidden sm:block">
          {t('Tap a rating to record it. Tap it again to clear it.')}
        </span>
      </div>

      {/* Past-term lock — teacher sees why it's read-only, admin gets the contextual unlock. */}
      {!isCurrentTerm && (
        isAdminRole ? (
          <label className="flex items-center gap-3 bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-sm text-sky-700 cursor-pointer">
            <input
              type="checkbox"
              checked={pastTermEditGranted}
              disabled={grantSaving}
              onChange={(e) => handleTogglePastTermGrant(e.target.checked)}
            />
            <span className="flex-1">{t('This term has ended. Allow teachers to edit ratings here anyway?')}</span>
            {grantSaving && <span className="text-xs text-sky-500">{t('Saving...')}</span>}
          </label>
        ) : pastTermLockedForTeacher && (
          <div className="flex items-center gap-2 bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-sm text-sky-700">
            🔒 {t("This term is no longer current, so it's locked. Ask an admin to grant you access if you need to fix something here.")}
          </div>
        )
      )}

      {staleFromElsewhere && (
        <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <span className="flex-1">
            {t('Someone else saved ratings for this class. Reload to see them, or finish and save yours first.')}
          </span>
          <button
            onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)) }}
            className="flex-shrink-0 font-semibold text-amber-900 underline hover:no-underline"
          >
            {t('Reload')}
          </button>
        </div>
      )}

      {adminOnlyMarks && (
        <div className="flex items-center gap-2 bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-sm text-sky-700">
          🔒 {isAdminRole
            ? t('Ratings are recorded by teachers at this school. You can check them here, but not change them.')
            : t('Ratings are recorded by the administration at this school. You can check them here, but not change them. Ask an admin if something needs correcting.')}
        </div>
      )}
      {publishedCount > 0 && (
        <div className="flex items-center gap-2 bg-orange-50 border-b border-orange-200 px-4 py-2.5 text-sm text-orange-700">
          🔒 {publishedCount === rows.length
            ? t('All report cards are published')
            : `${publishedCount} ${t('report card(s) are published')}`
          }{' '}
          {isAdminRole
            ? t('and those rows are locked. Unpublish a report card to change its ratings.')
            : t('and those rows are locked. Ask your admin to unpublish it, or to grant you access.')}
        </div>
      )}

      {/* Fill the blanks — a nursery class is mostly one rating with a handful of exceptions,
          so this is the difference between three taps and sixty. Blank pupils only. */}
      {editableRows.some((r) => r.rating === '') && (
        <div className="flex items-center gap-2 flex-wrap bg-violet-50 border-b border-violet-200 px-4 py-2.5">
          <span className="text-sm font-semibold text-violet-700">{t('Rate everyone still blank:')}</span>
          {COMPETENCY_RATINGS.map((rating) => (
            <button key={rating} onClick={() => fillBlanks(rating)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg border transition hover:opacity-80"
              style={{
                backgroundColor: RATING_COLORS[rating].bg,
                color: RATING_COLORS[rating].text,
                borderColor: RATING_COLORS[rating].border,
              }}>
              {t(rating)}
            </button>
          ))}
        </div>
      )}

      {/* Rating table */}
      <div className="flex-1 bg-card border-x border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr style={{ backgroundColor: '#1e3a5f' }}>
                <th className="text-left px-4 py-3 text-xs font-bold text-white w-10 border-r border-white/10">#</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-white border-r border-white/10">{t('PUPIL NAME')}</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-white">{t('RATING')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-16 text-center">
                    <p className="text-sm text-muted-foreground">{t('No pupils in this class yet.')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('Add pupils to')} {classLevel} {t('before recording ratings.')}</p>
                  </td>
                </tr>
              )}
              {rows.map((row, index) => (
                <tr key={row.studentId} className={row.isLocked ? 'opacity-60' : index % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                  <td className="px-4 py-2 text-xs text-muted-foreground font-mono border-r border-border">{index + 1}</td>
                  <td className="px-4 py-2 border-r border-border">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{row.name}</p>
                      {row.isLocked && <span className="text-xs text-orange-500">🔒</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {COMPETENCY_RATINGS.map((rating) => {
                        const picked = row.rating === rating
                        const c = RATING_COLORS[rating]
                        return (
                          <button
                            key={rating}
                            type="button"
                            disabled={row.isLocked}
                            onClick={() => setRating(row.studentId, rating)}
                            title={picked ? t('Tap again to clear') : t(rating)}
                            className={[
                              'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition',
                              row.isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-90',
                              picked ? '' : 'bg-transparent border-border text-muted-foreground',
                            ].join(' ')}
                            style={picked ? { backgroundColor: c.bg, color: c.text, borderColor: c.text } : undefined}
                          >
                            {picked && <Check size={12} />}
                            {t(rating)}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save — dropped entirely rather than shown disabled when there is nobody to rate. */}
      {rows.length > 0 && (
        <div className="border border-border rounded-b-xl overflow-hidden">
          <button
            onClick={handleSaveAll}
            disabled={saving || editableRows.length === 0 || dirtyRows.length === 0}
            className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-[#d63429] disabled:opacity-50 text-white py-4 text-base font-bold transition"
          >
            <Save size={18} />
            {saving
              ? t('Saving...')
              : editableRows.length === 0
                ? (adminOnlyMarks ? (isAdminRole ? t('Teachers record ratings here') : t('Administration records ratings here')) : t('All Cards Published'))
                : dirtyRows.length === 0
                  ? t('No changes to save')
                  : `${t('Save Ratings')} (${dirtyRows.length})`}
          </button>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
