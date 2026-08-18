'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  getChildReportCardsApi, getChildFeesApi, getChildReportCardApi,
  ParentReportCardRow,
} from '@/lib/api/parent'
import { formatXAF, StudentFees } from '@/lib/api/fees'
import { ArrowLeft, Loader2, AlertCircle, ChevronDown, Wallet, FileText } from 'lucide-react'

interface CardEntry {
  id: string
  score: number | null
  grade: string | null
  remarks: string | null
  subject: { id: string; name: string; coefficient: number | null }
}
interface FullCard {
  id: string
  average: number | null
  position: number | null
  decision: string | null
  remarks: string | null
  entries: CardEntry[]
  student: { name: string; classLevel: string }
  term: { name: string; session: string }
}

export default function ChildPage() {
  const params = useParams()
  const studentId = String(params?.studentId ?? '')

  const [cards, setCards] = useState<ParentReportCardRow[]>([])
  const [fees, setFees] = useState<StudentFees | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Which card is expanded, and its full contents once fetched. Cards are loaded on demand
  // rather than all at once: each one costs a round trip that already carries class-wide
  // statistics, and a parent reads one at a time.
  const [openId, setOpenId] = useState<string | null>(null)
  const [full, setFull] = useState<Record<string, FullCard>>({})
  const [loadingCard, setLoadingCard] = useState(false)

  useEffect(() => {
    if (!studentId) return
    Promise.all([getChildReportCardsApi(studentId), getChildFeesApi(studentId)])
      .then(([c, f]) => { setCards(c.reportCards); setFees(f) })
      .catch(() => setError('Could not load this page. Please try again.'))
      .finally(() => setLoading(false))
  }, [studentId])

  const toggle = async (cardId: string) => {
    if (openId === cardId) { setOpenId(null); return }
    setOpenId(cardId)
    if (full[cardId]) return
    setLoadingCard(true)
    try {
      const data = await getChildReportCardApi(studentId, cardId)
      setFull((p) => ({ ...p, [cardId]: data.reportCard ?? data }))
    } catch {
      setError('Could not open that report card.')
    } finally {
      setLoadingCard(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
  }

  const studentName = fees?.student?.name ?? ''

  return (
    <div>
      <Link href="/parent" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={15} /> All children
      </Link>

      {studentName && (
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>{studentName}</h1>
      )}
      {fees?.student?.classLevel && <p className="text-sm text-muted-foreground mb-5">{fees.student.classLevel}</p>}

      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3 mb-4">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Fees */}
      {fees && fees.due > 0 && (
        <section className="bg-card border border-border rounded-2xl p-4 mb-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Wallet size={15} className="text-primary" /> School fees
          </h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Total</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{formatXAF(fees.due)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Paid</p>
              <p className="text-sm font-semibold text-emerald-600 tabular-nums">{formatXAF(fees.totalPaid)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Balance</p>
              <p className={`text-sm font-semibold tabular-nums ${fees.balance > 0 ? 'text-primary' : 'text-emerald-600'}`}>
                {formatXAF(fees.balance)}
              </p>
            </div>
          </div>
          {fees.balance === 0 && (
            <p className="mt-3 text-center text-xs text-emerald-600 font-medium">Fees fully paid. Thank you.</p>
          )}
        </section>
      )}

      {/* Report cards */}
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <FileText size={15} className="text-primary" /> Report cards
      </h2>

      {cards.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No report card has been published yet. It will appear here once the school releases it.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => {
            const open = openId === c.id
            const detail = full[c.id]
            return (
              <div key={c.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <button onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-hover transition">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{c.term.name}</p>
                    <p className="text-xs text-muted-foreground">{c.term.session}</p>
                  </div>
                  {c.average != null && (
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-muted-foreground">Average</p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">{c.average.toFixed(2)}</p>
                    </div>
                  )}
                  {c.position != null && (
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-[11px] text-muted-foreground">Position</p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {c.position}{c.totalStudents ? `/${c.totalStudents}` : ''}
                      </p>
                    </div>
                  )}
                  <ChevronDown size={16} className={`text-muted-foreground shrink-0 transition ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="border-t border-border px-4 py-3">
                    {!detail ? (
                      <div className="flex justify-center py-6">
                        {loadingCard ? <Loader2 className="animate-spin text-muted-foreground" size={18} /> : null}
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                <th className="py-2 font-medium">Subject</th>
                                <th className="py-2 font-medium text-right">Mark</th>
                                <th className="py-2 font-medium text-right">Grade</th>
                                <th className="py-2 font-medium">Remark</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.entries?.map((e) => (
                                <tr key={e.id} className="border-t border-border">
                                  <td className="py-2 pr-2 text-foreground">{e.subject?.name}</td>
                                  <td className="py-2 text-right tabular-nums text-foreground">
                                    {e.score == null ? '—' : e.score}
                                  </td>
                                  <td className="py-2 text-right text-foreground">{e.grade ?? '—'}</td>
                                  <td className="py-2 pl-2 text-muted-foreground">{e.remarks ?? ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {(detail.decision || detail.remarks) && (
                          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                            {detail.decision && (
                              <p className="text-sm"><span className="text-muted-foreground">Decision: </span>
                                <span className="font-medium text-foreground">{detail.decision}</span></p>
                            )}
                            {detail.remarks && (
                              <p className="text-sm"><span className="text-muted-foreground">Remark: </span>
                                <span className="text-foreground">{detail.remarks}</span></p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
