'use client'
import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Wallet } from 'lucide-react'
import {
  getStudentFeesApi, addFeePaymentApi, deleteFeePaymentApi, formatXAF,
  StudentFees, FeeStatus,
} from '@/lib/api/fees'
import { useT, useLocaleCode } from '@/lib/i18n'

function statusChip(status: FeeStatus, t: (s: string) => string) {
  const map: Record<FeeStatus, { label: string; cls: string }> = {
    COMPLETE: { label: t('Fees complete'), cls: 'bg-emerald-100 text-emerald-700' },
    PARTIAL: { label: t('Partly paid'), cls: 'bg-amber-100 text-amber-700' },
    UNPAID: { label: t('Not paid'), cls: 'bg-red-100 text-red-700' },
    NONE: { label: t('No fee set'), cls: 'bg-muted text-muted-foreground' },
  }
  return map[status]
}

export default function StudentFeesModal({
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
  const t = useT()
  const locale = useLocaleCode()
  const [data, setData] = useState<StudentFees | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setData(await getStudentFeesApi(studentId))
    } catch {
      setError(t('Failed to load fees.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [studentId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t('Enter a payment amount greater than zero'))
      return
    }
    setSaving(true)
    try {
      const updated = await addFeePaymentApi(studentId, { amount: amt, paidOn, note: note.trim() || undefined })
      setData(updated)
      setAmount('')
      setNote('')
      onChanged?.()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message || t('Failed to record payment.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (paymentId: string) => {
    try {
      await deleteFeePaymentApi(paymentId)
      await load()
      onChanged?.()
    } catch {
      setError(t('Failed to remove payment.'))
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })

  // Running balance per row (Excel-style): due minus cumulative paid.
  let cumulative = 0
  const chip = data ? statusChip(data.status, t) : null

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Wallet size={20} className="text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-lg leading-tight">{t('School Fees')}</h3>
              <p className="text-xs text-muted-foreground">{studentName}{data?.session ? ` · ${data.session}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>

        {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">{t('Loading...')}</div>
        ) : data ? (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('Total fee')}</p>
                <p className="text-base font-bold text-foreground mt-1">{formatXAF(data.due)}</p>
              </div>
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('Paid')}</p>
                <p className="text-base font-bold text-emerald-600 mt-1">{formatXAF(data.totalPaid)}</p>
              </div>
              <div className="bg-muted rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('Balance')}</p>
                <p className="text-base font-bold text-primary mt-1">{formatXAF(data.balance)}</p>
              </div>
            </div>
            {/* Student details */}
            <div className="bg-muted/50 border border-border rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <div>
                <span className="text-xs text-muted-foreground block">{t('Student ID')}</span>
                <span className="text-sm text-foreground font-medium">{data.student.studentId}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">{t('Class')}</span>
                <span className="text-sm text-foreground font-medium">{data.student.classLevel}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">{t('Session')}</span>
                <span className="text-sm text-foreground font-medium">{data.session || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">{t('Installments')}</span>
                <span className="text-sm text-foreground font-medium">{data.payments.length}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">{t('Last payment')}</span>
                <span className="text-sm text-foreground font-medium">{data.payments.length ? fmtDate(data.payments[data.payments.length - 1].paidOn) : '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">{t('Status')}</span>
                {chip && <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${chip.cls}`}>{chip.label}</span>}
              </div>
            </div>

            {/* Ledger */}
            <div className="border border-border rounded-xl overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase w-8">#</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Date')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Amount paid')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Balance left')}</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">{t('Note')}</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.payments.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-sm">{t('No payments recorded yet.')}</td></tr>
                  ) : data.payments.map((p, i) => {
                    cumulative += p.amount
                    const left = Math.max(0, data.due - cumulative)
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

            {/* Add payment */}
            {data.due > 0 && data.balance > 0 ? (
              <form onSubmit={handleAdd} className="bg-muted rounded-xl p-3">
                <p className="text-xs font-semibold text-foreground mb-2">{t('Record a payment')}</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs text-muted-foreground mb-1">{t('Amount paid')}</label>
                    <input type="number" min="1" step="any" placeholder="75000" value={amount}
                      onChange={(e) => setAmount(e.target.value)} required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="min-w-[140px]">
                    <label className="block text-xs text-muted-foreground mb-1">{t('Payment date')}</label>
                    <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs text-muted-foreground mb-1">{t('Note (optional)')}</label>
                    <input type="text" placeholder={t('e.g. First installment')} value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <button type="submit" disabled={saving}
                    className="flex items-center gap-1 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
                    <Plus size={14} /> {saving ? t('Saving...') : t('Add')}
                  </button>
                </div>
              </form>
            ) : data.due === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">{t('No fee is set for this class. Set it on the Classes page.')}</p>
            ) : (
              <p className="text-sm text-emerald-600 font-medium text-center py-2">{t('Fees fully paid for this session. ✓')}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
