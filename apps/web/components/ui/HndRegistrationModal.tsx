'use client'
import { useEffect, useState } from 'react'
import { X, Plus, Trash2, BookMarked } from 'lucide-react'
import {
  getStudentHndRegistrationApi,
  addHndRegistrationPaymentApi,
  deleteHndRegistrationPaymentApi,
  HndRegDetail,
  RegStatus,
} from '@/lib/api/hndRegistration'
import { formatXAF } from '@/lib/api/fees'
import { useLocaleCode } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

function statusChip(status: RegStatus) {
  const map: Record<RegStatus, { label: string; cls: string }> = {
    COMPLETE: { label: 'Registration paid', cls: 'bg-emerald-100 text-emerald-700' },
    PARTIAL:  { label: 'Partly paid',       cls: 'bg-amber-100 text-amber-700' },
    UNPAID:   { label: 'Not paid',          cls: 'bg-red-100 text-red-700' },
  }
  return map[status]
}

export default function HndRegistrationModal({
  studentId,
  studentName,
  onClose,
  onChanged,
}: {
  studentId: string
  studentName: string
  onClose: () => void
  onChanged?: () => void
}) {
  const locale = useLocaleCode()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const [data, setData] = useState<HndRegDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setData(await getStudentHndRegistrationApi(studentId))
    } catch {
      setError('Failed to load registration details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [studentId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) { setError('Enter a payment amount greater than zero'); return }
    setSaving(true)
    try {
      const updated = await addHndRegistrationPaymentApi(studentId, { amount: amt, paidOn, note: note.trim() || undefined })
      setData(updated)
      setAmount('')
      setNote('')
      onChanged?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (paymentId: string) => {
    try {
      await deleteHndRegistrationPaymentApi(paymentId)
      await load()
      onChanged?.()
    } catch {
      setError('Failed to remove payment.')
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })

  let cumulative = 0
  const chip = data ? statusChip(data.status) : null

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <BookMarked size={20} className="text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-lg leading-tight">{isUniversity ? 'HND Registration' : 'GCE Registration'}</h3>
              <p className="text-xs text-muted-foreground">{studentName}{data?.session ? ` · ${data.session}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>

        {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Registration fee</p>
                <p className="text-base font-bold text-foreground mt-1">{formatXAF(data.fee)}</p>
              </div>
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-base font-bold text-emerald-600 mt-1">{formatXAF(data.totalPaid)}</p>
              </div>
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-base font-bold text-primary mt-1">{formatXAF(data.balance)}</p>
              </div>
            </div>

            <div className="bg-muted/50 border border-border rounded-xl p-4 mb-4 grid grid-cols-3 gap-x-4 gap-y-3">
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">Student ID</span>
                <span className="text-sm text-foreground font-medium truncate block">{data.student.studentId}</span>
              </div>
              <div className="min-w-0 col-span-2 sm:col-span-1">
                <span className="text-xs text-muted-foreground block">{isUniversity ? 'Department' : 'Class'}</span>
                <span className="text-sm text-foreground font-medium break-words">
                  {data.student.classLevel.replace(/^HND /, '').replace(/ - Level \d+$/i, '')}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">Session</span>
                <span className="text-sm text-foreground font-medium truncate block">{data.session || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">Installments</span>
                <span className="text-sm text-foreground font-medium">{data.payments.length}</span>
              </div>
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">Last payment</span>
                <span className="text-sm text-foreground font-medium truncate block">
                  {data.payments.length ? fmtDate(data.payments[data.payments.length - 1].paidOn) : '—'}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">Status</span>
                {chip && <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${chip.cls}`}>{chip.label}</span>}
              </div>
            </div>

            <div className="border border-border rounded-xl overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase w-8">#</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Date</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Amount paid</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Balance left</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Note</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.payments.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-sm">No payments recorded yet.</td></tr>
                  ) : data.payments.map((p, i) => {
                    cumulative += p.amount
                    const left = Math.max(0, data.fee - cumulative)
                    return (
                      <tr key={p.id} className="hover:bg-muted transition">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 text-foreground">{fmtDate(p.paidOn)}</td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-600">{formatXAF(p.amount)}</td>
                        <td className="px-3 py-2 text-right text-foreground">{formatXAF(left)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.note || '—'}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => handleDelete(p.id)}
                            className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {data.balance > 0 ? (
              <form onSubmit={handleAdd} className="bg-muted rounded-xl p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Record a payment</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs text-muted-foreground mb-1">Amount paid <span className="text-destructive">*</span></label>
                    <input type="number" min="1" step="any" placeholder="65000" value={amount}
                      onChange={(e) => setAmount(e.target.value)} required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="min-w-[140px]">
                    <label className="block text-xs text-muted-foreground mb-1">Payment date <span className="text-destructive">*</span></label>
                    <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs text-muted-foreground mb-1">Note (optional)</label>
                    <input type="text" placeholder="e.g. Cash" value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <button type="submit" disabled={saving}
                    className="flex items-center gap-1 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                    <Plus size={14} /> {saving ? 'Saving...' : 'Add'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-emerald-600 font-medium text-center py-2">Registration fee fully paid. ✓</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
