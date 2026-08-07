'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import { getMyTimetableApi, TimetableSlot } from '@/lib/api/timetable'
import { getMyCoverageApi, CoverageRow, CoverageStatus } from '@/lib/api/coverage'
import { getMyAbsencesApi, reportAbsenceApi, deleteAbsenceApi, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { formatHours } from '@/lib/formatHours'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { CalendarOff, Trash2, X, ChevronRight } from 'lucide-react'
import { stripProgrammeSuffix } from '@/lib/programme'
import { onRealtime } from '@/lib/socket'
import { slotRunsOn, slotTitle } from '@/lib/timetableGrid'

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

// Same Monday-first mapping the API uses (JS Date#getUTCDay is Sunday-first) — kept
// local rather than shared since it's a one-liner and pulling in an API-only util just
// for this would be more indirection than the duplication it avoids.
function dayOfWeekFor(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return ['SUNDAY', ...DAY_ORDER.slice(0, 6)][jsDay]
}

// Mirrors the API's slotHasPassed (Cameroon is UTC+1/WAT, no DST) — lets the UI grey
// these out up front instead of only finding out after a rejected request.
//
// This is the TEACHER's page, so every caller passes the period's START, not its end: once
// their class has begun it is no longer theirs to file, and only an admin can record it
// (see the cutoff comment in createAbsence). Passing endTime here would offer periods the
// API now refuses.
function slotHasPassed(dateStr: string, endTime: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = endTime.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh - 1, mm || 0) <= Date.now()
}

const STATUS_STYLE: Record<CoverageStatus, string> = {
  NO_TARGET: 'bg-muted text-muted-foreground',
  UNDER: 'bg-destructive/10 text-destructive',
  EXACT: 'bg-green-100 text-green-700',
  OVER: 'bg-amber-100 text-amber-700',
}

