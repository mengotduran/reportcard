'use client'
import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Wallet, RefreshCw, Receipt, Info } from 'lucide-react'
import {
  getStudentFeesApi, addFeePaymentApi, deleteFeePaymentApi, formatXAF,
  StudentFees, FeeStatus,
} from '@/lib/api/fees'
import { updateStudentApi } from '@/lib/api/students'
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
  const [togglingRepeat, setTogglingRepeat] = useState(false)
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

  const handleToggleRepeat = async () => {
    if (!data) return
    setTogglingRepeat(true)
    setError('')
    try {
      await updateStudentApi(data.student.id, { isRepeatingLevel: !data.isRepeatingYear })
      await load()
      onChanged?.()
    } catch {
      setError(t('Failed to update repeat year status.'))
    } finally {
      setTogglingRepeat(false)
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })

  // Running balance per row (Excel-style): due minus cumulative paid.
  let cumulative = 0
  const chip = data ? statusChip(data.status, t) : null
  const collected = data && data.due > 0 ? Math.min(100, Math.round((data.totalPaid / data.due) * 100)) : 0
  const settled = !!data && data.due > 0 && data.balance <= 0
  // What the balance becomes if the amount currently typed is recorded. Answers the question
  // the person entering it is actually asking, without making them do the subtraction.
  const pendingAmount = Number(amount)
  const balanceAfter = data && Number.isFinite(pendingAmount) && pendingAmount > 0
    ? Math.max(0, data.balance - pendingAmount)
    : null

  // Which fee arrangement this student is on, as one phrase. Repeat year outranks the rest:
  // it rescopes the fee to a single session, so it changes what every figure above means.
  const programmeLabel = !data
    ? ''
    : data.isRepeatingYear
      ? 'HND – Repeat Year'
      : data.isHndProgram
        ? (data.student.directLevel2Entry ? 'Direct Entry (1 year)' : 'HND (2 years)')
        : (data.session || '—')

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      {/* Column layout so the header and the Repeat year footer stay put and only the middle
          scrolls — the balance is the thing you came for and shouldn't scroll away. */}
      <div className="bg-card rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-hover flex items-center justify-center text-muted-foreground">
              <Wallet size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-foreground text-lg leading-tight">{t('School fees')}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {studentName}
                {data?.isRepeatingYear
                  ? ` · ${t('Repeat year')} · ${data.session ?? '—'}`
                  : data?.isHndProgram
                    ? data.student.directLevel2Entry
                      ? ' · Direct Level 2 entry (1-year fee)'
                      : ' · HND programme · all sessions'
                    : data?.session ? ` · ${data.session}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('Close')}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-hover flex items-center justify-center text-muted-foreground hover:text-foreground transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">{error}</div>}

          {loading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">{t('Loading...')}</div>
          ) : data ? (
            <>
              {/* Balance leads, at a size you can read across a desk, because "how much is
                  still owed" is the only question this modal exists to answer. Total and
                  paid are the supporting figures and are sized as such. */}
              <div className="rounded-2xl bg-hover p-5 mb-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Balance due')}</p>
                    <div className="flex items-baseline gap-2 flex-wrap mt-1">
                      <span className={`text-4xl font-bold tabular-nums leading-none ${settled ? 'text-emerald-600' : 'text-destructive'}`}>
                        {Math.round(data.balance).toLocaleString('en-US')}
                      </span>
                      <span className={`text-sm font-semibold ${settled ? 'text-emerald-600' : 'text-destructive'}`}>XAF</span>
                      {chip && <span className={`inline-flex px-2 py-1 rounded-md text-xs font-semibold ${chip.cls}`}>{chip.label}</span>}
                    </div>
                  </div>
                  <div className="text-right text-sm space-y-1">
                    <p className="text-muted-foreground">
                      {t('Total fee')} <span className="font-bold text-foreground tabular-nums ml-2">{formatXAF(data.due)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {t('Paid')} <span className="font-bold text-emerald-600 tabular-nums ml-2">{formatXAF(data.totalPaid)}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${collected}%` }} />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {collected}% {t('collected')} · {data.payments.length} {data.payments.length === 1 ? t('installment recorded') : t('installments recorded')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Student ID')}</p>
                  {/* Monospaced: these codes are compared character by character. */}
                  <p className="text-sm font-semibold text-foreground font-mono mt-1 break-all">{data.student.studentId}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Class')}</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{data.student.classLevel}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {(data.isHndProgram || data.isRepeatingYear) ? t('Programme') : t('Session')}
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-1">{programmeLabel}</p>
                </div>
              </div>

              {/* Direct Level 2 entry notice — clarifies this student is not on the 2-year program */}
              {data.isHndProgram && data.student.directLevel2Entry && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 px-4 py-3 mb-5">
                  <p className="text-sm font-medium text-sky-800 dark:text-sky-300">Direct Level 2 entry</p>
                  <p className="text-xs text-sky-700 dark:text-sky-400 mt-0.5">
                    This student enrolled directly at Level 2 and was not here for Level 1. They are on a 1-year fee, not the 2-year program.
                  </p>
                </div>
              )}

              {/* Recording comes BEFORE the history: it is what this modal is opened to do,
                  and it used to sit below a ledger that grows with every payment. */}
              {data.due > 0 && data.balance > 0 ? (
                <form onSubmit={handleAdd} className="rounded-2xl bg-hover p-5 mb-6">
                  <p className="text-sm font-bold text-foreground mb-3">{t('Record a payment')}</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[130px]">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('Amount paid')} <span className="text-destructive">*</span></label>
                      <input type="number" min="1" step="any" placeholder="75000" value={amount}
                        onChange={(e) => setAmount(e.target.value)} required
                        className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div className="min-w-[150px]">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('Payment date')} <span className="text-destructive">*</span></label>
                      <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required
                        className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div className="flex-1 min-w-[130px]">
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t('Note')}</label>
                      <input type="text" placeholder={t('e.g. First installment')} value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <button type="submit" disabled={saving}
                      className="flex items-center gap-1.5 bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#d63429] disabled:opacity-50 transition">
                      <Plus size={15} /> {saving ? t('Saving...') : t('Add')}
                    </button>
                  </div>
                  {balanceAfter !== null && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2.5">
                      <Info size={13} className="flex-shrink-0" />
                      {t('Balance after this payment')}: <span className="font-semibold tabular-nums">{formatXAF(balanceAfter)}</span>
                    </p>
                  )}
                </form>
              ) : data.due === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3 mb-2">{t('No fee is set for this class. Set it on the Classes page.')}</p>
              ) : (
                <p className="text-sm text-emerald-600 font-semibold text-center py-3 mb-2">
                  {data.isHndProgram ? 'HND program fees fully paid. ✓' : t('Fees fully paid for this session. ✓')}
                </p>
              )}

              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-bold text-foreground">{t('Payment history')}</h4>
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-md bg-hover text-[11px] font-semibold text-muted-foreground">
                  {data.payments.length}
                </span>
              </div>

              {data.payments.length === 0 ? (
                // Dashed rather than solid: an empty ledger is a slot waiting to be filled,
                // not a panel that happens to have nothing in it.
                <div className="rounded-2xl border border-dashed border-border py-10 px-4 text-center">
                  <Receipt size={24} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">{t('No payments yet')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('Recorded payments will appear here with running balance.')}</p>
                </div>
              ) : (
                <div className="border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-muted-foreground/70">
                        <th className="text-left w-8">#</th>
                        <th className="text-left">{t('Date')}</th>
                        <th className="text-right">{t('Amount paid')}</th>
                        <th className="text-right">{t('Balance left')}</th>
                        <th className="text-left">{t('Note')}</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.payments.map((p, i) => {
                        cumulative += p.amount
                        const left = Math.max(0, data.due - cumulative)
                        return (
                          <tr key={p.id} className="group hover:bg-hover transition">
                            <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2.5 text-foreground">{fmtDate(p.paidOn)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 tabular-nums">{formatXAF(p.amount)}</td>
                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">{formatXAF(left)}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{p.note || '—'}</td>
                            <td className="px-3 py-2.5">
                              <button onClick={() => handleDelete(p.id)} aria-label={t('Remove')}
                                className="p-1 rounded-lg text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Repeat Year toggle — Level 1 HND only. Pinned to the footer because it changes the
            fee arrangement itself rather than recording anything against it. */}
        {data && (data.isHndProgram || data.isRepeatingYear) && / - Level 1$/i.test(data.student.classLevel) && (
          <div className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-t border-border">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{t('Repeat year')}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {data.isRepeatingYear
                  ? `Fee is scoped to ${data.session ?? 'current session'} only. Prior year payments are preserved but not counted.`
                  : 'Creates a fresh annual fee obligation for Level 1.'}
              </p>
            </div>
            <button
              onClick={handleToggleRepeat}
              disabled={togglingRepeat}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${data.isRepeatingYear ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-hover text-foreground hover:bg-border'}`}
            >
              <RefreshCw size={14} className={togglingRepeat ? 'animate-spin' : ''} />
              {data.isRepeatingYear ? t('Disable') : t('Enable')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
