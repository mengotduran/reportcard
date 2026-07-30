'use client'
import { useEffect, useState, useCallback } from 'react'
import { CalendarOff, Plus, Pencil, Trash2, X } from 'lucide-react'
import { getHolidaysApi, createHolidayApi, updateHolidayApi, deleteHolidayApi, SchoolHoliday } from '@/lib/api/holidays'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

/**
 * Where an admin declares school closures.
 *
 * Lives beside Terms because it is the same kind of data: the academic calendar. Terms say
 * when teaching happens, holidays carve out the days inside them when it does not.
 *
 * Nothing here writes to attendance. Hours are derived on read, so adding a closure after the
 * fact retroactively corrects every total, and deleting one puts those hours straight back.
 */
export default function HolidaysSection() {
  const t = useT()
  // Evening cohorts only exist for universities today, so the sitting picker is hidden
  // everywhere else rather than offering a choice with one real option.
  const isUniversity = useAuthStore((s) => s.school?.type) === 'UNIVERSITY'
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<SchoolHoliday | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<SchoolHoliday | null>(null)
  const [programme, setProgramme] = useState<'DAY' | 'EVENING' | null>(null)

  const load = useCallback(() => {
    getHolidaysApi()
      .then((r) => { setHolidays(r.holidays); setFailed(false) })
      // Not a silent catch: an empty list would otherwise claim the school has no closures
      // when the request simply failed.
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setAdding(true); setEditing(null)
    setName(''); setStartDate(''); setEndDate(''); setError(''); setProgramme(null)
  }
  const openEdit = (h: SchoolHoliday) => {
    setEditing(h); setAdding(false)
    setName(h.name); setStartDate(h.startDate); setEndDate(h.endDate); setError(''); setProgramme(h.programme)
  }
  const close = () => { setAdding(false); setEditing(null); setError('') }

  const save = async () => {
    setError('')
    if (!name.trim()) { setError(t('A name is required')); return }
    if (!startDate) { setError(t('A start date is required')); return }
    // Default a blank end to a single-day closure rather than rejecting it — the commonest
    // holiday is one day, and making people type the same date twice is needless.
    const end = endDate || startDate
    if (end < startDate) { setError(t('The end date cannot be before the start date')); return }

    setSaving(true)
    try {
      const payload = { name: name.trim(), startDate, endDate: end, programme }
      if (editing) await updateHolidayApi(editing.id, payload)
      else await createHolidayApi(payload)
      close()
      load()
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || t('Could not save. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h: SchoolHoliday) => {
    setConfirmDelete(null)
    try { await deleteHolidayApi(h.id); load() } catch { load() }
  }

  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const range = (h: SchoolHoliday) => h.startDate === h.endDate ? fmt(h.startDate) : `${fmt(h.startDate)} – ${fmt(h.endDate)}`

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarOff size={20} className="text-primary" /> {t('Holidays')}
        </h2>
        <button
          onClick={openAdd}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:opacity-90 transition"
        >
          <Plus size={16} /> {t('Add Holiday')}
        </button>
      </div>
      <p className="text-muted-foreground text-sm mb-5">
        {t('Days the school is closed. Periods falling on these days are not counted as taught hours.')}
      </p>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t('Loading...')}</div>
      ) : failed ? (
        <div className="bg-card rounded-xl border border-border text-center py-10">
          <p className="text-sm text-destructive">{t('Could not load holidays. Check your connection and reload.')}</p>
        </div>
      ) : holidays.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-10">
          <CalendarOff size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">{t('No holidays defined yet.')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {holidays.map((h) => (
            <div key={h.id} className="bg-card rounded-xl border border-border px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{h.name}</p>
                <p className="text-sm text-muted-foreground">
                  {range(h)}
                  <span className="text-xs"> · {h.days} {t(h.days === 1 ? 'day' : 'days')}</span>
                  {h.programme && (
                    <span className="ml-2 text-xs font-semibold text-primary">{t(h.programme === 'DAY' ? 'Day only' : 'Evening only')}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEdit(h)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-hover rounded-lg transition" title={t('Edit')}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => setConfirmDelete(h)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition" title={t('Delete')}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={close}>
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground text-lg">{editing ? t('Edit Holiday') : t('Add Holiday')}</h3>
              <button onClick={close} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            <label className="block text-sm font-medium text-foreground mb-1">{t('Name')} <span className="text-primary">*</span></label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. Christmas break')}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground mb-4 focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('Start')} <span className="text-primary">*</span></label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('End')}</label>
                <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t('Leave the end date blank for a single day. Both dates are included.')}</p>

            {isUniversity && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-1">{t('Applies to')}</label>
                <div className="flex gap-2">
                  {([null, 'DAY', 'EVENING'] as const).map((opt) => (
                    <button
                      key={String(opt)}
                      onClick={() => setProgramme(opt)}
                      className={`flex-1 py-2 rounded-lg text-sm border transition ${
                        programme === opt ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-hover'
                      }`}
                    >
                      {t(opt === null ? 'Whole school' : opt === 'DAY' ? 'Day only' : 'Evening only')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive mb-3">{error}</p>}

            <div className="flex gap-2">
              <button onClick={close} className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">{t('Cancel')}</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                {saving ? t('Saving...') : t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-card rounded-2xl w-full max-w-sm p-6 border border-transparent dark:border-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground text-lg mb-2">{t('Remove holiday')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('Removing')} <span className="font-medium text-foreground">{confirmDelete.name}</span> {t('puts those teaching days back into the hours count.')}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-hover transition">{t('Cancel')}</button>
              <button onClick={() => remove(confirmDelete)} className="flex-1 bg-destructive text-white py-2 rounded-lg text-sm font-medium hover:opacity-90 transition">{t('Delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
