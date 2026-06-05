'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { getReportCardsApi } from '@/lib/api/reportcards'
import { getTemplateApi, TEMPLATE_DEFAULTS, TemplateName, TemplateConfig } from '@/lib/api/reportCardTemplate'
import PrintableReportCard, { PrintEntry } from '@/components/ui/PrintableReportCard'

interface RawEntry {
  id: string; score: number; seq1Score?: number | null; seq2Score?: number | null
  grade: string; remarks: string; subject: { id: string; name: string }
}
interface RawRC {
  id: string; status: string; remarks?: string; average?: number | null
  position?: number | null
  student: { id: string; name: string; studentId: string; classLevel: string; guardianName?: string }
  term: { id: string; name: string; session: string }
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
  const [status, setStatus] = useState<'loading' | 'empty' | 'error' | 'ready'>('loading')

  useEffect(() => {
    const load = async () => {
      try {
        const [rcData, tplData] = await Promise.all([
          getReportCardsApi({ termId, classLevel }),
          getTemplateApi().catch(() => ({ config: {} })),
        ])
        const published: RawRC[] = rcData.reportCards.filter((rc: RawRC) => rc.status === 'PUBLISHED')
        if (published.length === 0) { setStatus('empty'); return }

        const saved = tplData.config as Partial<TemplateConfig> | undefined
        const base = TEMPLATE_DEFAULTS[((saved?.template as TemplateName) ?? 'classic')]
        setConfig(saved && Object.keys(saved).length > 0 ? { ...base, ...saved } as TemplateConfig : base)
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

  if (status === 'loading') return <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#555' }}>Loading report cards…</div>
  if (status === 'empty')  return <div style={{ fontFamily: 'sans-serif', padding: 40, color: '#555' }}>No published report cards for {classLevel}.</div>
  if (status === 'error')  return <div style={{ fontFamily: 'sans-serif', padding: 40, color: 'red' }}>Failed to load report cards.</div>
  if (!config) return null

  const schoolData = { name: school?.name ?? '', type: school?.type ?? 'SECONDARY', logo: school?.logo ?? null }

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
              config={config}
            />
          </div>
        )
      })}
    </>
  )
}
