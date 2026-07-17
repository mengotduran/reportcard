import { TemplateConfig, DEFAULT_CONFIG, LayoutSection, HeaderSec, StudentInfoSec, MarksTableSec, SummarySec, RemarksSec, SignaturesSec, TextBlockSec, DividerSec, GradingLegendSec, StampSec, marksColumnOrder, CLASSIFICATION_BANDS, DEFAULT_TRANSCRIPT_LEGEND, MiniTable, SpreadsheetTable, SheetCell, SheetRow, buildOfficialContactLine, officialTextBlockHtml, officialTextScaleFor, resolveOfficialText, OFFICIAL_HEADER_FONT, TranscriptPeriod, transcriptPeriodLabel, DocVariant, sectionShowsOn } from '@/lib/api/reportCardTemplate'
import { GradeRange, ClassificationBand, DEFAULT_CLASSIFICATION_BANDS, gradePointForScore20, classificationForGpa, juryDecisionForScore, isFailingScore } from '@/lib/api/gradingScale'
import { gradeForScore20 } from '@/lib/grading'
import { translate } from '@/lib/i18n'

export interface PrintEntry {
  subjectId: string
  score: number
  seq1Score?: number | null
  seq2Score?: number | null
  resitScore?: number | null
  grade: string
  remarks: string
}

interface PrintSubject { id: string; name: string; code?: string | null; coefficient?: number; credit?: number }

export interface PrintableReportCardProps {
  school: { name: string; type: string; logo?: string | null; stamp?: string | null; language?: string; email?: string; phone?: string | null; address?: string | null; website?: string | null; authorizationNumber?: string | null; officialLeftTextEn?: string | null; officialLeftTextFr?: string | null; officialRightTextEn?: string | null; officialRightTextFr?: string | null }
  student: { name: string; studentId: string; classLevel: string; guardianName?: string; gender?: string; dateOfBirth?: string | null; placeOfBirth?: string | null }
  term: { name: string; session: string }
  subjects: PrintSubject[]
  entries: PrintEntry[]
  generalRemarks: string
  generalRemarksFr?: string
  average: number
  position?: number | null
  classSize?: number | null       // students ranked this term/class — denominator next to Position
  classAverage?: number | null    // mean average of that same ranked population
  annualAverage?: number | null   // final term of the session only (non-university)
  annualPosition?: number | null  // class rank by annual average, final term only
  annualClassSize?: number | null // denominator next to Annual Position
  config?: Partial<TemplateConfig>
  gradeBands?: GradeRange[]           // school grading scale; for university transcripts the bands carry gradePoint
  classificationBands?: ClassificationBand[] // CGPA classification bands (university)
  cgpa?: number                       // cumulative GPA (university), if known
  subjectStats?: Record<string, { min: number; avg: number; max: number }> // class-wide per-subject stats
  // Annual transcript only: per-period data for marks_table sections with
  // `transcriptSemester` set (2 semesters for a university, 3 terms otherwise).
  // Absent for every other document type/layout.
  transcriptSemesters?: Partial<Record<TranscriptPeriod, TranscriptSemesterData>>
  /** Which copy is being produced: the sealed OFFICIAL one, or the STUDENT copy handed
   *  out at the end of a term. Chosen per print, never saved into the design. Defaults
   *  to 'official' = show everything, so callers that don't care are unaffected. */
  variant?: DocVariant
}

// Colour a failed subject's marks print in when the admin enables it school-wide.
const FAIL_RED = '#dc2626'

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/**
 * A birth date, spelled out: "12 May 2003". Deliberately not numeric — these documents go
 * to WES and embassies, where 12/05/2003 is read as 5 December by half the world.
 *
 * Parsed from the stored "YYYY-MM-DD" text by hand, never via `new Date(...)`: that reads
 * the string as UTC midnight and then prints the PREVIOUS day for any viewer west of UTC,
 * which would silently misstate a date of birth on an official transcript.
 * Anything unrecognised is passed through verbatim rather than mangled.
 */
function formatBirthDate(value?: string | null, lang: 'EN' | 'FR' = 'EN'): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!m) return raw
  const [, year, mm, dd] = m
  const month = (lang === 'FR' ? MONTHS_FR : MONTHS_EN)[Number(mm) - 1]
  if (!month) return raw
  return `${Number(dd)} ${month} ${year}`
}

function ordinalPos(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Labels are authored "Français / English"; a school is one language, so show that side.
function localizeLabel(label: string, lang: 'EN' | 'FR'): string {
  if (typeof label !== 'string' || !label.includes(' / ')) return label
  const [fr, en] = label.split(' / ')
  return (lang === 'FR' ? fr : en).trim()
}

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '30, 58, 95'
}

const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '6px 10px', borderBottom: '1px solid #ddd', ...extra,
})

