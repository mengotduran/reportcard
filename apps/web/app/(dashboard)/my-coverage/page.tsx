'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { useT } from '@/lib/i18n'
import { getMyCoverageApi, CoverageRow, CoverageStatus } from '@/lib/api/coverage'
import { formatHours } from '@/lib/formatHours'
import { stripProgrammeSuffix } from '@/lib/programme'
import { ArrowLeft } from 'lucide-react'

const STATUS_STYLE: Record<CoverageStatus, string> = {
  NO_TARGET: 'bg-muted text-muted-foreground',
  UNDER: 'bg-destructive/10 text-destructive',
  EXACT: 'bg-green-100 text-green-700',
  OVER: 'bg-amber-100 text-amber-700',
}

// This teacher's full per-course coverage list — the "See all" My Attendance hands off to
// once there's more than one course, so that page stays a fixed, uncluttered size no
// matter how many subjects this teacher is on. Same data (getMyCoverageApi) as the one
// row still shown there, just every row instead of one.
export default function MyCoveragePage() {
  const t = useT()
  const router = useRouter()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CoverageRow[]>([])

  useEffect(() => {
    getMyCoverageApi().then((c) => setRows(c.rows)).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <button onClick={() => router.push('/my-teaching-hours')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition">
        <ArrowLeft size={14} /> {t('Back to My Attendance')}
      </button>

      <h2 className="text-2xl font-bold text-foreground mb-1">{t('My Coverage')}</h2>
      <p className="text-muted-foreground text-sm mt-1 mb-6">{t('Every course you teach, and how it stands against its required hours')}</p>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('Loading…')}</div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-xl border border-border text-center py-12">
          <p className="text-muted-foreground text-sm">{t('No required-hours target has been set for any of your subjects yet.')}</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('Subject')}</th>
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
      )}
    </div>
  )
}
