'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getClassLevelsApi, ClassLevel } from '@/lib/api/classLevels'
import {
  getClassFeesApi, addBulkPaymentsApi, formatXAF, ClassFees, FeeStatus,
} from '@/lib/api/fees'
import { Wallet, Save, Eye, Search } from 'lucide-react'
import Toast from '@/components/ui/Toast'
import Pagination from '@/components/ui/Pagination'
import StudentFeesModal from '@/components/ui/StudentFeesModal'
import { useToast } from '@/lib/useToast'
import { useT } from '@/lib/i18n'
import { usePagination } from '@/lib/usePagination'

type RowEntry = { amount: string; date: string; note: string }
type UniLevel = 'Level 1' | 'Level 2' | 'Level 3'
const UNI_LEVELS: UniLevel[] = ['Level 1', 'Level 2', 'Level 3']

function deptFromClassName(name: string): string {
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}

function levelFromClassName(name: string): UniLevel | null {
  if (/ - Level 1$/i.test(name)) return 'Level 1'
  if (/ - Level 2$/i.test(name)) return 'Level 2'
  if (name.startsWith('Degree ')) return 'Level 3'
  return null
}

function StatusBadge({ status, balance, t }: { status: FeeStatus; balance: number; t: (s: string) => string }) {
  if (status === 'NONE') return <span className="text-muted-foreground text-sm">—</span>
  if (status === 'COMPLETE') return <span className="inline-flex px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">{t('Complete')}</span>
  const cls = status === 'UNPAID' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{formatXAF(balance)} {t('left')}</span>
}

