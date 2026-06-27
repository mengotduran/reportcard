'use client'
import { useEffect, useRef, useState } from 'react'
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
  const [transcriptConfig, setTranscriptConfig] = useState<{ showGradeSystem?: boolean; showClassification?: boolean; showLegend?: boolean; deanLabel?: string; registrarLabel?: string }>({})
  const [printing, setPrinting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const session = searchParams.get('session') ?? undefined

  useEffect(() => {
    Promise.all([
      getStudentTranscriptApi(studentId, session),
      getTemplateApi().catch(() => ({ config: {} })),
    ])
      .then(([transcript, tpl]) => {
        setData(transcript)
        const cfg = tpl.config as any
        if (cfg?.primaryColor) setPrimaryColor(cfg.primaryColor)
        if (cfg?.transcriptConfig) setTranscriptConfig(cfg.transcriptConfig)
      })
      .catch(() => setError('Failed to load transcript.'))
      .finally(() => setLoading(false))
  }, [studentId, session])

  const handlePrint = () => {
    if (!printRef.current) return
    setPrinting(true)

    const html = printRef.current.outerHTML
    const origin = window.location.origin
    const resolved = html.replace(/\bsrc="(\/[^"]+)"/g, `src="${origin}$1"`)

    const pw = window.open('', 'transcriptPrint', 'width=960,height=750')
    if (!pw) { alert('Allow popups for this site to enable printing.'); setPrinting(false); return }

    pw.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Annual Transcript</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  @page { margin: 10mm; size: A4 portrait; }
  * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
</style>
</head>
<body>${resolved}</body>
</html>`)
    pw.document.close()
    pw.focus()

    const imgs = Array.from(pw.document.images)
    const doPrint = () => { pw.print(); pw.addEventListener('afterprint', () => pw.close()) }
    if (imgs.length === 0) {
      setTimeout(doPrint, 300)
    } else {
      let done = 0
      imgs.forEach((img) => {
        const tick = () => { if (++done === imgs.length) setTimeout(doPrint, 300) }
        if (img.complete) tick(); else { img.onload = tick; img.onerror = tick }
      })
    }
    setTimeout(() => setPrinting(false), 1500)
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
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
          >
            <Printer size={15} />
            {printing ? 'Loading…' : 'Print Transcript'}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-auto">
        <div ref={printRef}>
          <PrintableTranscript
            data={data}
            primaryColor={primaryColor}
            showGradeSystem={transcriptConfig.showGradeSystem ?? true}
            showClassification={transcriptConfig.showClassification ?? true}
            showLegend={transcriptConfig.showLegend ?? true}
            deanLabel={transcriptConfig.deanLabel}
            registrarLabel={transcriptConfig.registrarLabel}
          />
        </div>
      </div>
    </div>
  )
}
