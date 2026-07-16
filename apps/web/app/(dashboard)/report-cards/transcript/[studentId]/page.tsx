'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getStudentTranscriptApi, StudentTranscript, TranscriptReportCard } from '@/lib/api/reportcards'
import PrintableReportCard, { PrintEntry, TranscriptSemesterData } from '@/components/ui/PrintableReportCard'
import { useAuthStore } from '@/lib/store/auth.store'
import { ArrowLeft, Printer } from 'lucide-react'
import { getTemplateApi, getDefaultTranscriptLayout, TemplateConfig } from '@/lib/api/reportCardTemplate'

// Build a per-semester bundle (subjects + entries, PrintableReportCard's shapes) from
// one transcript report card. `subjects` is derived from the entries themselves since
// the transcript endpoint doesn't return a separate class subject list.
function toSemesterData(card?: TranscriptReportCard): TranscriptSemesterData | undefined {
  if (!card) return undefined
  return {
    term: { name: card.term.name, session: card.term.session },
    subjects: card.entries.map(e => ({ id: e.subject.id, name: e.subject.name, code: e.subject.code, credit: e.subject.credit ?? undefined })),
    entries: card.entries.map((e): PrintEntry => ({
      subjectId: e.subject.id, score: e.score ?? 0, seq1Score: e.seq1Score, seq2Score: e.seq2Score,
      resitScore: e.resitScore, grade: e.grade ?? '', remarks: '',
    })),
  }
}

export default function AnnualTranscriptPage() {
  const { studentId } = useParams() as { studentId: string }
  const router = useRouter()
  const searchParams = useSearchParams()
  const { school } = useAuthStore()
  const [data, setData] = useState<StudentTranscript | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [config, setConfig] = useState<TemplateConfig | null>(null)
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
        const saved = tpl.config as Partial<TemplateConfig> | undefined
        // A school that never customized the transcript layout (or only ever customized
        // the standard one) has no transcriptSemester-flagged marks_table in its saved
        // sections — fall back to the built-in transcript default rather than rendering
        // whatever unrelated layout happens to be saved.
        const hasTranscriptSections = Array.isArray((saved as any)?.sections)
          && (saved as any).sections.some((s: any) => s.type === 'marks_table' && s.transcriptSemester)
        const finalConfig: TemplateConfig = hasTranscriptSections
          ? (saved as TemplateConfig)
          : { ...getDefaultTranscriptLayout(), ...(saved?.primaryColor ? { primaryColor: saved.primaryColor } : {}), layoutType: 'transcript' }
        setConfig(finalConfig)
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
  if (error || !data || !config) return (
    <div className="text-center py-16">
      <p className="text-destructive text-sm">{error || 'Transcript not found.'}</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-primary underline">Go back</button>
    </div>
  )

  // First Semester before Second Semester.
  const sorted = [...data.reportCards].sort((a, b) => a.term.name.localeCompare(b.term.name))
  const sem1 = toSemesterData(sorted[0])
  const sem2 = toSemesterData(sorted[1])
  // Combined across both semesters — drives the grading_legend's Credits/CGPA/Remark box.
  const allSubjects = [...(sem1?.subjects ?? []), ...(sem2?.subjects ?? [])]
  const allEntries = [...(sem1?.entries ?? []), ...(sem2?.entries ?? [])]

  const printableProps = {
    school: {
      name: data.school.name, type: data.school.type ?? 'UNIVERSITY', logo: data.school.logo, language: data.school.language ?? undefined,
      email: data.school.email, phone: data.school.phone, address: data.school.address, website: data.school.website,
      authorizationNumber: data.school.authorizationNumber,
      officialLeftTextEn: data.school.officialLeftTextEn, officialLeftTextFr: data.school.officialLeftTextFr,
      officialRightTextEn: data.school.officialRightTextEn, officialRightTextFr: data.school.officialRightTextFr,
    },
    student: { name: data.student.name, studentId: data.student.studentId, classLevel: data.student.classLevel, gender: data.student.gender ?? undefined },
    term: { name: '', session: data.session },
    subjects: allSubjects,
    entries: allEntries,
    generalRemarks: '',
    average: 0,
    config,
    gradeBands: data.gradingScale,
    classificationBands: data.classificationBands,
    transcriptSemesters: { sem1, sem2 },
  }

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
          <PrintableReportCard {...printableProps} />
        </div>
      </div>

      {createPortal(
        <div className="transcript-print-portal">
          <PrintableReportCard {...printableProps} />
        </div>,
        document.body
      )}
    </div>
  )
}