export default function FeesPage() {
  const router = useRouter()
  const { isAuthenticated, school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const { toast, showToast, hideToast } = useToast()
  const t = useT()
  const today = new Date().toISOString().slice(0, 10)

  const [classes, setClasses]         = useState<ClassLevel[]>([])
  const [activeClass, setActiveClass] = useState('')
  const [activeUniLevel, setActiveUniLevel] = useState<UniLevel>('Level 1')
  const [data, setData]               = useState<ClassFees | null>(null)
  const [loading, setLoading]         = useState(false)
  const [rows, setRows]               = useState<Record<string, RowEntry>>({})
  const [saving, setSaving]           = useState(false)
  const [search, setSearch]           = useState('')
  const [historyFor, setHistoryFor]   = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    getClassLevelsApi().then((d) => {
      const sorted = d.classLevels.sort((a, b) => a.order - b.order)
      setClasses(sorted)
      if (sorted.length && !activeClass) {
        // For university, pick first class in Level 1; for others, just pick first
        const first = isUniversity
          ? sorted.find((c) => levelFromClassName(c.name) === 'Level 1')
          : sorted[0]
        if (first) selectClass(first.name)
      }
    }).catch(() => {})
  }, [isAuthenticated])

  // Classes visible in the current level tab (university) or all classes (non-university)
  const visibleClasses = useMemo(() =>
    isUniversity ? classes.filter((c) => levelFromClassName(c.name) === activeUniLevel) : classes,
  [isUniversity, classes, activeUniLevel])

  // When switching level tabs, auto-select first class in that level
  const handleLevelTab = (lv: UniLevel) => {
    setActiveUniLevel(lv)
    const first = classes.find((c) => levelFromClassName(c.name) === lv)
    if (first) selectClass(first.name)
    else { setActiveClass(''); setData(null) }
  }

  const selectClass = async (name: string) => {
    setActiveClass(name)
    setRows({})
    setSearch('')
    setLoading(true)
    try {
      setData(await getClassFeesApi(name))
    } catch {
      showToast(t('Failed to load fees.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const reload = async () => {
    if (activeClass) setData(await getClassFeesApi(activeClass))
  }

  const row = (id: string): RowEntry => rows[id] ?? { amount: '', date: today, note: '' }
  const setField = (id: string, field: keyof RowEntry, value: string) =>
    setRows((p) => ({ ...p, [id]: { ...row(id), [field]: value } }))

  const handleSaveAll = async () => {
    const entries = Object.entries(rows)
      .filter(([, r]) => Number(r.amount) > 0)
      .map(([studentId, r]) => ({ studentId, amount: Number(r.amount), paidOn: r.date || today, note: r.note.trim() || undefined }))
    if (entries.length === 0) {
      showToast(t('Enter at least one payment amount greater than zero'), 'error')
      return
    }
    if (entries.some((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.paidOn))) {
      showToast(t('Pick a valid payment date'), 'error')
      return
    }
    setSaving(true)
    try {
      const res = await addBulkPaymentsApi({ entries })
      showToast(`${res.recorded} ${res.recorded === 1 ? t('payment recorded') : t('payments recorded')}`)
      setRows({})
      await reload()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      showToast(e.response?.data?.message || t('Failed to record payment.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const visible = (data?.students ?? []).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.studentIdCode.toLowerCase().includes(search.toLowerCase()),
  )
  const enteredCount = Object.values(rows).filter((r) => Number(r.amount) > 0).length
  const { page, setPage, totalPages, pageItems, total, pageSize, start } = usePagination(visible, 15, `${activeClass}|${search}`)

  const isHnd = data?.isHndProgram ?? false
  // Label shown in the "Total fee" column header
  const feeScopeLabel = isHnd ? '2-year program' : isUniversity ? 'annual' : ''
  // Subtitle in the page header
  const scopeNote = isHnd
    ? 'HND 2-year program fee · all sessions combined'
    : data?.session
      ? `${t('Current session')}: ${data.session}`
      : ''

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('School Fees')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('Record fee payments per class.')}
            {scopeNote ? <> · <span className={isHnd ? 'text-indigo-600 font-medium' : ''}>{scopeNote}</span></> : null}
          </p>
        </div>
        {activeClass && (
          <button onClick={handleSaveAll} disabled={saving || enteredCount === 0}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63429] disabled:opacity-50 transition">
            <Save size={16} /> {saving ? t('Saving...') : `${t('Save All')}${enteredCount ? ` (${enteredCount})` : ''}`}
          </button>
        )}
      </div>

      {/* University: level tabs + department pills */}
      {isUniversity && (
        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            {UNI_LEVELS.map((lv) => {
              const count = classes.filter((c) => levelFromClassName(c.name) === lv).length
              return (
                <button key={lv} onClick={() => handleLevelTab(lv)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                    activeUniLevel === lv ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}>
                  {lv}
                  {lv !== 'Level 3' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeUniLevel === lv ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>
                      {lv === 'Level 2' ? 'HND' : 'HND I'}
                    </span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeUniLevel === lv ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          {/* Department pills within the active level */}
          <div className="flex flex-wrap gap-2">
            {visibleClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No departments in {activeUniLevel} yet.</p>
            ) : visibleClasses.map((c) => (
              <button key={c.id} onClick={() => selectClass(c.name)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  activeClass === c.name ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                {deptFromClassName(c.name)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Non-university: flat class picker */}
      {!isUniversity && (
        <div className="flex flex-wrap gap-2 mb-4">
          {classes.map((c) => (
            <button key={c.id} onClick={() => selectClass(c.name)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${activeClass === c.name ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {!activeClass ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <Wallet size={32} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{t('No classes defined yet — go to the Classes page to add them.')}</p>
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder={t('Search students...')} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {/* HND context banner */}
          {isHnd && (
            <div className="mb-3 flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-4 py-2.5">
              <span className="inline-flex px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">2-year program</span>
              <p className="text-xs text-indigo-700 dark:text-indigo-300">
                The fee shown is the <strong>total HND program fee</strong> covering both Level 1 and Level 2. Paid amounts include all installments across both years.
              </p>
            </div>
          )}

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading...')}</div>
            ) : visible.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{t('No students found')}</div>
            ) : (
              <div className="overflow-x-auto overflow-y-visible">
                <table className="w-full min-w-[1120px] border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-muted">
                      <th className="sticky left-0 z-10 w-12 bg-muted text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">#</th>
                      <th className="sticky left-12 z-10 bg-muted text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">{t('Name')}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">
                        {t('Total fee')}
                        {feeScopeLabel && (
                          <span className={`ml-1 normal-case font-normal text-[10px] px-1.5 py-0.5 rounded-full ${isHnd ? 'bg-indigo-100 text-indigo-600' : 'bg-muted-foreground/10 text-muted-foreground'}`}>
                            {feeScopeLabel}
                          </span>
                        )}
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">{t('Paid')}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">{t('Balance')}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">{t('Status')}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-l border-border">{t('Amount paid')}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">{t('Payment date')}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">{t('Note (optional)')}</th>
                      <th className="px-4 py-3 border-b border-border"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((s, i) => {
                      const r = row(s.studentId)
                      const rowFee = isHnd ? (s.fee ?? data!.feeAmount) : data!.feeAmount
                      const disabled = rowFee === 0 || s.balance === 0
                      const hasEntry = Number(r.amount) > 0
                      return (
                        <tr key={s.studentId} className={`group transition ${hasEntry ? 'bg-primary/5' : 'hover:bg-muted/60'}`}>
                          <td className={`sticky left-0 z-10 w-12 px-4 py-2.5 text-muted-foreground text-sm border-b border-border ${hasEntry ? 'bg-[#fdf0ef] dark:bg-card' : 'bg-card group-hover:bg-muted/60'}`}>{start + i + 1}</td>
                          <td className={`sticky left-12 z-10 px-4 py-2.5 border-b border-border ${hasEntry ? 'bg-[#fdf0ef] dark:bg-card' : 'bg-card group-hover:bg-muted/60'}`}>
                            <span className="text-sm font-medium text-foreground whitespace-nowrap">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">{s.studentIdCode}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right border-b border-border whitespace-nowrap">
                            {(() => {
                              const rowFee = isHnd ? (s.fee ?? data!.feeAmount) : data!.feeAmount
                              return rowFee > 0
                                ? <span className={`text-sm font-semibold ${isHnd ? 'text-indigo-600' : 'text-foreground'}`}>{formatXAF(rowFee)}</span>
                                : <span className="text-muted-foreground text-sm">—</span>
                            })()}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm text-emerald-600 font-semibold whitespace-nowrap border-b border-border">{formatXAF(s.paid)}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-medium text-foreground whitespace-nowrap border-b border-border">{formatXAF(s.balance)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap border-b border-border"><StatusBadge status={s.status} balance={s.balance} t={t} /></td>
                          <td className="px-4 py-2.5 border-b border-l border-border">
                            <input type="number" min="1" step="any" placeholder="0" value={r.amount}
                              onChange={(e) => setField(s.studentId, 'amount', e.target.value)} disabled={disabled}
                              className="w-28 border border-border rounded-lg px-2.5 py-1.5 text-sm text-right text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 disabled:cursor-not-allowed" />
                          </td>
                          <td className="px-4 py-2.5 border-b border-border">
                            <input type="date" value={r.date}
                              onChange={(e) => setField(s.studentId, 'date', e.target.value)} disabled={disabled}
                              className="w-40 border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 disabled:cursor-not-allowed" />
                          </td>
                          <td className="px-4 py-2.5 border-b border-border">
                            <input type="text" placeholder={t('e.g. First installment')} value={r.note}
                              onChange={(e) => setField(s.studentId, 'note', e.target.value)} disabled={disabled}
                              className="w-48 border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 disabled:cursor-not-allowed" />
                          </td>
                          <td className="px-4 py-2.5 border-b border-border">
                            <button onClick={() => setHistoryFor({ id: s.studentId, name: s.name })} title={t('View details')}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition">
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t('Scroll sideways to see the date and note columns.')}</p>
        </>
      )}

      {historyFor && (
        <StudentFeesModal
          studentId={historyFor.id}
          studentName={historyFor.name}
          onClose={() => setHistoryFor(null)}
          onChanged={reload}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  )
}
