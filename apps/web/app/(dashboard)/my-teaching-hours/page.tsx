'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import { getMyTimetableApi, TimetableSlot } from '@/lib/api/timetable'
import { getMyCoverageApi, CoverageRow, CoverageStatus } from '@/lib/api/coverage'
import { getMyAbsencesApi, reportAbsenceApi, deleteAbsenceApi, TeacherAbsence } from '@/lib/api/teacherAbsence'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { CalendarOff, Trash2, X } from 'lucide-react'

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

const STATUS_STYLE: Record<CoverageStatus, string> = {
  NO_TARGET: 'bg-muted text-muted-foreground',
  UNDER: 'bg-destructive/10 text-destructive',
  EXACT: 'bg-green-100 text-green-700',
  OVER: 'bg-amber-100 text-amber-700',
}

export default function MyTeachingHoursPage() {
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const { toast, showToast, hideToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])

  const [showReportModal, setShowReportModal] = useState(false)
  const [date, setDate] = useState('')
  const [wholeDay, setWholeDay] = useState(true)
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useBodyScrollLock(showReportModal)

  const load = () => {
    setLoading(true)
    Promise.all([getMyCoverageApi(), getMyTimetableApi(), getMyAbsencesApi()])
      .then(([c, tt, a]) => { setRows(c.rows); setSlots(tt.slots); setAbsences(a.absences) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openReportModal = () => {
    setDate('')
    setWholeDay(true)
    setSelectedSlotIds([])
    setShowReportModal(true)
  }

  const daySlots = date ? slots.filter((s) => s.dayOfWeek === dayOfWeekFor(date) && s.subjectId) : []

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
            <div className="bg-card rounded-xl border border-border overflow-hidden mb-8">
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
                    <tr key={r.subjectId} className="hover:bg-muted/40 transition">
                      <td className="px-5 py-3">
                        <span className="text-sm font-medium text-foreground">{r.subjectName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{r.classLevel}{r.term ? ` · ${r.term}` : ''}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-foreground">{r.requiredHours}</td>
                      <td className="px-4 py-3 text-center text-sm text-foreground">{r.taughtHours.toFixed(1)}</td>
                      <td className="px-4 py-3 text-center text-sm text-foreground">{r.projectedFinalHours.toFixed(1)}{!r.isFinal && <span className="text-xs text-muted-foreground"> ({t('projected')})</span>}</td>
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
          )}

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
                  {absences.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/40 transition">
                      <td className="px-5 py-3 text-sm text-foreground">{a.date}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{a.subjectName ?? '—'} <span className="text-xs text-muted-foreground">{a.classLevel}</span></td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDeleteAbsence(a.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition" title={t('Remove')}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
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
                ) : (
                  <div>
                    <label className="flex items-center gap-2 text-sm text-foreground mb-3">
                      <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} />
                      {t('Absent the whole day')}
                    </label>
                    {!wholeDay && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground mb-1">{t('Which periods?')}</p>
                        {daySlots.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={selectedSlotIds.includes(s.id)}
                              onChange={(e) => setSelectedSlotIds(e.target.checked ? [...selectedSlotIds, s.id] : selectedSlotIds.filter((id) => id !== s.id))}
                            />
                            {s.startTime}–{s.endTime} · {s.subjectName} <span className="text-xs text-muted-foreground">{s.classLevel}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowReportModal(false)}
                  className="flex-1 border border-border text-foreground py-2.5 rounded-lg text-sm hover:bg-muted transition">
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !date || (!wholeDay && selectedSlotIds.length === 0) || daySlots.length === 0}
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
