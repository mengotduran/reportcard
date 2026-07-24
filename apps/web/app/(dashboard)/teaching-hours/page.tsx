'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import { getCoverageApi, CoverageRow, CoverageStatus } from '@/lib/api/coverage'
import { getTeacherAbsencesApi, reportAbsenceApi, deleteAbsenceApi, TeacherAbsence } from '@/lib/api/teacherAbsence'
import { getTeachersApi } from '@/lib/api/teachers'
import { getTeacherTimetableApi, TimetableSlot } from '@/lib/api/timetable'
import CustomSelect from '@/components/ui/CustomSelect'
import Pagination from '@/components/ui/Pagination'
import Toast from '@/components/ui/Toast'
import { useToast } from '@/lib/useToast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { usePagination } from '@/lib/usePagination'
import { Clock, CalendarOff, Search, X, Trash2 } from 'lucide-react'

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// Same Monday-first mapping used on the teacher's own Report Absence flow
// (my-teaching-hours/page.tsx) — kept local for the same reason: a one-liner,
// not worth a shared util.
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

const STATUS_FILTERS: { value: CoverageStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UNDER', label: 'Under' },
  { value: 'EXACT', label: 'Exact' },
  { value: 'OVER', label: 'Over' },
  { value: 'NO_TARGET', label: 'No target' },
]

const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()

export default function TeachingHoursPage() {
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const { toast, showToast, hideToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<string | null>(null)
  const [rows, setRows] = useState<CoverageRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CoverageStatus | 'ALL'>('ALL')

  const [drillDown, setDrillDown] = useState<CoverageRow | null>(null)
  const [absences, setAbsences] = useState<TeacherAbsence[]>([])
  const [absencesLoading, setAbsencesLoading] = useState(false)

  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportTeacherId, setReportTeacherId] = useState('')
  const [teacherSlots, setTeacherSlots] = useState<TimetableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [date, setDate] = useState('')
  const [wholeDay, setWholeDay] = useState(true)
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useBodyScrollLock(showReportModal)

  const load = () => {
    setLoading(true)
    getCoverageApi().then((d) => { setSession(d.session); setRows(d.rows) }).finally(() => setLoading(false))
  }

  useEffect(load, [])
  useEffect(() => { getTeachersApi().then((d) => setTeachers(d.teachers)).catch(() => {}) }, [])

  const openReportModal = () => {
    setReportTeacherId('')
    setTeacherSlots([])
    setDate('')
    setWholeDay(true)
    setSelectedSlotIds([])
    setShowReportModal(true)
  }

  useEffect(() => {
    if (!reportTeacherId) { setTeacherSlots([]); return }
    setSlotsLoading(true)
    getTeacherTimetableApi(reportTeacherId).then((d) => setTeacherSlots(d.slots)).finally(() => setSlotsLoading(false))
  }, [reportTeacherId])

  const daySlots = date ? teacherSlots.filter((s) => s.dayOfWeek === dayOfWeekFor(date) && s.subjectId) : []

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportTeacherId || !date) return
    setSaving(true)
    try {
      await reportAbsenceApi({ teacherId: reportTeacherId, date, wholeDay, timetableSlotIds: wholeDay ? undefined : selectedSlotIds })
      setShowReportModal(false)
      showToast(t('Absence recorded'))
      load()
      if (drillDown && drillDown.teacherId === reportTeacherId) openDrillDown(drillDown)
    } catch (err: any) {
      showToast(err.response?.data?.message || t('Failed to record absence'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.teacherName.toLowerCase().includes(q) || r.subjectName.toLowerCase().includes(q) || r.classLevel.toLowerCase().includes(q)
  })

  const { page, setPage, pageItems, totalPages } = usePagination(filtered, 15, `${search}|${statusFilter}`)

  const openDrillDown = (row: CoverageRow) => {
    setDrillDown(row)
    setAbsencesLoading(true)
    getTeacherAbsencesApi(row.teacherId)
      .then((d) => setAbsences(d.absences.filter((a) => a.subjectName === row.subjectName && a.classLevel === row.classLevel)))
      .finally(() => setAbsencesLoading(false))
  }

  const handleDeleteAbsence = async (id: string) => {
    try {
      await deleteAbsenceApi(id)
      setAbsences((prev) => prev.filter((a) => a.id !== id))
      showToast(t('Absence removed'))
    } catch {
      showToast(t('Failed to remove absence'), 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Attendance')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {session
              ? `${t('Hours coverage for')} ${session}`
              : t('No academic session found yet.')}
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
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-14">
          <Clock size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{t('No subjects have a required-hours target set yet. Set one from the Subjects page.')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text" placeholder={t('Search teacher, subject or class...')}
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="w-full sm:w-48">
              <CustomSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as CoverageStatus | 'ALL')}
                options={STATUS_FILTERS.map((f) => ({ value: f.value, label: t(f.label) }))}
              />
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Teacher')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isUniversity ? t('Course') : t('Subject')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Required')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Taught so far')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Projected / Final')}</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((r) => (
                  <tr key={`${r.teacherId}-${r.subjectId}`} className="hover:bg-muted/40 transition cursor-pointer" onClick={() => openDrillDown(r)}>
                    <td className="px-5 py-3 text-sm font-medium text-foreground">{r.teacherName}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{r.subjectName}</span>
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
          <div className="mt-3">
            <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={15} onPage={setPage} />
          </div>
        </>
      )}

      {drillDown && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDrillDown(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{drillDown.teacherName}</h3>
                <p className="text-xs text-muted-foreground">{drillDown.subjectName} · {drillDown.classLevel}</p>
              </div>
              <button onClick={() => setDrillDown(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <p className="text-xs font-medium text-foreground mb-2">{t('Absences logged')}</p>
            {absencesLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('Loading…')}</p>
            ) : absences.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('No absences reported for this course.')}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {absences.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm bg-muted rounded-lg px-3 py-2">
                    <span className="text-foreground">{a.date} · {t(dayLabel(a.dayOfWeek))} {a.startTime}–{a.endTime}</span>
                    <button onClick={() => handleDeleteAbsence(a.id)} className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition" title={t('Remove')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
                <label className="block text-xs font-medium text-foreground mb-1">{t('Teacher')} <span className="text-destructive">*</span></label>
                <CustomSelect
                  value={reportTeacherId}
                  onChange={(v) => { setReportTeacherId(v); setDate(''); setSelectedSlotIds([]) }}
                  options={teachers.map((tch) => ({ value: tch.id, label: tch.name }))}
                  placeholder={t('Select teacher…')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">{t('Date')} <span className="text-destructive">*</span></label>
                <input
                  type="date" required disabled={!reportTeacherId}
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setSelectedSlotIds([]) }}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>

              {reportTeacherId && date && (
                slotsLoading ? (
                  <p className="text-xs text-muted-foreground">{t('Loading…')}</p>
                ) : daySlots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('No periods on this teacher\'s timetable for this day.')}</p>
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
                  disabled={saving || !reportTeacherId || !date || (!wholeDay && selectedSlotIds.length === 0) || daySlots.length === 0}
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