function Watermark({ cfg, schoolLogo, schoolName, variant = 'official' }: { cfg: any; schoolLogo?: string | null; schoolName?: string; variant?: DocVariant }) {
  const wm = cfg.watermark
  if (!wm?.enabled) return null
  // Scoped watermarks (an UNOFFICIAL stamp across the student copy) skip the other copy.
  if (wm.showOn && wm.showOn !== variant) return null
  const opacity = (wm.opacity ?? 8) / 100
  const rotation = wm.rotation ?? -45
  const x = wm.x ?? 50
  const y = wm.y ?? 50
  // High z-index so the (faint) watermark stamps ON TOP of all content — a
  // logo is big enough to peek through transparent table cells, but centred
  // text would otherwise sit behind opaque sections and never show.
  const base: React.CSSProperties = { position: 'absolute', top: `${y}%`, left: `${x}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, pointerEvents: 'none', userSelect: 'none', zIndex: 9999 }
  if (wm.type === 'logo') {
    const src = wm.logoUrl || schoolLogo
    if (!src) return null
    const size = wm.size ?? 240
    return <img src={src} alt="" style={{ ...base, width: size, height: size, objectFit: 'contain', opacity }} />
  }
  return (
    <div style={{ ...base, fontSize: wm.size ?? 80, fontWeight: 'bold', opacity, color: wm.color || '#000', whiteSpace: 'nowrap' }}>
      {wm.text || schoolName || ''}
    </div>
  )
}

function Logo({ url, size, color }: { url?: string | null; size: number; color: string }) {
  if (url) return <img src={url} alt="school logo" style={{ width: size, height: size, objectFit: 'contain', display: 'block', borderRadius: 2 }} />
  return null
}

function entryGrade(e: PrintEntry | undefined, bands: GradeRange[]): string {
  if (!e || e.score == null) return '—'
  return gradeForScore20(e.score, bands).grade || '—'
}
function entryRemark(e: PrintEntry | undefined, bands: GradeRange[]): string {
  if (!e || e.score == null) return '—'
  return gradeForScore20(e.score, bands).remark || '—'
}

// University transcript only: a marks_table section with `transcriptSemester` set
// sources its subjects/entries from here instead of the document's combined
// top-level subjects/entries — see the marks_table branch below. Otherwise it's a
// completely normal, editable SpreadsheetTable (columns removable/re-keyable via
// double-click, same as any other marks table).
export interface TranscriptSemesterData {
  term: { name: string; session: string }
  subjects: PrintSubject[]
  entries: PrintEntry[]
}

// ─── Classic ─────────────────────────────────────────────────────────────────
function Classic({ school, student, term, subjects, entries, generalRemarks, generalRemarksFr, average, position, classSize, annualAverage, annualPosition, annualClassSize, cfg, gradeBands }: any) {
  const bands: GradeRange[] = gradeBands ?? []
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const sigLabels = [
    cfg.showTeacherSig && "Class Teacher's Signature",
    cfg.showPrincipalSig && `${cfg.principalTitle}'s Signature`,
    cfg.showParentSig && "Parent / Guardian's Signature",
  ].filter(Boolean) as string[]

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Arial, sans-serif', padding: '40px', maxWidth: '800px', margin: '0 auto', color: '#111', fontSize: '13px', position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ textAlign: 'center', borderBottom: `3px solid ${cfg.primaryColor}`, paddingBottom: '16px', marginBottom: '20px' }}>
        {school.logo && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Logo url={school.logo} size={60} color={cfg.primaryColor} /></div>}
        {cfg.showSchoolType && <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#666', letterSpacing: '2px', textTransform: 'uppercase' }}>{t(school.type)} {t('SCHOOL')}</p>}
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px', color: cfg.primaryColor }}>{school.name}</h1>
        {cfg.schoolSubtitle && <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#555' }}>{cfg.schoolSubtitle}</p>}
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 0', letterSpacing: '3px', color: cfg.primaryColor }}>{cfg.reportTitle}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '20px', backgroundColor: `rgba(${rgb},0.05)`, padding: '12px', border: `1px solid rgba(${rgb},0.3)` }}>
        {[['Student Name', student.name], ['Student ID', student.studentId], ['Class', student.classLevel], ['Guardian', student.guardianName || '—'], ['Term', term.name], ['Session', term.session]].map(([k, v]) => (
          <div key={k}><span style={{ fontWeight: 'bold' }}>{t(k)}:</span> {v}</div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '12px' }}>
        <thead>
          <tr style={{ backgroundColor: cfg.primaryColor, color: '#fff' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>{t('Subject')}</th>
            {cfg.showSeq1 && <th style={{ padding: '8px 10px', textAlign: 'center' }}>{t('Seq. 1')}</th>}
            {cfg.showSeq2 && <th style={{ padding: '8px 10px', textAlign: 'center' }}>{t('Seq. 2')}</th>}
            <th style={{ padding: '8px 10px', textAlign: 'center' }}>{t('Score')}</th>
            {cfg.showGrade && <th style={{ padding: '8px 10px', textAlign: 'center' }}>{t('Grade')}</th>}
            {cfg.showRemarks && <th style={{ padding: '8px 10px', textAlign: 'left' }}>{t('Remarks')}</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s: PrintSubject, i: number) => {
            const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
            return (
              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)` }}>
                <td style={cell()}>{s.name}</td>
                {cfg.showSeq1 && <td style={cell({ textAlign: 'center' })}>{e?.seq1Score ?? '—'}</td>}
                {cfg.showSeq2 && <td style={cell({ textAlign: 'center' })}>{e?.seq2Score ?? '—'}</td>}
                <td style={cell({ textAlign: 'center', fontWeight: 'bold' })}>{e?.score ?? 0}</td>
                {cfg.showGrade && <td style={cell({ textAlign: 'center', fontWeight: 'bold', color: cfg.primaryColor })}>{entryGrade(e, bands)}</td>}
                {cfg.showRemarks && <td style={cell({ color: '#555' })}>{entryRemark(e, bands)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[true, cfg.showAverage, cfg.showPosition].filter(Boolean).length}, 1fr)`, gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Total Score', value: total },
          cfg.showAverage && { label: 'Average', value: `${average.toFixed(1)}` },
          cfg.showPosition && { label: 'Position', value: position != null ? `${position}${classSize ? `/${classSize}` : ''}` : '—' },
        ].filter(Boolean).map((item: any) => (
          <div key={item.label} style={{ border: `1px solid rgba(${rgb},0.3)`, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: cfg.primaryColor }}>{item.value}</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>{t(item.label)}</div>
          </div>
        ))}
      </div>

      {annualAverage != null && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${annualPosition != null ? 2 : 1}, 1fr)`, gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Annual Average', value: `${annualAverage.toFixed(1)}` },
            annualPosition != null && { label: 'Annual Position', value: `${annualPosition}${annualClassSize ? `/${annualClassSize}` : ''}` },
          ].filter(Boolean).map((item: any) => (
            <div key={item.label} style={{ border: `1px solid rgba(${rgb},0.3)`, padding: '10px', textAlign: 'center', backgroundColor: `rgba(${rgb},0.05)` }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: cfg.primaryColor }}>{item.value}</div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>{t(item.label)}</div>
            </div>
          ))}
        </div>
      )}

      {cfg.showGeneralRemarks && (
        <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: '12px', marginBottom: '28px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px', color: cfg.primaryColor }}>{t('General Remarks')}</div>
          <div style={{ color: '#444', minHeight: '36px' }}>{generalRemarks || generalRemarksFr || '—'}</div>
        </div>
      )}

      {sigLabels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '24px', marginTop: '36px' }}>
          {sigLabels.map((label) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: `1px solid #111`, height: '40px', marginBottom: '6px' }} />
              <div style={{ fontSize: '11px', color: '#555' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '28px', borderTop: '1px solid #ccc', paddingTop: '8px', textAlign: 'center', fontSize: '11px', color: '#888' }}>
        {cfg.footerText || `Generated on ${new Date().toLocaleDateString()}`}
      </div>
    </div>
  )
}

// ─── Bilingual ────────────────────────────────────────────────────────────────
function Bilingual({ school, student, term, subjects, entries, generalRemarks, generalRemarksFr, average, position, classSize, annualAverage, annualPosition, annualClassSize, cfg, gradeBands }: any) {
  const bands: GradeRange[] = gradeBands ?? []
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const sigLabels = [
    cfg.showTeacherSig && ['Maître de Classe', 'Class Teacher'],
    cfg.showPrincipalSig && [cfg.principalTitle, cfg.principalTitle],
    cfg.showParentSig && ['Parent / Tuteur', 'Parent / Guardian'],
  ].filter(Boolean) as [string, string][]

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Arial, sans-serif', padding: '36px', maxWidth: '800px', margin: '0 auto', color: '#111', fontSize: '12px', position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ textAlign: 'center', backgroundColor: cfg.primaryColor, color: '#fff', padding: '20px', marginBottom: '16px' }}>
        {cfg.schoolSubtitle && <p style={{ margin: '0 0 4px', fontSize: '11px', letterSpacing: '1px', opacity: 0.85 }}>{cfg.schoolSubtitle}</p>}
        {school.logo && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Logo url={school.logo} size={56} color={cfg.primaryColor} /></div>}
        <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: '0 0 6px' }}>{school.name}</h1>
        {cfg.showSchoolType && <p style={{ margin: '0 0 10px', fontSize: '11px', opacity: 0.8 }}>{t(school.type)} {t('SCHOOL')} / ÉCOLE {school.type}</p>}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.4)', paddingTop: '10px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 'bold', margin: 0, letterSpacing: '1px' }}>{cfg.reportTitle}</h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '16px', border: `1px solid ${cfg.primaryColor}`, padding: '10px' }}>
        {[['Nom / Name', student.name], ['Matricule / ID', student.studentId], ['Classe / Class', student.classLevel], ['Tuteur / Guardian', student.guardianName || '—'], ['Terme / Term', term.name], ['Session / Year', term.session]].map(([k, v]) => (
          <div key={k} style={{ padding: '2px 0' }}><span style={{ fontWeight: 'bold' }}>{t(k)}:</span> {v}</div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '12px' }}>
        <thead>
          <tr style={{ backgroundColor: cfg.primaryColor, color: '#fff' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>MATIÈRE / SUBJECT</th>
            {cfg.showSeq1 && <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Seq.1</th>}
            {cfg.showSeq2 && <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Seq.2</th>}
            <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>MOY / Avg</th>
            {cfg.showGrade && <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>NOTE / Grade</th>}
            {cfg.showRemarks && <th style={{ padding: '7px 10px', textAlign: 'left' }}>OBS / Remarks</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s: PrintSubject, i: number) => {
            const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
            return (
              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.05)`, borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 10px', borderRight: '1px solid #e5e7eb' }}>{s.name}</td>
                {cfg.showSeq1 && <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>{e?.seq1Score ?? '—'}</td>}
                {cfg.showSeq2 && <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>{e?.seq2Score ?? '—'}</td>}
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #e5e7eb' }}>{e?.score ?? 0}</td>
                {cfg.showGrade && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: cfg.primaryColor, borderRight: '1px solid #e5e7eb' }}>{entryGrade(e, bands)}</td>}
                {cfg.showRemarks && <td style={{ padding: '6px 10px', color: '#555' }}>{entryRemark(e, bands)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[true, cfg.showAverage, cfg.showPosition].filter(Boolean).length}, 1fr)`, gap: '8px', marginBottom: '16px' }}>
        {[
          { fr: 'Score Total', en: 'Total Score', val: total },
          cfg.showAverage && { fr: 'Moyenne', en: 'Average', val: `${average.toFixed(1)}` },
          cfg.showPosition && { fr: 'Rang', en: 'Position', val: position != null ? `${position}${classSize ? `/${classSize}` : ''}` : '—' },
        ].filter(Boolean).map((item: any) => (
          <div key={item.en} style={{ border: `2px solid ${cfg.primaryColor}`, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: cfg.primaryColor }}>{item.val}</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{item.fr} / {item.en}</div>
          </div>
        ))}
      </div>

      {annualAverage != null && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${annualPosition != null ? 2 : 1}, 1fr)`, gap: '8px', marginBottom: '16px' }}>
          {[
            { fr: 'Moyenne Annuelle', en: 'Annual Average', val: `${annualAverage.toFixed(1)}` },
            annualPosition != null && { fr: 'Rang Annuel', en: 'Annual Position', val: `${annualPosition}${annualClassSize ? `/${annualClassSize}` : ''}` },
          ].filter(Boolean).map((item: any) => (
            <div key={item.en} style={{ border: `2px solid ${cfg.primaryColor}`, padding: '8px', textAlign: 'center', backgroundColor: `rgba(${rgb},0.05)` }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: cfg.primaryColor }}>{item.val}</div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{item.fr} / {item.en}</div>
            </div>
          ))}
        </div>
      )}

      {cfg.showGeneralRemarks && (
        <div style={{ border: `1px solid ${cfg.primaryColor}`, padding: '10px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: cfg.primaryColor }}>Observations / General Remarks</div>
          <div style={{ minHeight: '32px' }}>{generalRemarks || generalRemarksFr || '—'}</div>
        </div>
      )}

      {sigLabels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '20px', marginTop: '32px' }}>
          {sigLabels.map(([fr, en]) => (
            <div key={en} style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #111', height: '40px', marginBottom: '5px' }} />
              <div style={{ fontSize: '10px', color: '#444', lineHeight: '1.4' }}>{fr}<br />{en}</div>
            </div>
          ))}
        </div>
      )}

      {cfg.footerText && (
        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '11px', color: cfg.primaryColor, fontStyle: 'italic', borderTop: `1px solid ${cfg.primaryColor}`, paddingTop: '8px' }}>
          {cfg.footerText}
        </div>
      )}
    </div>
  )
}

// ─── Modern ───────────────────────────────────────────────────────────────────
function Modern({ school, student, term, subjects, entries, generalRemarks, generalRemarksFr, average, position, classSize, annualAverage, annualPosition, annualClassSize, cfg, gradeBands }: any) {
  const bands: GradeRange[] = gradeBands ?? []
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const sigLabels = [
    cfg.showTeacherSig && "Class Teacher",
    cfg.showPrincipalSig && cfg.principalTitle,
    cfg.showParentSig && "Parent / Guardian",
  ].filter(Boolean) as string[]

  const infoItems = [
    { label: 'Name', value: student.name },
    { label: 'ID', value: student.studentId },
    { label: 'Class', value: student.classLevel },
    { label: 'Term', value: `${term.name} — ${term.session}` },
    { label: 'Guardian', value: student.guardianName || '—' },
  ]

  return (
    <div id="report-card-printable" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: '800px', margin: '0 auto', color: '#1f2937', fontSize: '13px', position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ backgroundColor: cfg.primaryColor, padding: '28px 40px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
        {school.logo && <Logo url={school.logo} size={52} color={cfg.primaryColor} />}
        <div>
        <h1 style={{ fontSize: '26px', fontWeight: '800', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{school.name}</h1>
        <p style={{ margin: '0', fontSize: '13px', opacity: 0.8, letterSpacing: '2px', textTransform: 'uppercase' }}>{cfg.reportTitle}</p>
        </div>
      </div>

      <div style={{ padding: '20px 40px', backgroundColor: `rgba(${rgb},0.06)`, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {infoItems.map(({ label, value }) => (
          <div key={label} style={{ backgroundColor: 'transparent', border: `1px solid rgba(${rgb},0.2)`, borderRadius: '20px', padding: '4px 12px', fontSize: '12px' }}>
            <span style={{ color: '#9ca3af' }}>{label}: </span>
            <span style={{ fontWeight: '600' }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '24px 40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${cfg.primaryColor}` }}>
              <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>{t('Subject')}</th>
              {cfg.showSeq1 && <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>{t('Seq 1')}</th>}
              {cfg.showSeq2 && <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>{t('Seq 2')}</th>}
              <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>{t('Score')}</th>
              {cfg.showGrade && <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>{t('Grade')}</th>}
              {cfg.showRemarks && <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: cfg.primaryColor }}>{t('Remarks')}</th>}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s: PrintSubject) => {
              const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '9px 0', fontWeight: '500' }}>{s.name}</td>
                  {cfg.showSeq1 && <td style={{ padding: '9px 8px', textAlign: 'center', color: '#6b7280' }}>{e?.seq1Score ?? '—'}</td>}
                  {cfg.showSeq2 && <td style={{ padding: '9px 8px', textAlign: 'center', color: '#6b7280' }}>{e?.seq2Score ?? '—'}</td>}
                  <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: '700', color: cfg.primaryColor }}>{e?.score ?? 0}</td>
                  {cfg.showGrade && <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                    <span style={{ backgroundColor: `rgba(${rgb},0.1)`, color: cfg.primaryColor, borderRadius: '4px', padding: '2px 10px', fontWeight: '600', fontSize: '12px' }}>{entryGrade(e, bands)}</span>
                  </td>}
                  {cfg.showRemarks && <td style={{ padding: '9px 0', color: '#6b7280', fontSize: '12px' }}>{entryRemark(e, bands)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[true, cfg.showAverage, cfg.showPosition].filter(Boolean).length}, 1fr)`, gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total Score', value: total },
            cfg.showAverage && { label: 'Average', value: `${average.toFixed(1)}` },
            cfg.showPosition && { label: 'Position', value: position != null ? `#${position}${classSize ? `/${classSize}` : ''}` : '—' },
          ].filter(Boolean).map((item: any) => (
            <div key={item.label} style={{ backgroundColor: `rgba(${rgb},0.08)`, borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color: cfg.primaryColor }}>{item.value}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>{t(item.label)}</div>
            </div>
          ))}
        </div>

        {annualAverage != null && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${annualPosition != null ? 2 : 1}, 1fr)`, gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Annual Average', value: `${annualAverage.toFixed(1)}` },
              annualPosition != null && { label: 'Annual Position', value: `#${annualPosition}${annualClassSize ? `/${annualClassSize}` : ''}` },
            ].filter(Boolean).map((item: any) => (
              <div key={item.label} style={{ backgroundColor: cfg.primaryColor, borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '800', color: '#fff' }}>{item.value}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>{t(item.label)}</div>
              </div>
            ))}
          </div>
        )}

        {cfg.showGeneralRemarks && (
          <div style={{ backgroundColor: 'transparent', borderRadius: '8px', padding: '14px', marginBottom: '24px', borderLeft: `3px solid ${cfg.primaryColor}` }}>
            <div style={{ fontWeight: '600', marginBottom: '5px', color: cfg.primaryColor, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('General Remarks')}</div>
            <div style={{ color: '#374151', minHeight: '28px' }}>{generalRemarks || generalRemarksFr || '—'}</div>
          </div>
        )}

        {sigLabels.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '20px', marginTop: '32px' }}>
            {sigLabels.map((label) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: `2px solid ${cfg.primaryColor}`, height: '40px', marginBottom: '6px' }} />
                <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {cfg.footerText && (
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#9ca3af' }}>{cfg.footerText}</div>
        )}
      </div>
    </div>
  )
}