export default function MyTeachingHoursPage() {
  const t = useT()
  const router = useRouter()
  const { school, user } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const { toast, showToast, hideToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  // Total periods missed (a 2-period class = 2) + whether a period length is configured
  // (drives "periods" vs "absences" wording).
  const [periodsMissed, setPeriodsMissed] = useState(0)
  const [periodMinutes, setPeriodMinutes] = useState<number | null>(null)
  const unit = (n: number) => periodMinutes != null ? (n === 1 ? t('period missed') : t('periods missed')) : (n === 1 ? t('absence') : t('absences'))

  const [showReportModal, setShowReportModal] = useState(false)
  const [date, setDate] = useState('')
  const [wholeDay, setWholeDay] = useState(true)
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useBodyScrollLock(showReportModal)

  const load = () => {
    setLoading(true)
    Promise.all([getMyCoverageApi(), getMyTimetableApi(), getMyAbsencesApi()])
      .then(([c, tt, a]) => { setRows(c.rows); setSlots(tt.slots); setAbsences(a.absences); setPeriodsMissed(a.periodsMissed); setPeriodMinutes(a.periodMinutes) })
      .finally(() => setLoading(false))
  }

  // An admin opening this teacher's list LOCKS these rows (seenByAdmin), which no longer
  // permits a retraction. That is a read on the admin's side, so no notification fires and
  // nothing else would tell this page — without it the delete button lingers, then fails.
  useEffect(() => onRealtime('absences:changed', load), [])

  useEffect(load, [])

  const openReportModal = () => {
    setDate('')
    setWholeDay(true)
    setSelectedSlotIds([])
    setShowReportModal(true)
  }

  // slotRunsOn, not weekday + subjectId. Dropping `s.subjectId` is what lets a private
  // class be reported at all; slotRunsOn is what keeps a one-off or time-boxed one from
  // being offered on a date it does not actually run.
  const daySlots = date ? slots.filter((s) => slotRunsOn(s, date)) : []
  const reportableSlots = daySlots.filter((s) => !slotHasPassed(date, s.startTime))

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) return
    setSaving(true)
    try {
      await reportAbsenceApi({ date, wholeDay, timetableSlotIds: wholeDay ? undefined : selectedSlotIds })
      setShowReportModal(false)
      showToast(t('Absence recorded'))
      load()
    } catch (err: any) {
      showToast(err.response?.data?.message || t('Failed to record absence'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // One row, not one per subject — a teacher on several courses used to get the whole
  // list rendered here before anything else on the page did. The rest live behind
  // "See all" on /my-coverage instead. The one shown is whichever most needs a look:
  // UNDER first, then OVER, EXACT, and finally NO_TARGET (nothing to act on) last.
  const URGENCY: Record<CoverageStatus, number> = { UNDER: 0, OVER: 1, EXACT: 2, NO_TARGET: 3 }
  const headline = rows.length > 0 ? [...rows].sort((a, b) => URGENCY[a.status] - URGENCY[b.status])[0] : undefined

  const handleDeleteAbsence = async (id: string) => {
    try {
      await deleteAbsenceApi(id)
      showToast(t('Absence removed'))
      load()
    } catch {
      showToast(t('Failed to remove absence'), 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('My Attendance')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isUniversity
              ? t('Hours taught this semester against what each course requires')
              : t('Hours taught this academic year against what each subject requires')}
          </p>
        </div>
        <button
          onClick={openReportModal}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] transition whitespace-nowrap"
        >
          <CalendarOff size={16} /> {t('Report Absence')}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading…')}</div>
      ) : (
        <>
          {rows.length === 0 ? (
            <div className="bg-card rounded-xl border border-border text-center py-12 mb-8">
              <p className="text-muted-foreground text-sm">{t('No required-hours target has been set for any of your subjects yet.')}</p>
            </div>
          ) : (
            <>
              {/* Full table — desktop only. A row per course is compact enough there that
                  the whole list never "floods" the page the way it does at phone width. */}
              <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden mb-8">
                <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isUniversity ? t('Course') : t('Subject')}</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Required')}</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Taught so far')}</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Projected / Final')}</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.subjectId} className="hover:bg-hover/40 transition">
                        <td className="px-5 py-3">
                          <span className="text-sm font-medium text-foreground">{r.subjectName}</span>
                          <span className="text-xs text-muted-foreground ml-2">{stripProgrammeSuffix(r.classLevel)}{r.term ? ` · ${r.term}` : ''}</span>
                          {/* The figures across this row are the COURSE's, which is what the
                              target measures. When someone else also taught it, the teacher's
                              own share is spelled out — otherwise a teacher who joined in
                              November looks as though they missed everything before that. */}
                          {r.contributors.length > 1 && (() => {
                            const mine = r.contributors.find((c) => c.teacherId === user?.id)
                            return mine ? (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t('You taught')} {formatHours(mine.taughtHours)} {t('of this')} · {r.contributors.length} {t('teachers on this course')}
                              </p>
                            ) : null
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-foreground">{r.requiredHours != null ? formatHours(r.requiredHours) : '—'}</td>
                        <td className="px-4 py-3 text-center text-sm text-foreground">{formatHours(r.taughtHours)}</td>
                        <td className="px-4 py-3 text-center text-sm text-foreground">{formatHours(r.projectedFinalHours)}{!r.isFinal && <span className="text-xs text-muted-foreground"> ({t('projected')})</span>}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                            {t(r.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>

              {/* Phone-width only — one course, not the whole list, plus a link to the
                  full set on its own page. Same headline pick (most urgent status first)
                  the mobile app uses on its Attendance tab. */}
              <div className="md:hidden bg-card rounded-xl border border-border overflow-hidden mb-8">
                {headline && (
                  <div className="px-5 py-4">
                    <span className="text-sm font-medium text-foreground">{headline.subjectName}</span>
                    <span className="text-xs text-muted-foreground ml-2">{stripProgrammeSuffix(headline.classLevel)}{headline.term ? ` · ${headline.term}` : ''}</span>
                    <div className="flex items-center gap-5 mt-3">
                      <div><p className="text-xs text-muted-foreground">{t('Required')}</p><p className="text-sm font-semibold text-foreground">{headline.requiredHours != null ? formatHours(headline.requiredHours) : '—'}</p></div>
                      <div><p className="text-xs text-muted-foreground">{t('Taught so far')}</p><p className="text-sm font-semibold text-foreground">{formatHours(headline.taughtHours)}</p></div>
                      <div><p className="text-xs text-muted-foreground">{headline.isFinal ? t('Final') : t('Projected')}</p><p className="text-sm font-semibold text-foreground">{formatHours(headline.projectedFinalHours)}</p></div>
                    </div>
                    <span className={`inline-block mt-3 px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[headline.status]}`}>
                      {t(headline.status)}
                    </span>
                    {headline.contributors.length > 1 && (() => {
                      const mine = headline.contributors.find((c) => c.teacherId === user?.id)
                      return mine ? (
                        <p className="text-xs text-muted-foreground mt-2">
                          {t('You taught')} {formatHours(mine.taughtHours)} {t('of this')} · {headline.contributors.length} {t('teachers on this course')}
                        </p>
                      ) : null
                    })()}
                  </div>
                )}
                {rows.length > 1 && (
                  <button onClick={() => router.push('/my-coverage')}
                    className="w-full flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-primary hover:bg-hover/40 transition border-t border-border">
                    {t('See all courses')} ({rows.length}) <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </>
          )}

          {/* Scoped to the current period server-side (semester for university, academic
              year for primary/secondary) — once that period ends this resets to a fresh
              record, even though nothing is ever deleted; older absences just age out of
              this default view. */}
          <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-5 py-4 mb-4">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${periodsMissed > 0 ? 'bg-orange-100' : 'bg-muted'}`}>
              <CalendarOff size={18} className={periodsMissed > 0 ? 'text-orange-600' : 'text-muted-foreground'} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-none">{periodsMissed}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {unit(periodsMissed)} {isUniversity ? t('this semester') : t('this academic year')}
              </p>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-3">{t('Absences reported')}</h3>
          {absences.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('No absences reported.')}</p>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Date')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isUniversity ? t('Course') : t('Subject')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Period')}</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {absences.map((a) => {
                    // Once the period's happened, only an admin can remove it (they may
                    // want to mark the teacher present after all); once an admin has
                    // reviewed it in a PRIOR visit to their list, it's locked for everyone.
                    // An admin-recorded absence is never removable here at all, whatever the
                    // timing — it was never this teacher's report to retract.
                    const locked = a.isFinal || a.graceExpired || a.seenByAdmin || a.recordedByAdmin
                    // Most specific reason first: "an admin filed this" outlives both other
                    // locks and is the only one that was true from the moment it appeared.
                    const lockedReason = a.recordedByAdmin
                      ? t('An admin recorded this absence, so only an admin can remove it')
                      : a.seenByAdmin
                        ? t('Already reviewed by an admin — ask them to remove it if needed')
                        : t('This period has already passed — ask an admin to remove it if needed')
                    return (
                      // Clicking an absence opens the timetable AT that period, ringed. Same
                      // params the notification links already use, so both routes land alike.
                      <tr key={a.id}
                        onClick={() => router.push(`/my-timetable?missedSlotId=${encodeURIComponent(a.timetableSlotId)}&missedDate=${encodeURIComponent(a.date)}&missedFrom=${encodeURIComponent(a.startTime)}&missedTo=${encodeURIComponent(a.endTime)}`)}
                        className="hover:bg-hover/40 transition cursor-pointer">
                        <td className="px-5 py-3 text-sm text-foreground">{a.date}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{a.subjectName ?? '—'} {a.classLevel && <span className="text-xs text-muted-foreground">{stripProgrammeSuffix(a.classLevel)}</span>}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteAbsence(a.id) }}
                            disabled={locked}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
                            title={locked ? lockedReason : t('Remove')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">{t('Report Absence')}</h3>
              <button onClick={() => setShowReportModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={handleReport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Date')} <span className="text-destructive">*</span></label>
                <input
                  type="date" required autoFocus
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setSelectedSlotIds([]) }}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {date && (
                daySlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('No periods on your timetable for this day.')}</p>
                ) : reportableSlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('Every period for this day has already started. Ask an admin to record it.')}</p>
                ) : (
                  <div>
                    <label className="flex items-center gap-2 text-sm text-foreground mb-3">
                      <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} />
                      {t('Absent the whole day')}
                    </label>
                    {/* Always visible, not just once "whole day" is unchecked — while it's
                        checked these just reflect that every period is covered (shown
                        checked + disabled) rather than disappearing entirely. Periods that
                        have already happened are locked out regardless of wholeDay. */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground mb-1">{t('Which periods?')}</p>
                      {daySlots.map((s) => {
                        const passed = slotHasPassed(date, s.startTime)
                        const locked = wholeDay || passed
                        return (
                          <label key={s.id} className={`flex items-center gap-2 text-sm text-foreground ${locked ? 'opacity-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={passed ? false : (wholeDay || selectedSlotIds.includes(s.id))}
                              disabled={locked}
                              onChange={(e) => setSelectedSlotIds(e.target.checked ? [...selectedSlotIds, s.id] : selectedSlotIds.filter((id) => id !== s.id))}
                            />
                            {s.startTime}–{s.endTime} · {slotTitle(s)} {s.classLevel && <span className="text-xs text-muted-foreground">{stripProgrammeSuffix(s.classLevel)}</span>}
                            {passed && <span className="text-xs text-muted-foreground italic">({t('already started')})</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowReportModal(false)}
                  className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-hover transition">
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !date || (!wholeDay && selectedSlotIds.length === 0) || reportableSlots.length === 0}
                  className="flex-1 bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition"
                >
                  {saving ? t('Saving…') : t('Report Absence')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
