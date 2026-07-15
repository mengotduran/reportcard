'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getStudentTranscriptApi, StudentTranscript } from '@/lib/api/reportcards'
import { PrintableTranscript } from '@/components/ui/PrintableTranscript'
import { useAuthStore } from '@/lib/store/auth.store'
import { ArrowLeft, Printer } from 'lucide-react'
import { getTemplateApi } from '@/lib/api/reportCardTemplate'

export default function AnnualTranscriptPage() {
  const { studentId } = useParams() as { studentId: string }
  const router = useRouter()
  const searchParams = useSearchParams()
  const { school } = useAuthStore()
  const [data, setData] = useState<StudentTranscript | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1e3a5f')
  const [highlightFailingRed, setHighlightFailingRed] = useState(true)
  const [transcriptConfig, setTranscriptConfig] = useState<{ showGradeSystem?: boolean; showClassification?: boolean; showLegend?: boolean; deanLabel?: string; registrarLabel?: string; reportTitle?: string; academicYearLabel?: string }>({})
  const [printing, setPrinting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const session = searchParams.get('session') ?? undefined
  const printingDisabled = data?.reportCards.some(rc => rc.term.printingEnabled === false) ?? false

  useEffect(() => {
    Promise.all([
      getStudentTranscriptApi(studentId, session),
      getTemplateApi().catch(() => ({ config: {} })),
    ])
      .then(([transcript, tpl]) => {
        setData(transcript)
        const cfg = tpl.config as any
        if (cfg?.primaryColor) setPrimaryColor(cfg.primaryColor)
        if (cfg?.highlightFailingRed === false) setHighlightFailingRed(false)
        if (cfg?.transcriptConfig) setTranscriptConfig(cfg.transcriptConfig)
      })
      .catch(() => setError('Failed to load transcript.'))
      .finally(() => setLoading(false))
  }, [studentId, session])

  const handlePrint = () => {
    setPrinting(true)
    const portal = document.querySelector('.transcript-print-portal')
    const imgs = portal ? Array.from(portal.getElementsByTagName('img')) : []
    const doPrint = () => { window.print(); setPrinting(false) }
    if (imgs.length === 0) {
      setTimeout(doPrint, 200)
    } else {
      let done = 0
      imgs.forEach((img) => {
        const tick = () => { if (++done === imgs.length) setTimeout(doPrint, 200) }
        if (img.complete) tick(); else { img.onload = tick; img.onerror = tick }
      })
    }
  }

  if (loading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading transcript…</div>
  if (error || !data) return (
    <div className="text-center py-16">
      <p className="text-destructive text-sm">{error || 'Transcript not found.'}</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-primary underline">Go back</button>
    </div>
  )

  return (
    <div>
{/* Toolbar */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{data.student.name} — {data.session}</span>
          {printingDisabled ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted border border-border px-3 py-2 rounded-lg" title="Printing has been disabled for this period by your administrator">
              <Printer size={14} /> Printing disabled
            </span>
          ) : (
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
            >
              <Printer size={15} />
              {printing ? 'Loading…' : 'Print Transcript'}
            </button>
          )}
        </div>
      </div>

      {/* Preview — screen only */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-auto">
        <div ref={printRef}>
          <PrintableTranscript
            data={data}
            primaryColor={primaryColor}
            showGradeSystem={transcriptConfig.showGradeSystem ?? true}
            showClassification={transcriptConfig.showClassification ?? true}
            showLegend={transcriptConfig.showLegend ?? true}
            highlightFailingRed={highlightFailingRed}
            deanLabel={transcriptConfig.deanLabel}
            registrarLabel={transcriptConfig.registrarLabel}
            reportTitle={transcriptConfig.reportTitle}
            academicYearLabel={transcriptConfig.academicYearLabel}
          />
        </div>
      </div>

      {createPortal(
        <div className="transcript-print-portal">
          <PrintableTranscript
            data={data}
            primaryColor={primaryColor}
            showGradeSystem={transcriptConfig.showGradeSystem ?? true}
            showClassification={transcriptConfig.showClassification ?? true}
            showLegend={transcriptConfig.showLegend ?? true}
            highlightFailingRed={highlightFailingRed}
            deanLabel={transcriptConfig.deanLabel}
            registrarLabel={transcriptConfig.registrarLabel}
            reportTitle={transcriptConfig.reportTitle}
            academicYearLabel={transcriptConfig.academicYearLabel}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