// ─── Official ─────────────────────────────────────────────────────────────────
function Official({ school, student, term, subjects, entries, generalRemarks, generalRemarksFr, average, position, classSize, annualAverage, annualPosition, annualClassSize, cfg, gradeBands }: any) {
  const bands: GradeRange[] = gradeBands ?? []
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + e.score, 0)
  const border = `2px solid ${cfg.primaryColor}`
  const sigLabels = [
    cfg.showTeacherSig && "Class Teacher's Signature",
    cfg.showPrincipalSig && `${cfg.principalTitle}'s Signature`,
    cfg.showParentSig && "Parent / Guardian's Signature",
  ].filter(Boolean) as string[]

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Times New Roman, serif', padding: '32px', maxWidth: '800px', margin: '0 auto', color: '#111', fontSize: '13px', border: `3px double ${cfg.primaryColor}`, position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} />
      <div style={{ textAlign: 'center', borderBottom: border, paddingBottom: '16px', marginBottom: '16px' }}>
        {cfg.schoolSubtitle && <p style={{ margin: '0 0 4px', fontSize: '11px', fontStyle: 'italic', color: '#555' }}>{cfg.schoolSubtitle}</p>}
        {school.logo ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo url={school.logo} size={64} color={cfg.primaryColor} /></div>
        ) : (
          <div style={{ width: '60px', height: '60px', border: `1px solid ${cfg.primaryColor}`, borderRadius: '50%', margin: '6px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: cfg.primaryColor }}>SEAL</div>
        )}
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '6px 0 2px', textTransform: 'uppercase', letterSpacing: '2px' }}>{school.name}</h1>
        {cfg.showSchoolType && <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#555' }}>{school.type} School</p>}
        <div style={{ border: border, display: 'inline-block', padding: '4px 24px', margin: '6px 0 0' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 'bold', margin: 0, letterSpacing: '2px', textTransform: 'uppercase' }}>{cfg.reportTitle}</h2>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border }}>
        <tbody>
          {[['Student Name', student.name, 'Student ID', student.studentId], ['Class', student.classLevel, 'Guardian', student.guardianName || '—'], ['Term', term.name, 'Session', term.session]].map((row, i) => (
            <tr key={i}>
              <td style={{ padding: '5px 10px', fontWeight: 'bold', width: '20%', border, backgroundColor: `rgba(${rgb},0.05)` }}>{row[0]}</td>
              <td style={{ padding: '5px 10px', width: '30%', border }}>{row[1]}</td>
              <td style={{ padding: '5px 10px', fontWeight: 'bold', width: '20%', border, backgroundColor: `rgba(${rgb},0.05)` }}>{row[2]}</td>
              <td style={{ padding: '5px 10px', width: '30%', border }}>{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border }}>
        <thead>
          <tr style={{ backgroundColor: cfg.primaryColor, color: '#fff' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.3)' }}>{t('Subject')}</th>
            {cfg.showSeq1 && <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>{t('Seq. 1')}</th>}
            {cfg.showSeq2 && <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>{t('Seq. 2')}</th>}
            <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>{t('Score')}</th>
            {cfg.showGrade && <th style={{ padding: '7px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>{t('Grade')}</th>}
            {cfg.showRemarks && <th style={{ padding: '7px 10px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.3)' }}>{t('Remarks')}</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s: PrintSubject, i: number) => {
            const e = entries.find((x: PrintEntry) => x.subjectId === s.id)
            return (
              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)` }}>
                <td style={{ padding: '6px 10px', border }}>{s.name}</td>
                {cfg.showSeq1 && <td style={{ padding: '6px 8px', textAlign: 'center', border }}>{e?.seq1Score ?? '—'}</td>}
                {cfg.showSeq2 && <td style={{ padding: '6px 8px', textAlign: 'center', border }}>{e?.seq2Score ?? '—'}</td>}
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', border }}>{e?.score ?? 0}</td>
                {cfg.showGrade && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', border }}>{entryGrade(e, bands)}</td>}
                {cfg.showRemarks && <td style={{ padding: '6px 10px', color: '#555', border }}>{entryRemark(e, bands)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border }}>
        <tbody>
          <tr>
            <td style={{ padding: '6px 10px', fontWeight: 'bold', width: '33%', border, backgroundColor: `rgba(${rgb},0.05)` }}>Total Score</td>
            <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{total}</td>
            {cfg.showAverage && <>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', border, backgroundColor: `rgba(${rgb},0.05)` }}>Average</td>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{average.toFixed(1)}</td>
            </>}
            {cfg.showPosition && <>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', border, backgroundColor: `rgba(${rgb},0.05)` }}>Position</td>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{position != null ? `${position}${classSize ? `/${classSize}` : ''}` : '—'}</td>
            </>}
          </tr>
        </tbody>
      </table>

      {annualAverage != null && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border }}>
          <tbody>
            <tr>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', width: '33%', border, backgroundColor: `rgba(${rgb},0.05)` }}>Annual Average</td>
              <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{annualAverage.toFixed(1)}</td>
              {annualPosition != null && <>
                <td style={{ padding: '6px 10px', fontWeight: 'bold', border, backgroundColor: `rgba(${rgb},0.05)` }}>Annual Position</td>
                <td style={{ padding: '6px 10px', fontWeight: 'bold', textAlign: 'center', border }}>{annualPosition}{annualClassSize ? `/${annualClassSize}` : ''}</td>
              </>}
            </tr>
          </tbody>
        </table>
      )}

      {cfg.showGeneralRemarks && (
        <div style={{ border, padding: '10px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px' }}>General Remarks / Observations Générales</div>
          <div style={{ minHeight: '36px' }}>{generalRemarks || generalRemarksFr || '—'}</div>
        </div>
      )}

      {sigLabels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sigLabels.length}, 1fr)`, gap: '16px', marginTop: '36px' }}>
          {sigLabels.map((label) => (
            <div key={label} style={{ textAlign: 'center', border, padding: '8px' }}>
              <div style={{ height: '40px', marginBottom: '6px', borderBottom: '1px solid #888' }} />
              <div style={{ fontSize: '11px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {cfg.footerText && (
        <div style={{ marginTop: '20px', borderTop: border, paddingTop: '8px', textAlign: 'center', fontSize: '11px', fontStyle: 'italic' }}>
          {cfg.footerText}
        </div>
      )}
    </div>
  )
}

// ─── Sections-based renderer ─────────────────────────────────────────────────
function SectionsRenderer(props: PrintableReportCardProps & { cfg: TemplateConfig }) {
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const { school, student, term, subjects, entries, generalRemarks, generalRemarksFr, average, position, classSize, classAverage, annualAverage, annualPosition, annualClassSize, cfg } = props
  const lang: 'EN' | 'FR' = school.language === 'FR' ? 'FR' : 'EN'
  const variant: DocVariant = props.variant ?? 'official'
  const sections = (cfg as any).sections as LayoutSection[]
  const color = cfg.primaryColor
  const rgb = hexToRgb(color)

  const resolveField = (field: string) => {
    const m: Record<string, string> = {
      'student.name': student.name,
      'student.studentId': student.studentId,
      'student.classLevel': student.classLevel,
      'student.guardianName': student.guardianName || '—',
      'student.gender': student.gender || '—',
      // Birth details are optional, so an unknown one prints BLANK rather than the '—'
      // used above: a dash reads as "none", and a transcript should not assert that a
      // student has no birthplace just because nobody typed it in.
      'student.dateOfBirth': formatBirthDate(student.dateOfBirth, lang),
      'student.placeOfBirth': student.placeOfBirth || '',
      'term.name': term.name,
      'term.session': term.session,
      'school.name': school.name,
    }
    return m[field] ?? field
  }

  const bands = props.gradeBands ?? []
  const classBands = props.classificationBands ?? DEFAULT_CLASSIFICATION_BANDS
  const subjectStats = props.subjectStats ?? {}

  // Semester GPA (university): Σ(grade point × credit) / Σ(credit) over graded
  // courses, computed from the actual marks so live cards match the seed. Credits
  // = credit hours attempted this semester (courses with a mark).
  const gpaInfo = (() => {
    let pts = 0, cr = 0
    for (const subj of subjects) {
      const e = entries.find(x => x.subjectId === subj.id)
      if (e?.score == null) continue
      const gp = gradePointForScore20(e.score, bands)
      if (gp == null) continue
      const c = subj.credit ?? 0
      pts += gp * c; cr += c
    }
    return { gpa: cr > 0 ? pts / cr : 0, credits: cr }
  })()
  const cgpa = props.cgpa ?? gpaInfo.gpa

  // ── Failing marks in red ─────────────────────────────────────────────────────
  // When the admin turns it on (school-wide — see TemplateConfig.highlightFailingRed),
  // every subject the student FAILED prints its numbers and its grade letter in red;
  // text cells (code, title, remark, jury decision) stay black and passed subjects are
  // untouched. Fail is judged on the school's OWN grading scale, so this needs no
  // school-type branching: the failing band is a mark /100 at a university and a
  // subject's term average /20 at a primary/secondary school.
  //
  // `score` is always the mark that COUNTS — for a resat university course the backend
  // stores CA + resit exam (see reportcard.controller.ts), so a resit that still falls
  // short is judged on the resit and correctly prints red.
  //
  // Shared by the marks table and the Resits appendix so the same course can't print
  // red in one and black in the other.
  const highlightRed = cfg.highlightFailingRed !== false
  const isFailedEntry = (e?: PrintEntry): boolean =>
    highlightRed && !!e && e.score != null && isFailingScore(e.score, bands)
  // Class-wide stats (min/avg/max) stay black on purpose — they describe the whole
  // class, not this student's result. 'sn' is a row index, not a mark.
  const FAIL_RED_COLS = new Set(['seq1', 'seq2', 'score', 'grade', 'coef', 'credit', 'gradePoint', 'weighted'])

  const resolveStat = (field: string) => {
    const total = entries.reduce((s, e) => s + e.score, 0)
    if (field === 'total')          return String(total)
    if (field === 'average')        return average.toFixed(1)
    if (field === 'position')       return position != null ? `${ordinalPos(position)}${classSize ? `/${classSize}` : ''}` : '—'
    if (field === 'classAverage')   return classAverage != null ? classAverage.toFixed(1) : '—'
    if (field === 'grade')          return calculateGrade((average / 20) * 100)
    if (field === 'gpa')            return gpaInfo.gpa.toFixed(2)
    if (field === 'cgpa')           return cgpa.toFixed(2)
    if (field === 'credits')        return String(gpaInfo.credits)
    if (field === 'classification') return classificationForGpa(cgpa, classBands)
    // General (non-stat) keys the sheet field picker offers — used by banner
    // rows like the Ledger's full-width term strip. Term is uppercased because
    // these always render as headings ("FIRST TERM"), never inline prose.
    if (field === 'term')           return t(term.name).toUpperCase()
    if (field === 'session')        return term.session
    if (field === 'student_name')   return student.name
    if (field === 'class')          return student.classLevel
    if (field === 'total_coeff')    return String(subjects.reduce((s, x) => s + (x.coefficient ?? 0), 0))
    return '—'
  }

  // Marks the OFFICIAL copy under the document title, on every layout and school type.
  // It is the answer to "how do I know this is the official one just by looking at it",
  // so it is automatic and not editable: a design must not be able to omit it or word it
  // into meaning the opposite. The stamp is separate, additional proof.
  //
  // The student copy is deliberately left BLANK rather than stamped "not official": the
  // everyday report card handed to a student is the ordinary document and shouldn't be
  // branded as a lesser one. Absence of the note is what makes it unofficial.
  const variantLabel = (align: 'left' | 'center' = 'center') => {
    if (variant !== 'official') return null
    return (
      <p style={{
        margin: '4px 0 0', fontSize: 9.5, fontWeight: 'bold', letterSpacing: 2,
        textTransform: 'uppercase', textAlign: align, color,
      }}>
        {t('Official Copy')}
      </p>
    )
  }

  const renderSec = (sec: LayoutSection) => {
    if (sec.type === 'header') {
      const s = sec as HeaderSec
      const logoSize = s.logoSize || 60
      const logoEl = school.logo ? <Logo url={school.logo} size={logoSize} color={color} /> : null

      const contactLine = buildOfficialContactLine(school, s)
      const contactLineEl = contactLine
        ? <p style={{ fontSize: 8.5, color: '#444', margin: '4px 0 0' }}>{contactLine}</p>
        : null

      // Official Cameroon-style header: left block | logo | right block, then the
      // authorization line (subtitle), the ruled contact strip, and the title.
      // Per-line styling (bold caps / big acronym / italic motto) comes from
      // officialTextBlockHtml — shared with the designer canvas so they can't
      // drift. The logo sits in the grid's own middle column (not absolutely
      // positioned) so it vertically centers against the text blocks at any size,
      // instead of hanging below them once it's larger than the text.
      if (s.officialHeader) {
        return (
          <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 12, marginBottom: 16 }}>
            {/* minmax(0, 1fr) — not bare 1fr — forces the two side columns to
                stay exactly equal width regardless of how much text either
                block holds; bare 1fr lets a wider block's min-content grow
                its track past the other's, pushing the logo off-center. */}
            <div style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${Math.max(logoSize, 40) + 16}px minmax(0, 1fr)`, gap: 16, alignItems: 'center' }}>
              <div dangerouslySetInnerHTML={{ __html: officialTextBlockHtml(resolveOfficialText(school, 'left', s.leftText || ''), 'left', officialTextScaleFor(s)) }} />
              <div style={{ display: 'flex', justifyContent: 'center' }}>{s.showLogo && logoEl}</div>
              <div dangerouslySetInnerHTML={{ __html: officialTextBlockHtml(resolveOfficialText(school, 'right', s.rightText || ''), 'right', officialTextScaleFor(s)) }} />
            </div>
            {(s.showAuthorization ?? true) && school.authorizationNumber && <p style={{ textAlign: 'center', fontFamily: OFFICIAL_HEADER_FONT, fontSize: 10, fontWeight: 'bold', color: '#333', margin: '2px 0 0' }}>{school.authorizationNumber}</p>}
            {contactLine && (
              <div style={{ borderTop: '1px solid #555', borderBottom: '1px solid #555', padding: '2px 0', marginTop: 5, textAlign: 'center', fontFamily: OFFICIAL_HEADER_FONT, fontSize: 10, fontWeight: 600, color: '#111' }}>
                {contactLine}
              </div>
            )}
            {s.reportTitle && <h2 style={{ fontSize: 14, fontWeight: 'bold', margin: '10px 0 0', letterSpacing: 3, color, textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: s.reportTitle }} />}
            {variantLabel('center')}
          </div>
        )
      }

      const textBlock = (
        <div style={{ flex: 1 }}>
          {s.showSchoolType && <p style={{ margin: '0 0 2px', fontSize: 11, color: s.schoolTypeColor || '#666', letterSpacing: 2, textTransform: 'uppercase' }}>{t(school.type)} {t('SCHOOL')}</p>}
          <h1 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 4px', color: s.schoolNameColor || color }}>{school.name}</h1>
          {s.subtitle && <p style={{ margin: '0 0 6px', fontSize: 12, color: '#555' }} dangerouslySetInnerHTML={{ __html: s.subtitle }} />}
          <h2 style={{ fontSize: 14, fontWeight: 'bold', margin: '8px 0 0', letterSpacing: 3, color }} dangerouslySetInnerHTML={{ __html: s.reportTitle }} />
          {variantLabel('left')}
          {contactLineEl}
        </div>
      )

      return (
        <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 16, marginBottom: 16 }}>
          {s.showLogo && logoEl && s.logoPosition === 'center' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{logoEl}</div>
              {textBlock}
            </div>
          ) : s.showLogo && logoEl && s.logoPosition === 'right' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{textBlock}{logoEl}</div>
          ) : s.showLogo && logoEl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{logoEl}{textBlock}</div>
          ) : (
            <div style={{ textAlign: 'center' }}>{textBlock}</div>
          )}
        </div>
      )
    }

    if (sec.type === 'student_info') {
      const s = sec as StudentInfoSec
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns}, 1fr)`, gap: '5px 12px', background: `rgba(${rgb},0.05)`, padding: 12, border: `1px solid rgba(${rgb},0.25)`, marginBottom: 16, fontSize: 12 }}>
          {s.rows.map(row => (
            <div key={row.id}>
              <span style={{ fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: localizeLabel(row.label, lang) + ':' }} />
              {' '}<span style={{ color: row.valueColor ?? undefined }}>{resolveField(row.field)}</span>
            </div>
          ))}
        </div>
      )
    }

    if (sec.type === 'marks_table') {
      const s = sec as MarksTableSec
      // Transcript only: this table's data comes from ONE specific semester (not the
      // document's combined top-level subjects/entries). If that semester hasn't
      // happened yet for this student, the table just has nothing to show.
      if (s.transcriptSemester && !props.transcriptSemesters?.[s.transcriptSemester]) return null
      const semData = s.transcriptSemester ? props.transcriptSemesters?.[s.transcriptSemester] : undefined
      const scopedSubjects = semData?.subjects ?? subjects
      const scopedEntries  = semData?.entries ?? entries
      // Caption naming the period this table covers — a transcript stacks two or three
      // identical-looking tables, so without it there's no way to tell which is which.
      // Prefer the term's real name (already localized by the school's own naming);
      // the slot's ordinal label is the fallback when the data doesn't carry one.
      const periodCaption = s.transcriptSemester ? (
        <div style={{
          fontWeight: 'bold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
          color: '#fff', backgroundColor: color, padding: '4px 8px', marginBottom: 0,
        }}>
          {t(semData?.term.name || transcriptPeriodLabel(s.transcriptSemester, school.type))}
        </div>
      ) : null
      // Sums for THIS period only, used by the footer fields below (statResolver).
      // University tables band on credits/grade points; primary/secondary term tables
      // band on coefficients and the term's own coefficient-weighted average — hence
      // both sets are computed here regardless of school type.
      const scopedAgg = s.transcriptSemester ? (() => {
        let credit = 0, mark = 0, gp = 0, wp = 0, coef = 0, weightedMark = 0
        for (const subj of scopedSubjects) {
          const e = scopedEntries.find(x => x.subjectId === subj.id)
          const c = subj.credit ?? 0
          const cf = subj.coefficient ?? 1
          const g = e?.score == null ? null : gradePointForScore20(e.score, bands)
          credit += c; mark += e?.score ?? 0
          if (g != null) { gp += g; wp += g * c }
          if (e?.score != null) { coef += cf; weightedMark += e.score * cf }
        }
        return { credit, mark, gp, wp, coef, weightedMark }
      })() : null
      const statResolver = (field: string): React.ReactNode => {
        if (scopedAgg) {
          if (field === 'credits')   return String(scopedAgg.credit)
          if (field === 'total')     return scopedAgg.mark % 1 === 0 ? String(scopedAgg.mark) : scopedAgg.mark.toFixed(1)
          if (field === 'gpTotal')   return scopedAgg.gp % 1 === 0 ? String(scopedAgg.gp) : scopedAgg.gp.toFixed(1)
          if (field === 'wpTotal')   return scopedAgg.wp.toFixed(2)
          if (field === 'gpa')       return (scopedAgg.credit > 0 ? scopedAgg.wp / scopedAgg.credit : 0).toFixed(2)
          if (field === 'coefTotal') return String(scopedAgg.coef)
          // Scoped to this period — the document-level 'average' is the ANNUAL one.
          if (field === 'average')   return (scopedAgg.coef > 0 ? scopedAgg.weightedMark / scopedAgg.coef : 0).toFixed(2)
        }
        return resolveStat(field)
      }
      const hdrs = s.headers || {}
      const cc   = s.colColors || {}
      const hText = (k: string, fallback: string) => {
        const h = hdrs[k]; if (!h) return fallback
        return h.replace(/<[^>]*>/g, '') // strip any color spans for print header text
      }
      const cols = marksColumnOrder(s)
      const META: Record<string, { fb: string; align: 'left' | 'center' }> = {
        subject: { fb: 'Subject', align: 'left' }, coef: { fb: 'Coef', align: 'center' },
        seq1: { fb: 'Seq 1', align: 'center' }, seq2: { fb: 'Seq 2', align: 'center' },
        score: { fb: 'Score', align: 'center' }, grade: { fb: 'Grade', align: 'center' },
        remarks: { fb: 'Remarks', align: 'left' },
        code: { fb: 'Code', align: 'center' }, credit: { fb: 'Credit', align: 'center' },
        gradePoint: { fb: 'GP', align: 'center' }, weighted: { fb: 'Weight', align: 'center' },
        evaluation: { fb: 'Evaluation', align: 'left' },
        juryDecision: { fb: 'Jury Decision', align: 'center' },
      }
      // Grade point (/4.0) + weighted point from the GPA grading scale (university).
      const gradePointOf = (e?: PrintEntry): number | null =>
        e?.score == null ? null : gradePointForScore20(e.score, bands)
      const courseCode = (subj: PrintSubject, i: number): string => {
        if (subj.code?.trim()) return subj.code.trim()
        const init = subj.name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 4)
        return `${init || 'C'}${String(i + 1).padStart(2, '0')}`
      }
      const evalForGpa = (gpa: number): string =>
        classificationForGpa(gpa, classBands).toUpperCase()
      // University only: a resat exam mark shows with an asterisk (* = mark obtained after resit).
      const renderSeq2 = (e?: PrintEntry): React.ReactNode =>
        e?.resitScore != null ? <>{e.resitScore}<sup>*</sup></> : (e?.seq2Score ?? '—')
      const renderScore = (e?: PrintEntry): React.ReactNode =>
        <>{e?.score ?? 0}{e?.resitScore != null ? <sup>*</sup> : null}</>

      const paintFail = (k: string, e: PrintEntry | undefined, node: React.ReactNode): React.ReactNode =>
        FAIL_RED_COLS.has(k) && isFailedEntry(e) ? <span style={{ color: FAIL_RED }}>{node}</span> : node

      const cellValue = (k: string, subj: PrintSubject, e: PrintEntry | undefined, i: number): React.ReactNode => {
        switch (k) {
          case 'subject':      return subj.name
          case 'coef':         return school.type === 'UNIVERSITY' ? '' : (subj.coefficient ?? '—')
          case 'seq1':         return e?.seq1Score ?? '—'
          case 'seq2':         return renderSeq2(e)
          case 'score':        return renderScore(e)
          case 'grade':        return entryGrade(e, bands)
          case 'remarks':      return entryRemark(e, bands)
          case 'code':         return courseCode(subj, i)
          case 'credit':       return subj.credit ?? '—'
          case 'gradePoint':   { const gp = gradePointOf(e); return gp == null ? '—' : gp.toFixed(1) }
          case 'weighted':     { const gp = gradePointOf(e); return gp == null ? '—' : (gp * (subj.credit ?? 0)).toFixed(1) }
          case 'evaluation':   { const gp = gradePointOf(e); return gp == null ? '—' : evalForGpa(gp) }
          case 'juryDecision': return !e ? 'FAIL' : juryDecisionForScore(e.score, bands)
          case 'min':          { const st = subjectStats[subj.id]; return st != null ? st.min.toFixed(1) : '—' }
          case 'avg':          { const st = subjectStats[subj.id]; return st != null ? st.avg.toFixed(1) : '—' }
          case 'max':          { const st = subjectStats[subj.id]; return st != null ? st.max.toFixed(1) : '—' }
          default: return ''
        }
      }
      const cell = (k: string, subj: PrintSubject, e: PrintEntry | undefined, i: number): React.ReactNode =>
        paintFail(k, e, cellValue(k, subj, e, i))

      // ── Template mode: SpreadsheetTable with _isDataRow repeat ───────────────
      if (s.template) {
        const tpl = s.template
        const dataRowIdx = tpl.rows.findIndex((r: SheetRow) => r._isDataRow)
        const headerRows = tpl.rows.slice(0, dataRowIdx >= 0 ? dataRowIdx : tpl.rows.length)
        const dataRowTpl = dataRowIdx >= 0 ? tpl.rows[dataRowIdx] : null
        const footerRows = dataRowIdx >= 0 ? tpl.rows.slice(dataRowIdx + 1) : []

        const resolveMarksField = (field: string, subj: PrintSubject, e: PrintEntry | undefined, si: number): React.ReactNode => {
          if (!field.startsWith('m:')) return resolveStat(field)
          const k = field.slice(2)
          // Same per-subject vocabulary as the non-template table above, plus 'sn'
          // (a row counter, which only the spreadsheet templates offer).
          const value = k === 'sn' ? String(si + 1) : cellValue(k, subj, e, si)
          return paintFail(k, e, value)
        }

        // Pixel widths for known narrow fields; flex fields (subject, subject_fr) get no width
        // so tableLayout:fixed distributes the remaining space to them automatically.
        const NARROW_PX: Record<string, number> = {
          'm:sn': 28, 'm:code': 44, 'm:seq1': 44, 'm:seq2': 44,
          'm:score': 50, 'm:grade': 40, 'm:gradePoint': 34,
          'm:credit': 38, 'm:coef': 38, 'm:weighted': 44,
          'm:min': 38, 'm:avg': 38, 'm:max': 38,
          'm:evaluation': 96,
          // Fixed (not flex) so the subject column takes all the slack and the
          // grade|remarks border sits close to the right edge — footer banner
          // rows (TERM AVERAGE / CLASS POSITION) end their labels at that same
          // border, so a mid-table border there sliced through the label text.
          'm:remarks': 110,
        }
        const FLEX_FIELDS = new Set(['m:subject', 'm:subject_fr'])
        // Fixed-width but prose-y: wrap to a second line rather than clipping.
        const WRAP_FIELDS = new Set(['m:remarks', 'm:evaluation'])

        const dataRowFields: string[] = dataRowTpl?.cells.map((c: SheetCell) => c.field ?? '') ?? []

        // ── Header text must stay inside its own column ─────────────────────────
        // A header word wider than its fixed column (e.g. "WEIGHTED" in the 44px
        // weighted-point column) doesn't wrap — it paints straight across the column
        // border, so the vertical rule appears to cut through the label. Headers are
        // freely renamable, so rather than hand-tuning NARROW_PX per label, widen each
        // fixed column to fit its own longest header word.
        //
        // The header font is Arial bold at HDR_FONT_PX. Per-character width is
        // deliberately over-estimated: measured uppercase Arial bold peaks around
        // 0.72em per character ("GRADE"), so 0.78em keeps a margin for wider labels
        // and font fallback. Over-reserving only costs slack from the flex column.
        const HDR_FONT_PX = 9
        const HDR_CHAR_EM = 0.78
        const HDR_PAD_PX  = 6 // 3px of padding either side
        const headerWordWidth = (text: string): number => {
          const longestWord = String(text).replace(/<[^>]*>/g, ' ').split(/\s+/)
            .reduce((max, w) => Math.max(max, w.length), 0)
          return Math.ceil(longestWord * HDR_CHAR_EM * HDR_FONT_PX + HDR_PAD_PX)
        }
        // Width each column needs for its own header. Only cells spanning a single
        // column pin to one column; a spanning cell's text is shared across several,
        // so it can't dictate any one column's width.
        const headerNeedByCol: number[] = []
        for (const row of headerRows) {
          let col = 0
          for (const c of row.cells) {
            if (c._consumed) continue
            const span = c.colSpan ?? 1
            if (span === 1 && !c.field && c.text)
              headerNeedByCol[col] = Math.max(headerNeedByCol[col] ?? 0, headerWordWidth(c.text))
            col += span
          }
        }

        const renderTplRow = (row: SheetRow, resolver: (f: string) => React.ReactNode, key?: string, isHdr = false) => (
          <tr key={key ?? row.id}>
            {row.cells.map((c: SheetCell, ci: number) => {
              if (c._consumed) return null
              const content = c.field ? resolver(c.field) : (c.text ?? '')
              // Determine column type from data-row field so header cells also benefit
              const colField = isHdr ? (dataRowFields[ci] ?? '') : (c.field ?? '')
              const isFlex   = FLEX_FIELDS.has(colField)
              return (
                <td key={ci} colSpan={c.colSpan ?? 1} rowSpan={c.rowSpan ?? 1}
                  style={{
                    padding: isHdr ? '4px 3px' : (isFlex ? '5px 6px' : '5px 4px'),
                    textAlign: c.align ?? (isFlex ? 'left' : 'center'),
                    fontWeight: c.bold ? 'bold' : 'normal',
                    fontStyle: c.italic ? 'italic' : 'normal',
                    textDecoration: c.underline ? 'underline' : 'none',
                    fontSize: isHdr ? (c.fontSize ?? 9) : (c.fontSize ?? 'inherit'),
                    backgroundColor: c.bgColor ?? 'transparent',
                    color: c.textColor ?? 'inherit',
                    border: '1px solid #d1d5db',
                    lineHeight: isHdr ? 1.2 : 1.4,
                    // Backstop for the column sizing above: a header can be renamed to
                    // anything, so keep its text inside its own cell no matter what
                    // rather than letting it paint over the column border.
                    ...(isHdr ? { overflowWrap: 'break-word' as const, overflow: 'hidden' as const } : {}),
                    // data cells in narrow cols stay on one line; clip any overflow
                    // (wrap-listed fields fold to a second line instead)
                    ...(!isHdr && !isFlex && !WRAP_FIELDS.has(colField) ? { whiteSpace: 'nowrap' as const, overflow: 'hidden' as const } : {}),
                  }}>
                  {content}
                </td>
              )
            })}
          </tr>
        )

        const colCount = tpl.colCount || (dataRowTpl?.cells.length ?? 1)
        return (
          <>
          {periodCaption}
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', marginBottom: 16, fontSize: colCount > 8 ? 10 : 12 }}>
            <colgroup>
              {dataRowFields.map((field, ci) => {
                const px = NARROW_PX[field]
                // Flex columns (no fixed width) absorb the slack and never clip, so
                // only fixed columns need widening to fit their header.
                if (!px) return <col key={ci} />
                return <col key={ci} style={{ width: `${Math.max(px, headerNeedByCol[ci] ?? 0)}px` }} />
              })}
            </colgroup>
            {headerRows.length > 0 && (
              <thead>
                {/* Rows above the data row can carry general field bindings too
                    (e.g. the Ledger's full-width term banner) — only per-subject
                    m:* keys are meaningless here and resolve to blank. */}
                {headerRows.map((row: SheetRow) => renderTplRow(row, f => f.startsWith('m:') ? '' : statResolver(f), undefined, true))}
              </thead>
            )}
            <tbody>
              {scopedSubjects.map((subj, si) => {
                if (!dataRowTpl) return null
                const e = scopedEntries.find(x => x.subjectId === subj.id)
                return renderTplRow(dataRowTpl, field => resolveMarksField(field, subj, e, si), `subj_${si}`)
              })}
              {footerRows.map((row: SheetRow) => renderTplRow(row, statResolver))}
            </tbody>
          </table>
          </>
        )
      }

      return (
        <>
        {periodCaption}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
          <thead>
            <tr style={{ backgroundColor: color }}>
              {cols.map(k => (
                <th key={k} style={{ padding: META[k].align === 'left' ? '7px 10px' : '7px 8px', textAlign: META[k].align, color: s.headerColor || '#fff' }}>
                  {hText(k, META[k].fb)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scopedSubjects.map((subj, i) => {
              const e = scopedEntries.find(x => x.subjectId === subj.id)
              return (
                <tr key={subj.id} style={{ background: i % 2 === 0 ? 'transparent' : `rgba(${rgb},0.04)`, borderBottom: '1px solid #e5e7eb' }}>
                  {cols.map(k => (
                    <td key={k} style={{ padding: META[k].align === 'left' ? '6px 10px' : '6px 8px', textAlign: META[k].align, fontWeight: k === 'score' || k === 'grade' ? 'bold' : undefined, color: cc[k] || (k === 'score' ? color : k === 'remarks' ? '#555' : undefined) }}>
                      {cell(k, subj, e, i)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
      )
    }

    if (sec.type === 'summary') {
      const s = sec as SummarySec
      return (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.boxes.length || 1}, 1fr)`, gap: 10, marginBottom: 16 }}>
            {s.boxes.map(box => {
              const boxLabel = box.field === 'gpa' ? `${term.name} GPA` : box.label
              return (
                <div key={box.id} style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: s.valueColor || color }}>{resolveStat(box.field)}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 3 }} dangerouslySetInnerHTML={{ __html: localizeLabel(boxLabel, lang) }} />
                </div>
              )
            })}
          </div>
          {/* Annual average/position: only present when this is the session's final
              term (non-university) — see reportcard.controller.ts getReportCard(s). */}
          {annualAverage != null && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${annualPosition != null ? 2 : 1}, 1fr)`, gap: 10, marginBottom: 16 }}>
              <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center', backgroundColor: `rgba(${rgb},0.05)` }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{annualAverage.toFixed(1)}</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{lang === 'FR' ? 'Moyenne Annuelle' : 'Annual Average'}</div>
              </div>
              {annualPosition != null && (
                <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center', backgroundColor: `rgba(${rgb},0.05)` }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{annualPosition}{annualClassSize ? `/${annualClassSize}` : ''}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{lang === 'FR' ? 'Rang Annuel' : 'Annual Position'}</div>
                </div>
              )}
            </div>
          )}
        </>
      )
    }

    if (sec.type === 'remarks') {
      const s = sec as RemarksSec
      return (
        <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 5, color }} dangerouslySetInnerHTML={{ __html: localizeLabel(s.label, lang) }} />
          <div style={{ minHeight: 36, color: '#444' }}>{generalRemarks || generalRemarksFr || '—'}</div>
        </div>
      )
    }

    if (sec.type === 'signatures') {
      const s = sec as SignaturesSec
      if (!s.lines.length) return null
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.lines.length}, 1fr)`, gap: 20, marginTop: 32, marginBottom: 16 }}>
          {s.lines.map(line => (
            <div key={line.id} style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #111', height: 40, marginBottom: 5 }} />
              <div style={{ fontSize: 11, color: '#555' }} dangerouslySetInnerHTML={{ __html: localizeLabel(line.label, lang) }} />
            </div>
          ))}
        </div>
      )
    }

    if (sec.type === 'text_block') {
      const s = sec as TextBlockSec
      return (
        <div style={{ textAlign: s.align, fontSize: 12, color: '#555', padding: '6px 0', borderTop: '1px solid #f1f5f9', marginBottom: 8 }}
          dangerouslySetInnerHTML={{ __html: s.content }}
        />
      )
    }

    if (sec.type === 'stamp') {
      const s = sec as StampSec
      // A school with no stamp prints nothing here, not an empty placeholder box: an
      // official copy is already marked by the "Official Copy" note under the title, and
      // a dashed box on a real document reads as a printing fault. Schools that stamp by
      // hand simply stamp the page. (The designer still shows a placeholder, so the
      // section can be found and uploaded to.)
      if (!school.stamp) return null
      const size = s.size || 110
      const justify = s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center'
      return (
        <div style={{ display: 'flex', justifyContent: justify, padding: '8px 0', marginBottom: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <img src={school.stamp} alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
            {s.label ? <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{t(s.label)}</div> : null}
          </div>
        </div>
      )
    }

    if (sec.type === 'grading_legend') {
      const s = sec as GradingLegendSec
      // University grading scales carry a gradePoint (/4.0) per band; a plain
      // secondary/primary scale doesn't, so it isn't filtered — every band is
      // shown as-is (grade, mark range, remark) with no GPA-specific columns.
      const isUniv    = bands.some(b => b.gradePoint != null)
      const gradeRows = isUniv
        ? [...bands].filter(b => b.gradePoint != null).sort((a, b) => b.minScore - a.minScore)
        : [...bands].sort((a, b) => b.minScore - a.minScore)
      const bandRows  = [...CLASSIFICATION_BANDS].sort((a, b) => b.min - a.min)
      const bHidCols: string[] = (s as any).hiddenCols ?? []
      const bHidRows: number[] = (s as any).hiddenRowIndices ?? []
      const vGrade  = ['grade','mark','gp'].filter(c => !bHidCols.includes(c))
      const pShowGS = s.showGradeSystem    && vGrade.length > 0
      const pShowCL = s.showClassification && !bHidCols.includes('classification')
      const lastGC  = vGrade[vGrade.length - 1] ?? ''
      const maxRows = Math.max(s.showGradeSystem ? gradeRows.length : 0, s.showClassification ? bandRows.length : 0)
      const sepR: React.CSSProperties = { borderRight: '1px solid #9ca3af' }
      const mCell: React.CSSProperties  = { padding: '2px 6px', fontSize: 10, borderBottom: '1px solid #eef2f7', borderRight: '1px solid #e5e7eb', textAlign: 'center' as const }
      const mCellL: React.CSSProperties = { ...mCell, textAlign: 'left' as const }
      const mHdr: React.CSSProperties   = { ...mCell,  fontWeight: 'bold', backgroundColor: `rgba(${rgb},0.08)` }
      const mHdrL: React.CSSProperties  = { ...mCellL, fontWeight: 'bold', backgroundColor: `rgba(${rgb},0.08)` }
      const leftLayout:  'columns' | 'rows' = (s as any).leftLayout  ?? 'columns'
      const rightLayout: 'columns' | 'rows' = (s as any).rightLayout ?? 'columns'

      // Migrate old MiniTable format → SpreadsheetTable on the fly
      const toSheet = (t: any): SpreadsheetTable => {
        if ('colCount' in t) return t as SpreadsheetTable
        return {
          id: t.id, title: t.title ?? '', colCount: 2,
          rows: (t.rows ?? []).map((r: any) => ({
            id: r.id ?? `pr_${r.label}`,
            cells: [{ text: r.label ?? '', bold: true, align: 'left' as const }, r.field ? { field: r.field as string } : { text: '' }],
          })),
        }
      }

      const builtinTable: SpreadsheetTable | null = (s as any).builtinTable ? toSheet((s as any).builtinTable) : null
      const leftTables:  SpreadsheetTable[] = ((s as any).leftTables  ?? []).map(toSheet)
      const rightTables: SpreadsheetTable[] = ((s as any).rightTables ?? []).map(toSheet)

      const renderSpreadsheet = (st: SpreadsheetTable, resolver: (f: string) => React.ReactNode) => (
        <table key={st.id} style={{ borderCollapse: 'collapse', border: `1px solid rgba(${rgb},0.3)`, flex: 1 }}>
          {st.title && (
            <thead>
              <tr><th colSpan={st.colCount} style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>{st.title}</th></tr>
            </thead>
          )}
          <tbody>
            {st.rows.map(row => (
              <tr key={row.id}>
                {row.cells.map((cell: SheetCell, ci: number) => {
                  if (cell._consumed) return null
                  const rawText = cell.text ?? ''
                  const resolvedText = /semester gpa/i.test(rawText) ? `${term.name} GPA` : rawText
                  const content = cell.field ? resolver(cell.field) : resolvedText
                  return (
                    <td key={ci} colSpan={cell.colSpan ?? 1} rowSpan={cell.rowSpan ?? 1}
                      style={{
                        ...mCell,
                        textAlign: cell.align ?? (ci === 0 ? 'left' : 'center'),
                        fontWeight: cell.bold ? 'bold' : 'normal',
                        fontStyle: cell.italic ? 'italic' : 'normal',
                        textDecoration: cell.underline ? 'underline' : 'none',
                        fontSize: cell.fontSize ?? 10,
                        backgroundColor: cell.bgColor ?? 'transparent',
                        color: cell.textColor ?? (cell.field ? color : 'inherit'),
                      }}>
                      {content}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )
      return (
        <div style={{ marginTop: 14, marginBottom: 12 }}>
          {s.title && <div style={{ fontWeight: 'bold', fontSize: 12, color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{s.title}</div>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* LEFT — built-in grade table + optional extra tables */}
            <div style={{ flex: '1.6', display: 'flex', flexDirection: leftLayout === 'rows' ? 'column' : 'row', gap: 8, alignItems: 'flex-start' }}>
            {builtinTable
              ? renderSpreadsheet(builtinTable, resolveStat)
              : (pShowGS || pShowCL) && maxRows > 0 && (
                <table style={{ borderCollapse: 'collapse', border: `1px solid rgba(${rgb},0.3)`, flex: 1 }}>
                  <thead>
                    <tr>
                      {pShowGS && <th colSpan={vGrade.length} style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'center', ...(pShowCL ? sepR : {}) }}>Grade System</th>}
                      {pShowCL && <th style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>Classification</th>}
                    </tr>
                    <tr>
                      {pShowGS && vGrade.includes('grade') && <th style={{ ...mHdr, ...(lastGC === 'grade' && pShowCL ? sepR : {}) }}>Grade</th>}
                      {pShowGS && vGrade.includes('mark')  && <th style={{ ...mHdr, ...(lastGC === 'mark'  && pShowCL ? sepR : {}) }}>Mark</th>}
                      {pShowGS && vGrade.includes('gp')    && <th style={{ ...mHdr, ...(lastGC === 'gp'    && pShowCL ? sepR : {}) }}>{isUniv ? 'GP' : 'Remark'}</th>}
                      {pShowCL && <th style={mHdrL}>GPA / Remark</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxRows }, (_, i) => i)
                      .filter(i => !bHidRows.includes(i))
                      .map(i => {
                        const gr = gradeRows[i], br = bandRows[i]
                        return (
                          <tr key={i}>
                            {pShowGS && vGrade.includes('grade') && <td style={{ ...mCell, fontWeight: gr ? 'bold' : 'normal', color: gr?.color ?? 'inherit', ...(lastGC === 'grade' && pShowCL ? sepR : {}) }}>{gr?.grade ?? ''}</td>}
                            {pShowGS && vGrade.includes('mark')  && <td style={{ ...mCell, ...(lastGC === 'mark'  && pShowCL ? sepR : {}) }}>{gr ? `${gr.minScore}–${gr.maxScore}` : ''}</td>}
                            {pShowGS && vGrade.includes('gp')    && <td style={{ ...mCell, ...(lastGC === 'gp'    && pShowCL ? sepR : {}) }}>{gr ? (isUniv ? (gr.gradePoint ?? 0).toFixed(1) : gr.remark) : ''}</td>}
                            {pShowCL && <td style={mCellL}>{br ? <>{br.min.toFixed(2)}–{br.max.toFixed(2)} / <strong>{br.label}</strong></> : ''}</td>}
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              )
            }
            {leftTables.map(st => renderSpreadsheet(st, resolveStat))}
            </div>
            {/* RIGHT — configurable spreadsheet tables (university only) */}
            {isUniv && rightTables.length > 0 && (
              <div style={{ flex: '1', display: 'flex', flexDirection: rightLayout === 'rows' ? 'column' : 'row', gap: 8 }}>
                {rightTables.map(st => renderSpreadsheet(st, resolveStat))}
              </div>
            )}
          </div>
          {s.showLegend && (
            <div style={{ fontSize: 10, color: '#555', marginTop: 8, lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: s.legendText || DEFAULT_TRANSCRIPT_LEGEND }} />
          )}
        </div>
      )
    }

    if (sec.type === 'divider') {
      const s = sec as DividerSec
      return <hr style={{ border: 'none', borderTop: `1px ${s.style} ${color}`, margin: '8px 0' }} />
    }

    return null
  }

  // University only: courses the student resat, listed for transparency — CA carries
  // over unchanged, the Exam column is the new (resit) mark, and Mark/Grade already
  // reflect the recalculated total (same numbers shown up in the main marks table).
  // Scoped per marks_table section — a transcript's two semester tables each get
  // only their own semester's resits, not a combined/duplicated list.
  const resitTh: React.CSSProperties = { padding: '5px 7px', border: '1px solid #999', fontWeight: 'bold', textAlign: 'center', fontSize: 10 }
  const resitTd: React.CSSProperties = { padding: '4px 7px', border: '1px solid #ccc', fontSize: 10, textAlign: 'center' }
  const renderResitAppendix = (subjList: PrintSubject[], entryList: PrintEntry[]) => {
    if (school.type !== 'UNIVERSITY') return null
    const resitEntries = entryList.filter(e => e.resitScore != null)
    if (resitEntries.length === 0) return null
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ backgroundColor: color, color: '#fff', padding: '5px 10px', fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{t('Resits')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: `rgba(${rgb},0.1)` }}>
              <th style={{ ...resitTh, textAlign: 'left' }}>{t('Course')}</th>
              <th style={resitTh}>CA</th>
              <th style={resitTh}>{t('Original Exam')}</th>
              <th style={resitTh}>{t('Resit Exam')}</th>
              <th style={resitTh}>{t('New Mark')}</th>
              <th style={resitTh}>{t('New Grade')}</th>
            </tr>
          </thead>
          <tbody>
            {resitEntries.map(e => {
              const subj = subjList.find(x => x.id === e.subjectId)
              // A resit can still fall short: `score` here is the post-resit mark, so a
              // course that failed even after resitting prints this row's figures red,
              // exactly as the marks table above does. The course name stays black.
              const failed = isFailedEntry(e)
              const num = failed ? { ...resitTd, color: FAIL_RED } : resitTd
              return (
                <tr key={e.subjectId}>
                  <td style={{ ...resitTd, textAlign: 'left' }}>{subj?.name ?? '—'}</td>
                  <td style={num}>{e.seq1Score ?? '—'}</td>
                  <td style={num}>{e.seq2Score ?? '—'}</td>
                  <td style={num}>{e.resitScore}<sup>*</sup></td>
                  <td style={{ ...num, fontWeight: 'bold' }}>{e.score}</td>
                  <td style={{ ...resitTd, fontWeight: 'bold', color: failed ? FAIL_RED : color }}>{entryGrade(e, bands)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ fontSize: 10, color: '#666', marginTop: 4 }}>* {t('Mark obtained after resit')}</p>
      </div>
    )
  }

  return (
    <div id="report-card-printable" style={{ fontFamily: 'Arial, sans-serif', padding: 40, maxWidth: 800, margin: '0 auto', color: '#111', fontSize: 13, position: 'relative', overflow: 'hidden', backgroundColor: cfg.bgColor || '#ffffff' }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} variant={variant} />
      {/* Sections scoped to the OTHER copy are dropped entirely — this is what makes one
          saved design print both the sealed official document and the student copy. */}
      {sections.filter(sec => sectionShowsOn(sec, variant)).map(sec => {
        const ts = sec.type === 'marks_table' ? (sec as MarksTableSec).transcriptSemester : undefined
        const resitSubjects = ts ? (props.transcriptSemesters?.[ts]?.subjects ?? []) : subjects
        const resitEntries  = ts ? (props.transcriptSemesters?.[ts]?.entries ?? []) : entries
        return (
          <div key={sec.id}>
            {renderSec(sec)}
            {sec.type === 'marks_table' && renderResitAppendix(resitSubjects, resitEntries)}
          </div>
        )
      })}
    </div>
  )
}

function calculateGrade(score: number) {
  // Fallback only — real grading uses the school's custom scale
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function PrintableReportCard(props: PrintableReportCardProps) {
  const cfg: TemplateConfig = { ...DEFAULT_CONFIG, ...props.config } as TemplateConfig

  // If sections-based layout saved → use it
  if ((cfg as any).sections?.length > 0) {
    return <SectionsRenderer {...props} cfg={cfg} />
  }

  const shared = { ...props, cfg }
  if (cfg.template === 'bilingual') return <Bilingual {...shared} />
  if (cfg.template === 'modern') return <Modern {...shared} />
  if (cfg.template === 'official') return <Official {...shared} />
  return <Classic {...shared} />
}
