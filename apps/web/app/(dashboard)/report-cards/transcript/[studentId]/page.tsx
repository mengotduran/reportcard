'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getStudentTranscriptApi, StudentTranscript, TranscriptReportCard } from '@/lib/api/reportcards'
import PrintableReportCard, { PrintEntry, TranscriptSemesterData } from '@/components/ui/PrintableReportCard'
import { useAuthStore } from '@/lib/store/auth.store'
import { ArrowLeft, Printer } from 'lucide-react'
import { getTemplateApi, getDefaultTranscriptLayout, TemplateConfig, TranscriptPeriod, transcriptPeriodsFor, DocVariant } from '@/lib/api/reportCardTemplate'

// Build a per-semester bundle (subjects + entries, PrintableReportCard's shapes) from
// one transcript report card. `subjects` is derived from the entries themselves since
// the transcript endpoint doesn't return a separate class subject list.
function toSemesterData(card?: TranscriptReportCard): TranscriptSemesterData | undefined {
  if (!card) return undefined
  return {
    term: { name: card.term.name, session: card.term.session },
    subjects: card.entries.map(e => ({ id: e.subject.id, name: e.subject.name, code: e.subject.code, credit: e.subject.credit ?? undefined, coefficient: e.subject.coefficient ?? undefined })),
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
  // Which copy is on screen and, therefore, what prints. Defaults to the student copy:
  // handing one to a student is the everyday case, and an official copy is the
  // deliberate act (it gets sealed and sent), so it should be the one you opt into.
  const [variant, setVariant] = useState<DocVariant>('student')
  const [pendingPrint, setPendingPrint] = useState(false)
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
        // The school's transcript design lives under saved.transcript (the top
        // level holds the standard/ledger report-card design; legacy rows from
        // before the sub-key existed saved the transcript at the top level).
        // A school that never customized the transcript layout has no
        // transcriptSemester-flagged marks_table in either place — fall back
        // to the built-in transcript default rather than rendering whatever
        // unrelated layout happens to be saved.
        const savedT = (saved?.transcript ?? (saved?.layoutType === 'transcript' ? saved : undefined)) as Partial<TemplateConfig> | undefined
        const hasTranscriptSections = Array.isArray(savedT?.sections)
          && savedT!.sections!.some((s: any) => s.type === 'marks_table' && s.transcriptSemester)
        const primaryColor = savedT?.primaryColor ?? saved?.primaryColor
        const sType = transcript.school.type ?? undefined
        const finalConfig: TemplateConfig = hasTranscriptSections
          ? (savedT as TemplateConfig)
          : { ...getDefaultTranscriptLayout(sType), ...(primaryColor ? { primaryColor } : {}), layoutType: 'transcript' }
        // "Failing marks in red" is a school-wide policy stored at the top level, not
        // part of the transcript design — read it from there so the transcript matches
        // the report card (see the designer's handleSave).
        finalConfig.highlightFailingRed = saved?.highlightFailingRed ?? true
        setConfig(finalConfig)
      })
      .catch(() => setError('Failed to load transcript.'))
      .finally(() => setLoading(false))
  }, [studentId, session])

  // Print runs from an effect rather than straight out of the click: choosing a copy has
  // to re-render the preview and the print portal FIRST, or window.print() would capture
  // the copy that was on screen a moment ago.
  useEffect(() => {
    if (!pendingPrint) return
    setPrinting(true)
    const portal = document.querySelector('.transcript-print-portal')
    const imgs = portal ? Array.from(portal.getElementsByTagName('img')) : []
    const doPrint = () => { window.print(); setPrinting(false); setPendingPrint(false) }
    if (imgs.length === 0) {
      const id = setTimeout(doPrint, 200)
      return () => clearTimeout(id)
    }
    let done = 0
    imgs.forEach((img) => {
      const tick = () => { if (++done === imgs.length) setTimeout(doPrint, 200) }
      if (img.complete) tick(); else { img.onload = tick; img.onerror = tick }
    })
  }, [pendingPrint])

  const handlePrint = (v: DocVariant) => { setVariant(v); setPendingPrint(true) }

  if (loading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading transcript…</div>
  if (error || !data || !config) return (
    <div className="text-center py-16">
      <p className="text-destructive text-sm">{error || 'Transcript not found.'}</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-primary underline">Go back</button>
    </div>
  )
  const isUniversity = (data.school.type ?? 'UNIVERSITY') === 'UNIVERSITY'
  const periodWord = isUniversity ? 'semester' : 'term'
  // Safety net for direct URL access — the report-cards list already disables its
  // transcript button until every period is published, but nothing stops someone
  // pasting this page's URL mid-year. The API only returns PUBLISHED cards, so fewer
  // than the year's term count means it isn't complete for this student.
  if (data.reportCards.length < data.termCount) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground text-sm">
        The annual transcript is available once every {periodWord} of {data.session} has a published report card for this student.
      </p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-primary underline">Go back</button>
    </div>
  )

  // Already chronological from the API (ordered by term startDate). Slot N of the
  // layout takes the Nth period of the year: 2 semesters at a university, 3 terms at a
  // primary/secondary school.
  const periodData: Partial<Record<TranscriptPeriod, TranscriptSemesterData>> = {}
  transcriptPeriodsFor(data.school.type ?? undefined).forEach((p, i) => {
    const d = toSemesterData(data.reportCards[i])
    if (d) periodData[p] = d
  })
  const periods = Object.values(periodData)
  // Combined across the whole year — drives the grading_legend's summary box
  // (Credits/CGPA/Remark at a university, Annual Average/Grade elsewhere).
  const allSubjects = periods.flatMap(p => p.subjects)
  const allEntries = periods.flatMap(p => p.entries)
  // Annual average = mean of the year's term averages, each coefficient-weighted.
  // University transcripts summarise by CGPA instead and ignore this.
  const termAverages = periods.map(p => {
    let coef = 0, weighted = 0
    for (const subj of p.subjects) {
      const e = p.entries.find(x => x.subjectId === subj.id)
      if (e?.score == null) continue
      const c = subj.coefficient ?? 1
      coef += c; weighted += e.score * c
    }
    return coef > 0 ? weighted / coef : 0
  })
  const annualAverage = termAverages.length ? termAverages.reduce((s, a) => s + a, 0) / termAverages.length : 0

  const printableProps = {
    school: {
      name: data.school.name, type: data.school.type ?? 'UNIVERSITY', logo: data.school.logo, language: data.school.language ?? undefined,
      // The official seal. This object is a hand-listed copy rather than a spread, so a
      // field left out here is simply absent at print time however correct everything
      // else is: that is exactly how the stamp silently never rendered on transcripts.
      stamp: data.school.stamp,
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
    // The document-level average is the ANNUAL one (each table resolves its own period's
    // average itself). Universities summarise by CGPA and never read this.
    average: annualAverage,
    config,
    gradeBands: data.gradingScale,
    classificationBands: data.classificationBands,
    transcriptSemesters: periodData,
    variant,
  }

  return (
    <div>
{/* Toolbar */}
      {/* flex-wrap: the row holds the student name plus both print buttons, and without it
          a long name pushed the last button off the edge on a narrower window. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6 print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <span className="text-sm text-muted-foreground">{data.student.name} — {data.session}</span>
          {/* Look before you print. Previously the only way to see the official copy was to
              press Print, which switched the preview and opened the dialog in one go, so
              you never got to check the seal or the Official Copy note first. */}
          {!printingDisabled && (
            <div className="flex items-center gap-1.5 border border-border rounded-lg p-0.5">
              {(['student', 'official'] as DocVariant[]).map(v => (
                <button key={v} onClick={() => setVariant(v)}
                  disabled={printing}
                  title={v === 'official'
                    ? 'Preview the sealed copy the school sends out itself'
                    : 'Preview the copy handed to students at the end of the term'}
                  className={`text-xs px-2.5 py-1 rounded-md transition disabled:opacity-50 ${variant === v
                    ? 'bg-primary text-white font-medium'
                    : 'text-muted-foreground hover:text-foreground'}`}>
                  {v === 'official' ? 'Official' : 'Student copy'}
                </button>
              ))}
            </div>
          )}
          {printingDisabled ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted border border-border px-3 py-2 rounded-lg" title="Printing has been disabled for this period by your administrator">
              <Printer size={14} /> Printing disabled
            </span>
          ) : (<>
            {/* Both copies are always available: the student copy is what students get at
                the end of the term, the official one is sealed and sent by the school
                itself. Clicking either switches the preview to it and prints that. */}
            <button
              onClick={() => handlePrint('student')}
              disabled={printing}
              className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition disabled:opacity-50"
              title="The copy handed to students at the end of the term"
            >
              <Printer size={15} />
              {printing && variant === 'student' ? 'Loading…' : 'Print Student Copy'}
            </button>
            <button
              onClick={() => handlePrint('official')}
              disabled={printing}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
              title="The sealed copy the school sends out itself"
            >
              <Printer size={15} />
              {printing && variant === 'official' ? 'Loading…' : 'Print Official'}
            </button>
          </>)}
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
