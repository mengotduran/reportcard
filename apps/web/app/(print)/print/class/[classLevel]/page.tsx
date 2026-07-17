'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getReportCardsApi } from '@/lib/api/reportcards'
import { getTemplateApi, TemplateConfig, mergeSavedStandardConfig } from '@/lib/api/reportCardTemplate'
import { getGradingScaleApi, GradeRange, ClassificationBand, DEFAULT_RANGES, DEFAULT_CLASSIFICATION_BANDS } from '@/lib/api/gradingScale'
import PrintableReportCard, { PrintEntry } from '@/components/ui/PrintableReportCard'

interface RawEntry {
  id: string; score: number; seq1Score?: number | null; seq2Score?: number | null; resitScore?: number | null
  grade: string; remarks: string; subject: { id: string; name: string }
}
interface RawRC {
  id: string; status: string; remarks?: string; average?: number | null
  position?: number | null; cgpa?: number | null
  classSize?: number | null; classAverage?: number | null
  student: { id: string; name: string; studentId: string; classLevel: string; guardianName?: string }
  term: { id: string; name: string; session: string; printingEnabled?: boolean }
  entries: RawEntry[]
}

export default function PrintClassPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { school } = useAuthStore()
  const classLevel = decodeURIComponent(params.classLevel as string)
  const termId = searchParams.get('termId') ?? undefined

  const [cards, setCards] = useState<RawRC[]>([])
  const [config, setConfig] = useState<TemplateConfig | null>(null)
  const [gradingRanges, setGradingRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [classBands, setClassBands] = useState<ClassificationBand[]>(DEFAULT_CLASSIFICATION_BANDS)
  const [status, setStatus] = useState<'loading' | 'empty' | 'error' | 'ready' | 'blocked'>('loading')

  useEffect(() => {
    const load = async () => {
      try {
        const [rcData, tplData, scaleData] = await Promise.all([
          getReportCardsApi({ termId, classLevel }),
          getTemplateApi().catch(() => ({ config: {} })),
          getGradingScaleApi().catch(() => ({ ranges: DEFAULT_RANGES, classificationBands: [], legendRows: [] })),
        ])
        const published: RawRC[] = rcData.reportCards.filter((rc: RawRC) => rc.status === 'PUBLISHED')
        if (published.length === 0) { setStatus('empty'); return }
        if (published[0]?.term?.printingEnabled === false) { setStatus('blocked'); return }

        // Resolves the saved standard/ledger design; never the transcript one
        // (that lives under config.transcript and only the transcript page uses it).
        setConfig(mergeSavedStandardConfig(tplData.config as Partial<TemplateConfig>, school?.type))
        if (scaleData.ranges?.length > 0) setGradingRanges(scaleData.ranges)
        if (scaleData.classificationBands?.length > 0) setClassBands(scaleData.classificationBands)
        setCards(published)
        setStatus('ready')
      } catch {
        setStatus('error')
      }
    }
    load()
  }, [classLevel, termId])

  // Auto-print once images have loaded
  useEffect(() => {
    if (status !== 'ready') return
    const imgs = Array.from(document.images)
    const tryPrint = () => window.print()
    if (imgs.length === 0) { setTimeout(tryPrint, 400); return }
    let done = 0
    imgs.forEach(img => {
      const tick = () => { if (++done === imgs.length) setTimeout(tryPrint, 400) }
      if (img.complete) tick(); else { img.onload = tick; img.onerror = tick }
    })
  }, [status])

  if (status === 'loading')  return <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#555' }}>Loading report cards…</div>
  if (status === 'empty')   return <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#555' }}>No published report cards for {classLevel}.</div>
  if (status === 'error')   return <div style={{ fontFamily: 'sans-serif', padding: 40, color: 'red' }}>Failed to load report cards.</div>
  if (status === 'blocked') return <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8 }}>Printing has been disabled for this term by your administrator.</div>
  if (!config) return null

  const schoolData = {
    name: school?.name ?? '', type: school?.type ?? 'SECONDARY', logo: school?.logo ?? null,
    email: school?.email, phone: school?.phone, address: school?.address, website: school?.website,
    authorizationNumber: school?.authorizationNumber,
    officialLeftTextEn: school?.officialLeftTextEn, officialLeftTextFr: school?.officialLeftTextFr,
    officialRightTextEn: school?.officialRightTextEn, officialRightTextFr: school?.officialRightTextFr,
  }

  // Compute class-wide min/avg/max per subject from all loaded cards
  const classSubjectStats: Record<string, { min: number; avg: number; max: number }> = (() => {
    const bySubject: Record<string, number[]> = {}
    for (const rc of cards) {
      for (const e of rc.entries) {
        if (e.score == null) continue
        if (!bySubject[e.subject.id]) bySubject[e.subject.id] = []
        bySubject[e.subject.id].push(e.score)
      }
    }
    const stats: Record<string, { min: number; avg: number; max: number }> = {}
    for (const [sid, scores] of Object.entries(bySubject)) {
      const sum = scores.reduce((a, b) => a + b, 0)
      stats[sid] = { min: Math.min(...scores), max: Math.max(...scores), avg: sum / scores.length }
    }
    return stats
  })()

  return (
    <>
      <style>{`
        @page { margin: 0; size: A4 portrait; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { print-color-adjust: exact; -webkit-print-color-adjust: exact; box-sizing: border-box; }
        .rc-page-break { page-break-after: always; break-after: page; }
        tbody tr, tbody td { background-color: transparent !important; }
      `}</style>

      {cards.map((rc, i) => {
        const subjects = rc.entries.map(e => ({ id: e.subject.id, name: e.subject.name }))
        const entries: PrintEntry[] = rc.entries.map(e => ({
          subjectId: e.subject.id,
          score: e.score,
          seq1Score: e.seq1Score ?? null,
          seq2Score: e.seq2Score ?? null,
          resitScore: e.resitScore ?? null,
          grade: e.grade,
          remarks: e.remarks ?? '',
        }))
        return (
          <div key={rc.id} className={i < cards.length - 1 ? 'rc-page-break' : ''}>
            <PrintableReportCard
              school={schoolData}
              student={{ name: rc.student.name, studentId: rc.student.studentId, classLevel: rc.student.classLevel, guardianName: rc.student.guardianName }}
              term={{ name: rc.term.name, session: rc.term.session }}
              subjects={subjects}
              entries={entries}
              generalRemarks={rc.remarks ?? ''}
              average={rc.average ?? 0}
              position={rc.position ?? null}
              classSize={rc.classSize ?? null}
              classAverage={rc.classAverage ?? null}
              config={config}
              gradeBands={gradingRanges}
              classificationBands={classBands}
              cgpa={rc.cgpa ?? undefined}
              subjectStats={classSubjectStats}
            />
          </div>
        )
      })}
    </>
  )
}
