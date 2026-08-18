'use client'
import { useEffect, useMemo, useState } from 'react'
import { getRevenueApi, formatXAF, Revenue, RevenueLine, Headcount } from '@/lib/api/fees'
import { getTermsApi } from '@/lib/api/terms'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import CustomSelect from '@/components/ui/CustomSelect'
import { TrendingUp, AlertCircle, Loader2, Download, Info } from 'lucide-react'

/**
 * What the school has actually taken in this year, against what it expected to.
 *
 * Deliberately a separate screen from /fees, which is a data-entry grid for recording
 * payments class by class. This one answers a different question, asked by a different
 * person: the founder wanting to know how the year is going.
 *
 * Every figure is for ONE academic year, chosen at the top. Money is never summed across
 * years here, because "how much did we make" without a period attached is not a number
 * anybody can act on.
 */
export default function RevenuePage() {
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'

  const [data, setData] = useState<Revenue | null>(null)
  const [sessions, setSessions] = useState<string[]>([])
  const [session, setSession] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getTermsApi()
      .then((r) => {
        // getTermsApi is untyped; only the session strings matter here.
        const terms = (r.terms ?? []) as { session: string }[]
        const unique = [...new Set(terms.map((term) => term.session))].sort().reverse()
        setSessions(unique)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    getRevenueApi(session || undefined)
      .then((r) => { setData(r); setError('') })
      .catch((err: unknown) => {
        const e = err as { response?: { data?: { message?: string } } }
        setError(e.response?.data?.message || t('Could not load the revenue figures.'))
      })
      .finally(() => setLoading(false))
    // `t` is deliberately NOT a dependency: useT() returns a fresh function on every render,
    // so including it re-runs this effect after each fetch and the page never stops loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const separate = data?.registrationSeparate ?? false

  // The whole screen collapses to one column when registration is not collected apart, which
  // is the point of that setting: a school that does not split the two never sees the split.
  const columns = useMemo(() => (separate
    ? [
        { key: 'registration' as const, label: t('Registration') },
        { key: 'tuition' as const, label: t('School fees') },
        { key: 'total' as const, label: t('Total') },
      ]
    : [{ key: 'total' as const, label: t('Total') }]
  ), [separate, t])

  const exportCsv = () => {
    if (!data) return
    const head = ['Class', 'Department', 'Students', 'Paid up', 'Part paid', 'Not started']
    for (const c of columns) head.push(`${c.label} expected`, `${c.label} collected`, `${c.label} outstanding`)
    const lines = [head.join(',')]
    for (const row of data.byClass) {
      const cells: (string | number)[] = [
        row.classLevel, row.departmentName ?? '', row.students,
        row.headcount.complete, row.headcount.partial, row.headcount.unpaid,
      ]
      for (const c of columns) cells.push(row[c.key].expected, row[c.key].collected, row[c.key].outstanding)
      lines.push(cells.map((v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v)).join(','))
    }
    const totals: (string | number)[] = [
      'TOTAL', '', data.byClass.reduce((n, r) => n + r.students, 0),
      data.headcount.complete, data.headcount.partial, data.headcount.unpaid,
    ]
    for (const c of columns) totals.push(data.totals[c.key].expected, data.totals[c.key].collected, data.totals[c.key].outstanding)
    lines.push(totals.map(String).join(','))

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-${data.session.replace('/', '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('Revenue')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('What the school has collected this year, and what is still owed.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sessions.length > 0 && (
            <div className="w-44">
              {/* The chosen year, or whichever one the server defaulted to. Deliberately NOT
                  written back into `session` on load: that would change the effect's
                  dependency and fetch the whole report a second time on every visit. */}
              <CustomSelect
                value={session || data?.session || ''}
                onChange={setSession}
                options={sessions.map((s) => ({ value: s, label: s }))}
              />
            </div>
          )}
          <button onClick={exportCsv} disabled={!data}
            className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-hover disabled:opacity-50 transition">
            <Download size={16} /> {t('Export CSV')}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3 mb-4">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
      ) : !data ? null : (
        <>
          {/* Headline: one card per kind of money, or just the one when they are combined */}
          <div className={`grid gap-4 mb-6 ${separate ? 'md:grid-cols-3' : 'md:grid-cols-1'}`}>
            {columns.map((c) => (
              <HeadlineCard key={c.key} label={c.label} line={data.totals[c.key]} emphasis={c.key === 'total'}
                headcount={c.key === 'total' ? data.headcount : undefined}
                // Combined mode has no Registration card, so the total says how much of
                // itself is registration. Without it that money is tracked but invisible.
                registration={c.key === 'total' && !separate ? data.totals.registration : undefined}
                t={t} />
            ))}
          </div>

          {/* Exam registration, deliberately outside every total above */}
          {data.examRegistration.collected > 0 && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-card border border-border rounded-xl px-4 py-3 mb-6">
              <Info size={15} className="mt-0.5 shrink-0" />
              <span>
                {t('Exam registration collected this year')}:{' '}
                <span className="font-semibold text-foreground tabular-nums">{formatXAF(data.examRegistration.collected)}</span>.
                {' '}{t('Not counted above: this is collected for the exam board and paid out again.')}
              </span>
            </div>
          )}

          <Breakdown
            title={isUniversity ? t('By level') : t('By class')}
            rows={data.byClass.map((r) => ({ key: r.classLevel, name: r.classLevel, students: r.students, headcount: r.headcount, lines: r }))}
            columns={columns}
            totals={data.totals}
            totalHeads={data.headcount}
            t={t}
          />

          {data.byDepartment.length > 1 && (
            <Breakdown
              title={isUniversity ? t('By department') : t('By section')}
              rows={data.byDepartment.map((r) => ({ key: r.departmentId ?? 'none', name: r.name, students: r.students, headcount: r.headcount, lines: r }))}
              columns={columns}
              totals={data.totals}
              totalHeads={data.headcount}
              t={t}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * Two cells: who has finished paying, and who has not.
 *
 * "Still owing" deliberately folds part-paid and not-started together, because that is the
 * number a head teacher chases. The split between them rides along as a title, for the
 * cases where "eleven have paid nothing" and "eleven are one installment short" call for
 * very different conversations.
 */
function Heads({ headcount, bold }: { headcount: Headcount; bold?: boolean }) {
  const owing = headcount.partial + headcount.unpaid
  const weight = bold ? 'font-semibold' : ''
  return (
    <>
      <td className={`py-2.5 px-2 text-right tabular-nums ${weight} ${headcount.complete > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
        {headcount.complete}
      </td>
      <td className={`py-2.5 px-2 text-right tabular-nums ${weight} ${owing > 0 ? 'text-primary' : 'text-muted-foreground'}`}
        title={owing > 0 ? `${headcount.partial} part paid, ${headcount.unpaid} not started` : undefined}>
        {owing}
        {headcount.noFee > 0 && (
          <span className="text-muted-foreground font-normal"> +{headcount.noFee}</span>
        )}
      </td>
    </>
  )
}

/** The three figures every row and every total carries. */
interface RevenueLines { registration: RevenueLine; tuition: RevenueLine; total: RevenueLine }

function HeadlineCard({ label, line, emphasis, headcount, registration, t }: {
  label: string
  line: RevenueLine
  emphasis: boolean
  headcount?: Headcount
  /** Set only on the combined Total card, where registration has no card of its own. */
  registration?: RevenueLine
  t: (s: string) => string
}) {
  const rate = line.expected > 0 ? Math.round((line.collected / line.expected) * 100) : 0
  // How many families that money represents. Only on the combined card: the split cards are
  // about amounts, and a student can be settled on one side and not the other.
  const owing = headcount ? headcount.partial + headcount.unpaid : 0
  const counted = headcount ? headcount.complete + owing + headcount.noFee : 0
  return (
    <div className={`rounded-2xl border p-5 ${emphasis ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">{formatXAF(line.collected)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {t('collected of')} <span className="tabular-nums">{formatXAF(line.expected)}</span> {t('expected')}
      </p>

      {/* A bar, because "1.2M of 4.8M" lands slower than a bar does */}
      <div className="mt-3 h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, rate)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{rate}% {t('paid')}</span>
        <span className="text-muted-foreground">
          {t('Outstanding')} <span className="font-semibold text-foreground tabular-nums">{formatXAF(line.outstanding)}</span>
        </span>
      </div>

      {registration && (registration.expected > 0 || registration.collected > 0) && (
        <p className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
          {t('Of this')}, <span className="font-semibold text-foreground tabular-nums">{formatXAF(registration.collected)}</span>
          {' '}{t('is registration')}
          {registration.expected > 0 && (
            <>, {t('of')} <span className="tabular-nums">{formatXAF(registration.expected)}</span> {t('expected')}</>
          )}.
          {' '}
          <span className="text-muted-foreground/70">
            {t('Turn on separate tracking in Settings to break this out in full.')}
          </span>
        </p>
      )}

      {headcount && counted > 0 && (
        <p className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
          <span className="font-semibold text-emerald-600 tabular-nums">{headcount.complete}</span>
          {' '}{t('of')} <span className="tabular-nums">{counted}</span> {t('students have paid in full')}
          {owing > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-primary tabular-nums">{owing}</span> {t('still owing')}
              <span className="text-muted-foreground/70"> ({headcount.partial} {t('part paid')}, {headcount.unpaid} {t('not started')})</span>
            </>
          )}
        </p>
      )}
    </div>
  )
}

function Breakdown({ title, rows, columns, totals, totalHeads, t }: {
  title: string
  rows: { key: string; name: string; students: number; headcount: Headcount; lines: RevenueLines }[]
  columns: { key: 'registration' | 'tuition' | 'total'; label: string }[]
  totals: RevenueLines
  totalHeads: Headcount
  t: (s: string) => string
}) {
  if (rows.length === 0) return null
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-2.5 px-4 font-medium">{t('Name')}</th>
              <th className="py-2.5 px-2 font-medium text-right">{t('Students')}</th>
              <th className="py-2.5 px-2 font-medium text-right whitespace-nowrap">{t('Paid up')}</th>
              <th className="py-2.5 px-2 font-medium text-right whitespace-nowrap">{t('Still owing')}</th>
              {columns.map((c) => (
                <th key={c.key} className="py-2.5 px-2 font-medium text-right whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="py-2.5 px-4 font-medium text-right">{t('Outstanding')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-0">
                <td className="py-2.5 px-4 text-foreground">{row.name}</td>
                <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">{row.students}</td>
                <Heads headcount={row.headcount} />
                {columns.map((c) => (
                  <td key={c.key} className="py-2.5 px-2 text-right tabular-nums text-foreground whitespace-nowrap">
                    {formatXAF(row.lines[c.key].collected)}
                  </td>
                ))}
                <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">
                  <span className={row.lines.total.outstanding > 0 ? 'text-primary font-medium' : 'text-emerald-600'}>
                    {formatXAF(row.lines.total.outstanding)}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="bg-hover font-semibold">
              <td className="py-2.5 px-4 text-foreground">{t('Total')}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-foreground">
                {rows.reduce((n, r) => n + r.students, 0)}
              </td>
              <Heads headcount={totalHeads} bold />
              {columns.map((c) => (
                <td key={c.key} className="py-2.5 px-2 text-right tabular-nums text-foreground whitespace-nowrap">
                  {formatXAF(totals[c.key].collected)}
                </td>
              ))}
              <td className="py-2.5 px-4 text-right tabular-nums text-foreground whitespace-nowrap">
                {formatXAF(totals.total.outstanding)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
