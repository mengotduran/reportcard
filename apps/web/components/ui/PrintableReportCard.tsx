import { TemplateConfig, DEFAULT_CONFIG, LayoutSection, HeaderSec, StudentInfoSec, MarksTableSec, SummarySec, RemarksSec, SignaturesSec, TextBlockSec, DividerSec, GradingLegendSec, StampSec, ConductSec, AnnualBandSec, PanelRowSec, marksColumnOrder, CLASSIFICATION_BANDS, DEFAULT_TRANSCRIPT_LEGEND, MiniTable, SpreadsheetTable, SheetCell, SheetRow, buildOfficialContactLine, officialTextBlockHtml, officialTextScaleFor, resolveOfficialText, OFFICIAL_HEADER_FONT, TranscriptPeriod, transcriptPeriodLabel, DocVariant, sectionShowsOn, accentOf, parseHeaderLines, headerLineStyle, clampStudentPhotoSize, dropsPrimaryTotalsBands, isPrimaryRedundantTotalsRow } from '@/lib/api/reportCardTemplate'
import { GradeRange, ClassificationBand, DEFAULT_CLASSIFICATION_BANDS, gradePointForScore20, classificationForGpa, juryDecisionForScore, isFailingScore } from '@/lib/api/gradingScale'
import { gradeForScore20 } from '@/lib/grading'
import { stripProgrammeSuffix } from '@/lib/programme'
import { translate } from '@/lib/i18n'
import { CompetencyLevel, DEFAULT_COMPETENCY_LEVELS, findLevel, levelLabel } from '@/lib/competency'

export interface PrintEntry {
  subjectId: string
  /** null when the course has NO mark recorded, which is not the same as a mark of 0.
   *  Every GPA sum here skips nulls: a course whose marks simply have not been entered
   *  yet must not drag the average down by contributing its credits with zero points. */
  score: number | null
  seq1Score?: number | null
  seq2Score?: number | null
  resitScore?: number | null
  grade: string
  remarks: string
}

/** `maxScore` — the subject's own ceiling. Only PRIMARY reads it (its grading scale is
 *  written 0-100 while its classes may be marked out of anything); absent everywhere else. */
interface PrintSubject { id: string; name: string; code?: string | null; coefficient?: number; credit?: number; maxScore?: number }

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
  // Primary/secondary only (see FIELD_OPTIONS in the designer). Computed LIVE from
  // annualAverage + promotionScale (see decisionLabel in SectionsRenderer) — deliberately
  // NOT read from ReportCard.decision (the once-a-year endAcademicYear snapshot used only
  // by the admin's report-cards list pill). Printing must not wait for that batch action:
  // the moment a card has an annualAverage (i.e. it's the session's final/third term),
  // there's enough to show a live Pass/Trial/Repeat here. Same reason this only ever
  // renders when annualAverage is present — never on a First/Second Term card.
  promotionScale?: { trialMinimum: number | null; truePassMark: number; passLabel: string; trialLabel: string; repeatLabel: string } | null
  /** URL of the student's photo. Absent = the identity box's frame prints as a labelled
   *  empty rectangle instead, so the card's shape doesn't depend on who has a photo. */
  studentPhoto?: string | null
  /** Highest term average in this class+term, and the class's mean ANNUAL average. Both
   *  come from the API alongside classAverage; absent = the stat box prints a dash. */
  bestAverage?: number | null
  annualClassAverage?: number | null
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
  /**
   * How the CLASS is assessed (ClassLevel.gradingMode), not the school: one primary
   * school prints rated nursery cards and marked Class 1-6 cards from the SAME saved
   * design. COMPETENCY drops every column and every band that measures something —
   * scores, coefficients, totals, the average, the position, the grading legend — and
   * prints the rating in the grade column instead. Defaults to NUMERIC, so every
   * existing caller and every marked class is untouched.
   */
  gradingMode?: 'NUMERIC' | 'COMPETENCY'
  /**
   * The school's rating levels, for a COMPETENCY card. Passed in like `gradeBands` rather
   * than fetched here, so this stays a pure renderer and a print page makes one request.
   * Omitted = the built-in three, which is what an uncustomised school gets anyway.
   */
  competencyLevels?: CompetencyLevel[]
}

// Colour a failed subject's marks print in when the admin enables it school-wide.
const FAIL_RED = '#dc2626'

// Display face for the redesign's letterhead titles, ribbon title and the big figures in
// the stat boxes / End-of-Year band. Caladea is the mockup's own face (a Linux Cambria
// metric-match); Georgia and the generic serif keep it close to intent everywhere else.
const DISPLAY_SERIF = 'Caladea, Georgia, "Times New Roman", serif'

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/**
 * Does a resolved student_info field actually carry information?
 *
 * "Not recorded" arrives in two shapes: '' (birth details) and the '—' placeholder that
 * older fields like gender/guardian fall back to. Both mean the school has nothing to
 * print, so both hide the row. A dash is not a value; it is the absence of one dressed up.
 */
function hasValue(v: React.ReactNode): boolean {
  if (v == null) return false
  const s = String(v).trim()
  return s !== '' && s !== '—' && s !== '-'
}

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * An admin-authored label that MAY carry inline colour picked in the designer.
 *
 * The designer's text fields are contentEditable, so choosing a colour stores the text as
 * HTML (`<font color="…">` or a colour span). Fields rendered here as plain React children
 * printed that markup as literal characters or, once passed through `t()`, lost the colour
 * entirely — which is why colouring a title ribbon, a table caption or a panel heading
 * looked like it did nothing. Anything an admin can colour has to come through here.
 *
 * Translation still applies, on the TEXT rather than the markup (a translation key never
 * matches a string with tags in it). When the text needs no translating — every custom
 * title, i.e. almost always — the designer's exact markup is returned untouched, so a label
 * carrying two colours keeps both.
 */
function richLabel(value: string | undefined | null, t: (s: string) => string, lang: 'EN' | 'FR'): string {
  if (!value) return ''
  const hasMarkup = /<[a-z!/][^>]*>/i.test(value)
  const plain = hasMarkup ? value.replace(/<[^>]*>/g, '') : value
  const out = t(localizeLabel(plain, lang))
  if (!hasMarkup) return escapeHtml(out)
  if (out === plain) return value
  // Translated AND coloured: rebuild round the new words, keeping the first colour.
  const m = value.match(/color\s*[:=]\s*["']?([^;"'>]+)/i)
  return m ? `<span style="color:${m[1].trim()}">${escapeHtml(out)}</span>` : escapeHtml(out)
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

/**
 * `outOf` — PRIMARY only: the subject's own `maxScore`, so the mark is put onto the scale's
 * units before it is looked up. A primary grading scale is written 0-100 but a primary class
 * is marked out of whatever the admin set, so matching raw silently assumed every class was
 * out of 100: a subject marked out of 40 scored 36 printed an F for a clean 90%, while the
 * report card screen (which has always normalised) showed an A for the same mark.
 *
 * Left undefined everywhere else, which keeps the raw match secondary and university have
 * always used — a secondary mark and its 0-20 scale already share units, and so do a
 * university's /100 course and its 0-100 scale.
 */
function entryGrade(
  e: PrintEntry | undefined,
  bands: GradeRange[],
  lang: 'EN' | 'FR' = 'EN',
  outOf?: number,
  levels: CompetencyLevel[] = DEFAULT_COMPETENCY_LEVELS,
): string {
  // A competency (nursery) entry has no score at all — its rating IS the grade, stored
  // verbatim in English and rendered here, at print time. Checked before the score so
  // it prints on any layout, including the older non-section ones.
  //
  // findLevel, not a membership test: a card issued under an earlier scale must still print
  // the wording it was issued with rather than falling through to a dash.
  const level = findLevel(levels, e?.grade)
  if (level) return levelLabel(level, lang, (s) => translate(s, lang))
  if (!e || e.score == null) return '—'
  return gradeForScore20(onBandScale(e.score, bands, outOf), bands).grade || '—'
}
function entryRemark(e: PrintEntry | undefined, bands: GradeRange[], outOf?: number): string {
  if (!e || e.score == null) return '—'
  return gradeForScore20(onBandScale(e.score, bands, outOf), bands).remark || '—'
}

/** A mark expressed in the grading scale's own units. `outOf` absent = already there. */
function onBandScale(score: number, bands: GradeRange[], outOf?: number): number {
  if (!outOf || outOf <= 0) return score
  // The scale's top read from the bands themselves, exactly as lib/grading's gradeFromScore
  // reads it, so the printed card and the screen can never disagree about the ruler.
  const top = bands.some(b => b.maxScore > 20) ? 100 : 20
  return (score / outOf) * top
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
  /** This period's OWN average, straight off its report card (ReportCard.average). The
   *  one figure the rest of the app agrees on: it is what the card prints, what the list
   *  shows, what positions rank on and what the annual average is the mean of. The
   *  transcript used to re-derive it from the entries instead, which put a primary
   *  transcript on a different scale from that pupil's own report card. */
  average?: number | null
}

// ─── Classic ─────────────────────────────────────────────────────────────────
function Classic({ school, student, term, subjects, entries, generalRemarks, generalRemarksFr, average, position, classSize, annualAverage, annualPosition, annualClassSize, cfg, gradeBands }: any) {
  const bands: GradeRange[] = gradeBands ?? []
  // Primary marks are normalised onto the scale's units before being graded — see entryGrade.
  const isPrimaryCard = school.type === 'PRIMARY'
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + (e.score ?? 0), 0)
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
                <td style={cell({ textAlign: 'center', fontWeight: 'bold' })}>{e?.score ?? '—'}</td>
                {cfg.showGrade && <td style={cell({ textAlign: 'center', fontWeight: 'bold', color: cfg.primaryColor })}>{entryGrade(e, bands, school.language === 'FR' ? 'FR' : 'EN', isPrimaryCard ? s.maxScore : undefined)}</td>}
                {cfg.showRemarks && <td style={cell({ color: '#555' })}>{entryRemark(e, bands, isPrimaryCard ? s.maxScore : undefined)}</td>}
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
  // Primary marks are normalised onto the scale's units before being graded — see entryGrade.
  const isPrimaryCard = school.type === 'PRIMARY'
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + (e.score ?? 0), 0)
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
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #e5e7eb' }}>{e?.score ?? '—'}</td>
                {cfg.showGrade && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: cfg.primaryColor, borderRight: '1px solid #e5e7eb' }}>{entryGrade(e, bands, school.language === 'FR' ? 'FR' : 'EN', isPrimaryCard ? s.maxScore : undefined)}</td>}
                {cfg.showRemarks && <td style={{ padding: '6px 10px', color: '#555' }}>{entryRemark(e, bands, isPrimaryCard ? s.maxScore : undefined)}</td>}
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
  // Primary marks are normalised onto the scale's units before being graded — see entryGrade.
  const isPrimaryCard = school.type === 'PRIMARY'
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + (e.score ?? 0), 0)
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
                  <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: '700', color: cfg.primaryColor }}>{e?.score ?? '—'}</td>
                  {cfg.showGrade && <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                    <span style={{ backgroundColor: `rgba(${rgb},0.1)`, color: cfg.primaryColor, borderRadius: '4px', padding: '2px 10px', fontWeight: '600', fontSize: '12px' }}>{entryGrade(e, bands, school.language === 'FR' ? 'FR' : 'EN', isPrimaryCard ? s.maxScore : undefined)}</span>
                  </td>}
                  {cfg.showRemarks && <td style={{ padding: '9px 0', color: '#6b7280', fontSize: '12px' }}>{entryRemark(e, bands, isPrimaryCard ? s.maxScore : undefined)}</td>}
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
  // Primary marks are normalised onto the scale's units before being graded — see entryGrade.
  const isPrimaryCard = school.type === 'PRIMARY'
  const t = (en: string) => translate(en, school.language === 'FR' ? 'FR' : 'EN')
  const rgb = hexToRgb(cfg.primaryColor)
  const total = entries.reduce((s: number, e: PrintEntry) => s + (e.score ?? 0), 0)
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
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', border }}>{e?.score ?? '—'}</td>
                {cfg.showGrade && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', border }}>{entryGrade(e, bands, school.language === 'FR' ? 'FR' : 'EN', isPrimaryCard ? s.maxScore : undefined)}</td>}
                {cfg.showRemarks && <td style={{ padding: '6px 10px', color: '#555', border }}>{entryRemark(e, bands, isPrimaryCard ? s.maxScore : undefined)}</td>}
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
  // Secondary/metallic colour of the redesign (term chip, End-of-Year band, hairlines).
  // Read through accentOf so a design saved before accentColor existed still gets one.
  const accent = accentOf(cfg)
  const accentRgb = hexToRgb(accent)

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
  // Nursery: this card measures nothing. See the gradingMode prop for what that removes.
  const isCompetency = props.gradingMode === 'COMPETENCY'
  // The school's rating levels. The legacy (pre-redesign) layouts below keep the built-in
  // defaults: a school still on one of those has, by definition, not been through the
  // designer since custom scales existed.
  const competencyLevels = props.competencyLevels ?? DEFAULT_COMPETENCY_LEVELS
  // Primary Standard only: the marks table's totals bands duplicate the summary boxes.
  const dropTotalsBands = dropsPrimaryTotalsBands(school.type, cfg as { template?: string; layoutType?: string })
  // The columns a rated card has no value for. Everything else the design asks for
  // (row number, subject, subject_fr, grade) still prints, so the table keeps the
  // school's own look rather than becoming a second, unstyled table.
  const COMPETENCY_DROP_COLS = new Set([
    'coef', 'seq1', 'seq2', 'score', 'remarks', 'credit', 'gradePoint',
    'weighted', 'evaluation', 'juryDecision', 'min', 'avg', 'max',
  ])

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
  /**
   * Cumulative GPA, or null on a semester that does not close the academic year.
   *
   * NOT defaulted to this semester's own GPA. The fallback used to make a first-semester
   * card print its semester figure under a "CGPA" heading, which reads as a cumulative
   * standing the student does not have yet. A card that has no cumulative prints a dash.
   */
  const cgpa = props.cgpa ?? null

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
    const total = entries.reduce((s, e) => s + (e.score ?? 0), 0)
    // Document-level table totals. These previously resolved ONLY inside a transcript's
    // per-period table (statResolver's scopedAgg); on an ordinary card they fell through
    // and printed a dash, which is what the redesign's TOTALS band exposed.
    // Unmarked subjects are skipped, exactly as the average itself skips them.
    if (field === 'coefTotal' || field === 'wpTotal' || field === 'gpTotal') {
      let coef = 0, wp = 0, gp = 0
      for (const subj of subjects) {
        const e = entries.find(x => x.subjectId === subj.id)
        if (e?.score == null) continue
        if (school.type === 'UNIVERSITY') {
          const g = gradePointForScore20(e.score, bands)
          if (g != null) { gp += g; wp += g * (subj.credit ?? 0) }
        } else {
          coef += subj.coefficient ?? 1
          wp += e.score * (subj.coefficient ?? 1)
        }
      }
      if (field === 'coefTotal') return String(coef)
      if (field === 'gpTotal')   return gp % 1 === 0 ? String(gp) : gp.toFixed(1)
      return wp.toFixed(2)
    }
    if (field === 'total')          return String(total)
    if (field === 'average')        return average.toFixed(1)
    if (field === 'position')       return position != null ? `${ordinalPos(position)}${classSize ? `/${classSize}` : ''}` : '—'
    if (field === 'classAverage')   return classAverage != null ? classAverage.toFixed(1) : '—'
    // Only a UNIVERSITY average is already a raw 0-100 mark. Primary's is normalised to /20
    // (like secondary's) even though its individual subjects are marked on a raw scale — see
    // saveEntries — so it scales up to the 0-100 range calculateGrade expects, exactly as
    // secondary's does. Leaving primary on the university branch read a perfectly good
    // 13.9/20 as 13.9/100, i.e. an F.
    if (field === 'grade')          return calculateGrade(school.type === 'UNIVERSITY' ? average : (average / 20) * 100)
    if (field === 'classSize')      return classSize != null ? String(classSize) : '—'
    // Annual figures: present only on the session's FINAL term (see annualAverage in
    // reportcard.controller.ts), so these dash out on a First/Second Term card.
    if (field === 'annualAverage')  return annualAverage != null ? annualAverage.toFixed(2) : '—'
    if (field === 'annualPosition') return annualPosition != null ? `${ordinalPos(annualPosition)}${annualClassSize ? `/${annualClassSize}` : ''}` : '—'
    if (field === 'annualClassAverage') return props.annualClassAverage != null ? props.annualClassAverage.toFixed(2) : '—'
    if (field === 'bestAverage')    return props.bestAverage != null ? props.bestAverage.toFixed(2) : '—'
    // The school's OWN wording for this term's average, taken from its grading scale —
    // matched on the band's lower bound, the same convention isFailingScore uses (a
    // coefficient-weighted average is fractional and falls through min..max containment).
    //
    // Normalised onto the BANDS' own units first, which is not always the average's own.
    // A primary school marks its subjects on a raw scale (so its bands run 0-100) but
    // states the average out of 20 — matching one against the other directly dropped every
    // primary average into the bottom band, printing "Fail" on a card averaging 13.9/20.
    if (field === 'appreciation') {
      const bandScale = bands.some((b) => b.maxScore > 20) ? 100 : 20
      const avgScale = school.type === 'UNIVERSITY' ? 100 : 20
      const scoreForBands = (average / avgScale) * bandScale
      const band = [...bands].sort((a, b) => b.minScore - a.minScore).find(b => scoreForBands >= b.minScore)
      return band?.remark?.trim() || '—'
    }
    if (field === 'gpa')            return gpaInfo.gpa.toFixed(2)
    // Dash, not this semester's GPA: a card that closes no year has no cumulative.
    if (field === 'cgpa')           return cgpa == null ? '—' : cgpa.toFixed(2)
    if (field === 'credits')        return String(gpaInfo.credits)
    // Bands the cumulative once there is one, otherwise this semester's own GPA, so it
    // always describes a figure that appears on the card. Only 'cgpa' itself dashes out.
    if (field === 'classification') return classificationForGpa(cgpa ?? gpaInfo.gpa, classBands)
    // Primary/secondary only, and only when there's an annualAverage to judge — which
    // itself only exists on the session's final (third) term's card (see annualAverage
    // in reportcard.controller.ts). Computed LIVE right here rather than read off
    // ReportCard.decision: that field is a once-a-year snapshot written by
    // endAcademicYear for the admin's report-cards list, and printing must not wait on
    // that batch action — the moment the annual average is knowable, so is this.
    if (field === 'decision') {
      const ps = props.promotionScale
      if (annualAverage == null || !ps) return '—'
      if (annualAverage >= ps.truePassMark) return ps.passLabel
      if (ps.trialMinimum != null && annualAverage >= ps.trialMinimum) return ps.trialLabel
      return ps.repeatLabel
    }
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

  // Set true once the Decision stat has actually been rendered inside a 'summary'
  // section's box row (next to Average/Position) — lets the fallback below (for layouts
  // like the transcript's default, which has no 'summary' section at all) know whether it
  // still needs to render its own copy, so a layout with BOTH never shows it twice.
  let decisionRendered = false

  // The redesign carries the annual figures (and the Decision) in its own End-of-Year
  // band, so the summary section must not ALSO append its built-in annual rows or a
  // Decision box — that would print each of them twice on the same card. Scans nested
  // panel_row children too, since a band could be moved into one.
  const allSections = ((): LayoutSection[] => {
    const flat: LayoutSection[] = []
    const walk = (list: LayoutSection[]) => list.forEach(s => {
      flat.push(s)
      if (s.type === 'panel_row') walk((s as PanelRowSec).children)
    })
    walk(sections ?? [])
    return flat
  })()
  const annualBands = allSections.filter(s => s.type === 'annual_band') as AnnualBandSec[]
  const hasAnnualBand = annualBands.length > 0
  const annualBandHasDecision = annualBands.some(b => b.cells.some(c => c.field === 'decision'))
  // Is this the 2026 house design? Detected from the sections themselves (a redesign
  // letterhead) rather than a stored flag, so a design saved before the redesign — or one
  // an admin has rebuilt out of the old sections — keeps its original page styling.
  const isRedesign = allSections.some(s => s.type === 'header' && !!(s as HeaderSec).headerStyle)

  const renderSec = (sec: LayoutSection): React.ReactNode => {
    if (sec.type === 'header') {
      const s = sec as HeaderSec
      const logoSize = s.logoSize || 60
      const logoEl = school.logo ? <Logo url={school.logo} size={logoSize} color={color} /> : null

      const contactLine = buildOfficialContactLine(school, s)
      const contactLineEl = contactLine
        ? <p style={{ fontSize: 8.5, color: '#444', margin: '4px 0 0' }}>{contactLine}</p>
        : null

      // ── Redesign letterheads ────────────────────────────────────────────────
      // Shared between both styles: the ruled contact strip and the dark title ribbon
      // with the term/session chip on its right.
      if (s.headerStyle === 'crest' || s.headerStyle === 'logo') {
        const contactStrip = s.showContactLine !== false && contactLine ? (
          <div style={{ marginTop: 8, borderTop: `1.6px solid ${color}`, borderBottom: `.6px solid ${accent}`, padding: '4px 0', textAlign: 'center', fontSize: 7.8, color: '#5b6472', letterSpacing: .5 }}>
            {contactLine}
          </div>
        ) : null
        const titleRibbon = s.showTitleRibbon !== false ? (
          <div style={{ display: 'flex', marginTop: 10, border: `1px solid ${color}` }}>
            <div style={{ flex: 1, background: color, color: '#fff', textAlign: 'center', padding: '6px 0', fontFamily: DISPLAY_SERIF, fontSize: 13, letterSpacing: 5, fontWeight: 'bold' }}
              dangerouslySetInnerHTML={{ __html: richLabel(s.reportTitle, t, lang) }} />
            <div style={{ background: s.termChipColor || accent, color: s.termChipTextColor || '#fff', padding: '6px 12px', fontSize: 9.2, letterSpacing: 1.5, fontWeight: 'bold', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              {t(term.name)} · {term.session}
            </div>
          </div>
        ) : null

        if (s.headerStyle === 'crest') {
          // Three columns: the school's own bilingual block, the crest, the ministry's.
          // Each column stacks its ENGLISH text, a small gold rule, then its FRENCH text
          // in italic — which is exactly how the officialLeftText{En,Fr} /
          // officialRightText{En,Fr} pairs in School Settings are already stored, so both
          // languages print at once instead of the renderer picking one.
          //
          // Line roles are inferred rather than configured: the first line is the title,
          // an explicitly <b>/<i>-marked line wins, and after that an ALL-CAPS line is a
          // heading while a mixed-case one is a motto ("Peace-Work-Fatherland"). That
          // matches how these fields are filled in practice with no extra settings.
          const headerLines = (raw: string, italic: boolean) =>
            parseHeaderLines(raw).map((line, i) => (
              <div key={i} style={{ ...headerLineStyle(line.role, color) as React.CSSProperties, ...(italic ? { fontStyle: 'italic' } : {}) }}>
                {line.text}
              </div>
            ))
          const goldRule = (
            <div style={{ width: 78, height: 1, margin: '5px auto', background: `linear-gradient(90deg, rgba(${accentRgb},0), ${accent}, rgba(${accentRgb},0))` }} />
          )
          const sideColumn = (en: string, fr: string, reg?: string | null) => {
            // A school that hasn't filled its letterhead in yet still gets a header that
            // names it, rather than a column of empty space next to the crest.
            const hasAny = en.trim() || fr.trim()
            return (
              <div style={{ flex: 1, textAlign: 'center', paddingTop: 2 }}>
                {hasAny ? (
                  <>
                    {en.trim() && <div style={{ lineHeight: 1.28 }}>{headerLines(en, false)}</div>}
                    {en.trim() && fr.trim() && goldRule}
                    {fr.trim() && <div style={{ lineHeight: 1.28 }}>{headerLines(fr, true)}</div>}
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: DISPLAY_SERIF, fontSize: 11, fontWeight: 'bold', letterSpacing: .5, color, textTransform: 'uppercase' }}>{school.name}</div>
                    {s.showSchoolType && (
                      <div style={{ fontSize: 8.4, fontWeight: 'bold', letterSpacing: .5, color: '#33415c', textTransform: 'uppercase' }}>
                        {t(school.type)} {t('Section')}
                      </div>
                    )}
                  </>
                )}
                {reg && <div style={{ fontSize: 7, color: '#8b93a1', letterSpacing: .6, marginTop: 5 }}>{reg}</div>}
              </div>
            )
          }
          const authLine = s.showAuthorization !== false && school.authorizationNumber
            ? `${t('Authorisation N°')} ${school.authorizationNumber}` : null
          return (
            <div style={{ marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {sideColumn(school.officialLeftTextEn || '', school.officialLeftTextFr || '', authLine)}
                <div style={{ flex: `0 0 ${Math.max(logoSize, 40) + 16}px`, textAlign: 'center' }}>{s.showLogo && logoEl}</div>
                {sideColumn(school.officialRightTextEn || '', school.officialRightTextFr || '', null)}
              </div>
              {contactStrip}
              {titleRibbon}
              {variantLabel('center')}
            </div>
          )
        }

        // 'logo': thin bilingual republic strip, then the school name with its logo left.
        return (
          <div style={{ marginBottom: 2 }}>
            {s.showRepublicStrip !== false && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7.4, letterSpacing: .9, textTransform: 'uppercase', color: '#6b7280', borderBottom: `.6px solid rgba(${accentRgb},0.45)`, paddingBottom: 4 }}>
                <span><b style={{ color }}>Republic of Cameroon</b> · Peace – Work – Fatherland</span>
                <span>République du Cameroun · <b style={{ color }}>Paix – Travail – Patrie</b></span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0 8px' }}>
              <div style={{ flex: `0 0 ${logoSize}px` }}>{s.showLogo && logoEl}</div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 25, letterSpacing: 1.4, color, lineHeight: 1.05, fontWeight: 'bold' }}>{school.name}</div>
                {s.showSchoolType && (
                  <div style={{ fontSize: 9.2, letterSpacing: 4.2, color: s.schoolTypeColor || accent, fontWeight: 'bold', textTransform: 'uppercase', marginTop: 3 }}>
                    {t(school.type)} {t('Section')}
                  </div>
                )}
                {s.subtitle && <div style={{ fontSize: 7, color: '#8b93a1', marginTop: 2 }} dangerouslySetInnerHTML={{ __html: s.subtitle }} />}
              </div>
              <div style={{ flex: `0 0 ${logoSize}px` }} />
            </div>
            {contactStrip}
            {titleRibbon}
            {variantLabel('center')}
          </div>
        )
      }

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
      // A row with nothing to show is dropped entirely, label and all: printing
      // "Place of Birth:" followed by blank space states that the school holds no
      // birthplace for this student, when in truth nobody typed one in. The label only
      // earns its place once there is a value behind it, so the same design prints a
      // full header for a student with complete details and a shorter one for a student
      // without, instead of a row of empty prompts.
      const filled = s.rows.filter(row => hasValue(resolveField(row.field)))
      // Every row empty means an empty bordered box, so the section stands down too.
      // The photo frame alone is not reason enough to print the box.
      if (filled.length === 0) return null

      // ── Redesign: ruled identity box, optionally with the photo frame beside it ──
      if (s.boxed) {
        const rows = (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${s.columns}, 1fr)`, gap: '4px 16px', background: '#f7f5ef', border: `.8px solid rgba(${rgb},0.28)`, padding: '8px 10px' }}>
            {filled.map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 9.4 }}>
                <span style={{ fontSize: 7.3, letterSpacing: .9, textTransform: 'uppercase', color: '#7a8290', minWidth: 74, fontWeight: 'bold' }}
                  dangerouslySetInnerHTML={{ __html: localizeLabel(row.label, lang) }} />
                <span style={{ fontWeight: 'bold', color: row.valueColor ?? '#14213d', borderBottom: '.6px dotted #b9c0ca', flex: 1, paddingBottom: 1 }}>
                  {resolveField(row.field)}
                </span>
              </div>
            ))}
          </div>
        )
        // School-wide toggle (TemplateConfig.showStudentPhoto), not per-section — see the
        // designer's toolbar. Undefined/true = shown.
        if (cfg.showStudentPhoto === false) return <div style={{ marginBottom: 11 }}>{rows}</div>
        // The frame prints either way: with the photo when one is on file, as a labelled
        // empty rectangle when not, so the card keeps its shape for every student.
        const photoSize = clampStudentPhotoSize(cfg.studentPhotoSize)
        return (
          <div style={{ display: 'flex', gap: 9, marginBottom: 11, alignItems: 'stretch' }}>
            {rows}
            <div style={{ width: photoSize, border: `.8px solid rgba(${rgb},0.28)`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden' }}>
              {props.studentPhoto
                ? <img src={props.studentPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <span style={{ fontSize: 6.6, letterSpacing: .7, color: '#a6aeba', textTransform: 'uppercase', lineHeight: 1.5 }}>
                    {t('Student')}<br />{t('Photo')}
                  </span>}
            </div>
          </div>
        )
      }

      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns}, 1fr)`, gap: '5px 12px', background: `rgba(${rgb},0.05)`, padding: 12, border: `1px solid rgba(${rgb},0.25)`, marginBottom: 16, fontSize: 12 }}>
          {filled.map(row => (
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
      ) : s.caption ? (
        // Redesign: small-caps caption with a rule running off to the right. `{term}` is
        // substituted so one saved caption reads correctly on every term's card.
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '11px 0 5px', fontSize: 8, letterSpacing: 2.6, textTransform: 'uppercase', color, fontWeight: 'bold' }}>
          <span dangerouslySetInnerHTML={{ __html: richLabel(s.caption, t, lang).replace(/\{term\}/gi, t(term.name)) }} />
          <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}, rgba(${accentRgb},0.15))` }} />
        </div>
      ) : null
      // Sums for THIS period only, used by the footer fields below (statResolver).
      // University tables band on credits/grade points; primary/secondary term tables
      // band on coefficients and the term's own coefficient-weighted average — hence
      // both sets are computed here regardless of school type.
      const scopedAgg = s.transcriptSemester ? (() => {
        let credit = 0, gpaCredit = 0, mark = 0, gp = 0, wp = 0, coef = 0, weightedMark = 0, filled = 0
        for (const subj of scopedSubjects) {
          const e = scopedEntries.find(x => x.subjectId === subj.id)
          const c = subj.credit ?? 0
          const cf = subj.coefficient ?? 1
          const g = e?.score == null ? null : gradePointForScore20(e.score, bands)
          mark += e?.score ?? 0
          // Two different credit totals on purpose (DOCUMENTATION.md steps 3 and 5):
          //   credit    every course REGISTERED this semester, which is what the printed
          //             "Credits" statistic reports, marked or not.
          //   gpaCredit only courses that actually carry a mark, which is the GPA's
          //             denominator. Using the registered total there made the semester
          //             GPA understate itself by exactly the credits of any course whose
          //             marks had not been entered yet.
          credit += c
          if (g != null) { gpaCredit += c; gp += g; wp += g * c }
          if (e?.score != null) { coef += cf; weightedMark += e.score * cf; filled++ }
        }
        return { credit, gpaCredit, mark, gp, wp, coef, weightedMark, filled }
      })() : null
      const isPrimary = school.type === 'PRIMARY'
      const statResolver = (field: string): React.ReactNode => {
        if (scopedAgg) {
          if (field === 'credits')   return String(scopedAgg.credit)
          if (field === 'total')     return scopedAgg.mark % 1 === 0 ? String(scopedAgg.mark) : scopedAgg.mark.toFixed(1)
          if (field === 'gpTotal')   return scopedAgg.gp % 1 === 0 ? String(scopedAgg.gp) : scopedAgg.gp.toFixed(1)
          // University bands on grade-point × credit; secondary on avg × coefficient
          // (subjects here carry a coefficient, not credit hours — scopedAgg.wp is always
          // credit-based, so it silently zeroed out for non-university until this branch).
          // Primary has no coefficient weighting at all — see the 'average' branch below.
          if (field === 'wpTotal')   return (school.type === 'UNIVERSITY' ? scopedAgg.wp : scopedAgg.weightedMark).toFixed(2)
          if (field === 'gpa')       return (scopedAgg.gpaCredit > 0 ? scopedAgg.wp / scopedAgg.gpaCredit : 0).toFixed(2)
          if (field === 'coefTotal') return String(scopedAgg.coef)
          // Scoped to this period — the document-level 'average' is the ANNUAL one.
          //
          // The card's OWN stored average, never a figure re-derived here. Primary's
          // subjects are marked raw out of the class's ceiling but its average is
          // coefficient-weighted and normalised to /20 (see saveEntries and
          // [[primary_average_always_20]]); the plain mean of subject totals this used to
          // print put the transcript on a /100 scale while the pupil's own report card,
          // the report cards list and the position ranking were all on /20 — one pupil
          // reading 77.60 here and 15.5 there for the same term.
          //
          // Falling back to the derived figure only covers a card whose average was never
          // computed (nothing to disagree with in that case).
          //
          // One decimal outside a university, matching the report card's own TERM AVERAGE
          // and the report cards list. Two never fitted: the hero cell is a narrow numeric
          // column at 15px, so "16.34" printed as "16.3" with the 4 cut off by the border.
          if (field === 'average') {
            const dp = school.type === 'UNIVERSITY' ? 2 : 1
            if (semData?.average != null) return semData.average.toFixed(dp)
            return isPrimary
              ? (scopedAgg.filled > 0 ? scopedAgg.mark / scopedAgg.filled : 0).toFixed(dp)
              : (scopedAgg.coef > 0 ? scopedAgg.weightedMark / scopedAgg.coef : 0).toFixed(dp)
          }
        }
        return resolveStat(field)
      }
      const hdrs = s.headers || {}
      const cc   = s.colColors || {}
      const hText = (k: string, fallback: string) => {
        const h = hdrs[k]; if (!h) return fallback
        return h.replace(/<[^>]*>/g, '') // strip any color spans for print header text
      }
      // A rated card keeps only the columns that say something about a child: the subject
      // and its rating. If the design never had a grade column (it was showing marks
      // instead), one is added — otherwise the table would print subject names and
      // nothing else.
      const cols = (() => {
        const kept = marksColumnOrder(s).filter(k => !isCompetency || !COMPETENCY_DROP_COLS.has(k))
        return isCompetency && !kept.includes('grade') ? [...kept, 'grade'] : kept
      })()
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
      // Dash, not 0, when nothing was marked: a printed 0 is a mark the student scored, and
      // this row is a course they did not sit. Matches the CA/Exam cells beside it.
      const renderScore = (e?: PrintEntry): React.ReactNode =>
        e?.score == null ? <>—</> : <>{e.score}{e.resitScore != null ? <sup>*</sup> : null}</>

      const paintFail = (k: string, e: PrintEntry | undefined, node: React.ReactNode): React.ReactNode =>
        FAIL_RED_COLS.has(k) && isFailedEntry(e) ? <span style={{ color: FAIL_RED }}>{node}</span> : node

      const cellValue = (k: string, subj: PrintSubject, e: PrintEntry | undefined, i: number): React.ReactNode => {
        switch (k) {
          case 'subject':      return subj.name
          case 'coef':         return school.type === 'UNIVERSITY' ? '' : (subj.coefficient ?? '—')
          case 'seq1':         return e?.seq1Score ?? '—'
          case 'seq2':         return renderSeq2(e)
          case 'score':        return renderScore(e)
          case 'grade':        return entryGrade(e, bands, lang, isPrimary ? subj.maxScore : undefined, competencyLevels)
          case 'remarks':      return entryRemark(e, bands, isPrimary ? subj.maxScore : undefined)
          case 'code':         return courseCode(subj, i)
          case 'credit':       return subj.credit ?? '—'
          case 'gradePoint':   { const gp = gradePointOf(e); return gp == null ? '—' : gp.toFixed(1) }
          // University: grade point × credit. Everyone else: the subject's contribution to
          // the coefficient-weighted average, i.e. its mark × its coefficient — which is
          // what the redesign's "Avg × Coef" column shows and what the TOTALS band sums.
          case 'weighted': {
            if (school.type !== 'UNIVERSITY') {
              return e?.score == null ? '—' : (e.score * (subj.coefficient ?? 1)).toFixed(2)
            }
            const gp = gradePointOf(e); return gp == null ? '—' : (gp * (subj.credit ?? 0)).toFixed(1)
          }
          case 'evaluation':   { const gp = gradePointOf(e); return gp == null ? '—' : evalForGpa(gp) }
          // A course with NO marks gets a dash, not FAIL. The student did not sit it, so
          // there is no decision to report, and printing FAIL beside a row of dashes read
          // as a verdict on an exam nobody took. A course with even one component marked
          // does get a real decision, because it now has a real total.
          case 'juryDecision': return !e || e.score == null ? '—' : juryDecisionForScore(e.score, bands)
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
        const rawHeaderRows = tpl.rows.slice(0, dataRowIdx >= 0 ? dataRowIdx : tpl.rows.length)
        const rawDataRowTpl = dataRowIdx >= 0 ? tpl.rows[dataRowIdx] : null
        const rawFooterRows = dataRowIdx >= 0 ? tpl.rows.slice(dataRowIdx + 1) : []

        // ── Nursery: take the measuring columns out of the SAVED design ──────────
        // A spreadsheet template places cells by column, so dropping a column means
        // dropping the cell at that index in every row and narrowing any header cell
        // that spanned it. The footer bands go entirely: TOTAL, TERM AVERAGE and CLASS
        // POSITION are all figures a rated card does not have.
        const dropCols = new Set<number>()
        if (isCompetency) {
          (rawDataRowTpl?.cells ?? []).forEach((c: SheetCell, i: number) => {
            const f = c.field ?? ''
            if (f.startsWith('m:') && COMPETENCY_DROP_COLS.has(f.slice(2))) dropCols.add(i)
          })
        }
        const stripRow = (row: SheetRow): SheetRow => {
          if (dropCols.size === 0) return row
          const cells: SheetCell[] = []
          let col = 0
          for (const c of row.cells) {
            // A cell covered by a rowSpan from above occupies no column of its own here
            // (the renderer skips it), so it neither shifts the count nor gets dropped.
            if (c._consumed) { cells.push(c); continue }
            const span = c.colSpan ?? 1
            let dropped = 0
            for (let i = col; i < col + span; i++) if (dropCols.has(i)) dropped++
            if (dropped < span) cells.push(dropped > 0 ? { ...c, colSpan: span - dropped } : c)
            col += span
          }
          return { ...row, cells }
        }
        const headerRows = rawHeaderRows.map(stripRow)
        const dataRowTpl = rawDataRowTpl ? stripRow(rawDataRowTpl) : null
        // Primary Standard repeats its term average in the summary boxes just below this
        // table, so the OVERALL TOTAL / TERM AVERAGE bands come out here too — not only
        // from the default — or a school that saved its design before the default changed
        // would go on printing both. See dropsPrimaryTotalsBands for why Ledger is exempt.
        const footerRows = isCompetency
          ? []
          : dropTotalsBands
            ? rawFooterRows.filter((r: SheetRow) => !isPrimaryRedundantTotalsRow(r))
            : rawFooterRows

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
          // A rated card puts a WORD in the grade column, not a letter. 40px fits "B+";
          // "Attained" measured 66px and "Not Yet Attained" 120px, and the cell is
          // white-space:nowrap, so both were being cut off mid-word on every nursery card.
          // Safe to take the width here: a rated table is only S/N + Subject + Grade, and
          // Subject is a flex column that simply gives up the slack.
          ...(isCompetency ? { 'm:grade': 124 } : {}),
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

        const colCount = Math.max(1, (tpl.colCount || (rawDataRowTpl?.cells.length ?? 1)) - dropCols.size)
        // Ledger-style layouts (TOTAL / CLASS AVERAGE / CLASS POSITION / TERM AVERAGE
        // bands, no separate 'summary' section) get Decision appended as one more band
        // here, right after Term Average — this is what "close to the terms average or
        // class position" means for THIS layout shape. Only when this table already HAS
        // a footer band (footerRows.length > 0): the Standard layout's marks_table has
        // none (its stats live in a 'summary' section instead, handled elsewhere), so it
        // is untouched. Never on a transcript's per-period table — Decision is an ANNUAL
        // figure, not a per-semester one.
        const showDecisionInFooter = footerRows.length > 0 && !(sec as MarksTableSec).transcriptSemester
          && cfg.showDecision === true && school.type !== 'UNIVERSITY' && annualAverage != null && !decisionRendered
        // University counterpart: once a cumulative GPA exists (the year's final
        // semester), the closing Classification band's OWN value already reflects it —
        // classificationForGpa bands on cgpa ?? this semester's GPA, no code change
        // needed there — this just adds the Cumulative GPA figure it's now judged on,
        // the same way Decision needs Annual Average alongside it.
        const showCumulativeInFooter = footerRows.length > 0 && !(sec as MarksTableSec).transcriptSemester
          && cfg.showDecision === true && school.type === 'UNIVERSITY' && cgpa != null && !decisionRendered
        if (showDecisionInFooter || showCumulativeInFooter) decisionRendered = true
        // The seeded closing band (Term Appreciation) is judged on THIS period's own
        // average — on the year's final term it is replaced, not supplemented, by
        // Annual Average/Position + Decision, which are judged on the annual figure.
        const appreciationIdx = footerRows.findIndex(r => r.cells.some(c => c.field === 'appreciation'))
        const baseFooterRows = showDecisionInFooter && appreciationIdx >= 0
          ? footerRows.filter((_, i) => i !== appreciationIdx)
          : footerRows
        // Annual Average (and Position, when known) travel with Decision — the whole
        // reason it's worth showing is that Decision is judged against this figure, not
        // the term's own average just above it. Same gate as Decision itself.
        const annualRows: SheetRow[] = showDecisionInFooter ? [
          {
            id: '__annual_average_footer',
            cells: [
              { text: `${t('ANNUAL AVERAGE')}:`, bold: true, colSpan: Math.max(1, colCount - 1), align: 'right' as const, textColor: '#475569' },
              { text: annualAverage!.toFixed(1), bold: true, align: 'center' as const },
            ],
          },
          ...(annualPosition != null ? [{
            id: '__annual_position_footer',
            cells: [
              { text: `${t('ANNUAL POSITION')}:`, bold: true, colSpan: Math.max(1, colCount - 1), align: 'right' as const, textColor: '#475569' },
              { text: `${annualPosition}${annualClassSize ? `/${annualClassSize}` : ''}`, bold: true, align: 'center' as const },
            ],
          }] : []),
        ] : []
        const cumulativeRow: SheetRow[] = showCumulativeInFooter ? [{
          id: '__cumulative_gpa_footer',
          cells: [
            { text: `${t('CUMULATIVE GPA')}:`, bold: true, colSpan: Math.max(1, colCount - 1), align: 'right' as const, textColor: '#475569' },
            { text: cgpa!.toFixed(2), bold: true, align: 'center' as const },
          ],
        }] : []
        const effectiveFooterRows: SheetRow[] = showDecisionInFooter
          ? [...baseFooterRows, ...annualRows, {
              id: '__decision_footer',
              cells: [
                { text: `${t('DECISION')}:`, bold: true, colSpan: Math.max(1, colCount - 1), align: 'right' as const, textColor: color },
                { field: 'decision', bold: true, align: 'center' as const, textColor: color, fontSize: 15 },
              ],
            }]
          : showCumulativeInFooter
          ? [...footerRows.slice(0, -1), ...cumulativeRow, ...footerRows.slice(-1)]
          : footerRows
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
              {effectiveFooterRows.map((row: SheetRow) => renderTplRow(row, statResolver))}
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
      // Every box here is a measurement (average, position, class average, total). On a
      // rated card they would all print dashes, so the whole strip goes.
      if (isCompetency) return null
      // Promotion Decision is a per-design toggle (cfg.showDecision, the "Show Decision"
      // checkbox in the designer), not a box the admin adds per-section — appended here,
      // next to Average/Position, whenever a summary section is present. Primary/secondary
      // only, and only on the session's final (third) term — annualAverage is null on
      // every other term's card, same rule "Annual Average"/"Annual Position" already
      // follow. `!decisionRendered` matters here too: a Ledger-style marks_table (which
      // renders earlier) already claims Decision in ITS OWN footer band when it has one —
      // this only fires when nothing has shown it yet.
      const showDecisionHere = !decisionRendered && !annualBandHasDecision
        && cfg.showDecision === true && school.type !== 'UNIVERSITY' && annualAverage != null
      if (showDecisionHere) decisionRendered = true
      const boxes = showDecisionHere
        ? [...s.boxes, { id: '__decision', label: t('Decision'), field: 'decision' }]
        : s.boxes
      // Word-ish stats (an appreciation or a classification) don't fit at the numeric size.
      const WORD_FIELDS = new Set(['appreciation', 'classification', 'decision'])
      return (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${boxes.length || 1}, 1fr)`, gap: 7, marginBottom: 9 }}>
            {boxes.map(box => {
              const boxLabel = box.field === 'gpa' ? `${term.name} GPA` : box.label
              const isWord = WORD_FIELDS.has(box.field)
              return (
                <div key={box.id} style={{
                  border: `.8px solid rgba(${rgb},0.28)`,
                  borderTop: `2.4px solid ${isWord ? accent : color}`,
                  background: isWord ? `rgba(${accentRgb},0.06)` : '#fff',
                  padding: '6px 4px', textAlign: 'center',
                }}>
                  <div style={{ fontFamily: DISPLAY_SERIF, fontSize: isWord ? 13.5 : 16.5, fontWeight: 'bold', color: s.valueColor || color, lineHeight: 1.1, letterSpacing: isWord ? .8 : 0 }}>
                    {resolveStat(box.field)}
                  </div>
                  <div style={{ fontSize: 6.6, letterSpacing: 1.1, textTransform: 'uppercase', color: '#7a8290', marginTop: 2, fontWeight: 'bold' }}
                    dangerouslySetInnerHTML={{ __html: localizeLabel(boxLabel, lang) }} />
                </div>
              )
            })}
          </div>
          {/* Annual average/position: only present when this is the session's final
              term (non-university) — see reportcard.controller.ts getReportCard(s).
              Suppressed when the design has its own End-of-Year band, which already
              carries these (and more) — otherwise they'd print twice. */}
          {annualAverage != null && !hasAnnualBand && (
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
      // ── Redesign: titled panel, optional coloured edge bar and signature rule ──
      if (s.panel) {
        return (
          <div style={{
            // Longhand on every side, not the `border` shorthand mixed with a conditional
            // `borderLeft` — see the designer's RenderRemarks for the full reasoning (React's
            // "Removing a style property during rerender" warning). Same visual result: a
            // themed 3px left edge when set, the same hairline as the other sides otherwise.
            borderTop: `.8px solid rgba(${rgb},0.28)`,
            borderRight: `.8px solid rgba(${rgb},0.28)`,
            borderBottom: `.8px solid rgba(${rgb},0.28)`,
            borderLeft: s.edgeColor ? `3px solid ${s.edgeColor}` : `.8px solid rgba(${rgb},0.28)`,
            background: '#fff', marginBottom: 9,
            display: 'flex', flexDirection: 'column', height: '100%',
          }}>
            <div style={{ background: `rgba(${rgb},0.07)`, color, fontSize: 6.9, letterSpacing: 1.7, textTransform: 'uppercase', padding: '3.6px 7px', fontWeight: 'bold', borderBottom: `.6px solid rgba(${rgb},0.22)` }}
              dangerouslySetInnerHTML={{ __html: localizeLabel(s.label, lang) }} />
            <div style={{ fontSize: 8.8, lineHeight: 1.5, color: '#33415c', padding: '6px 8px 0', minHeight: 34, fontStyle: 'italic', flex: 1 }}>
              {generalRemarks || generalRemarksFr || ''}
            </div>
            {s.signatureCaption && (
              <div style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 8px 6px' }}>
                <span style={{ flex: 1, borderBottom: '.7px dotted #9aa2ae', height: 15, marginRight: 8 }} />
                <span style={{ fontSize: 6.4, letterSpacing: 1, textTransform: 'uppercase', color: '#8b93a1', fontWeight: 'bold' }}
                  dangerouslySetInnerHTML={{ __html: richLabel(s.signatureCaption, t, lang) }} />
              </div>
            )}
          </div>
        )
      }
      return (
        <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 5, color }} dangerouslySetInnerHTML={{ __html: localizeLabel(s.label, lang) }} />
          <div style={{ minHeight: 36, color: '#444' }}>{generalRemarks || generalRemarksFr || '—'}</div>
        </div>
      )
    }

    // Conduct & Attendance — labels only; every value prints blank for the class master to
    // complete by hand, because the school stores none of this (see ConductSec).
    if (sec.type === 'conduct') {
      const s = sec as ConductSec
      if (!s.rows.length) return null
      return (
        <div style={{ border: `.8px solid rgba(${rgb},0.28)`, background: '#fff', height: '100%' }}>
          {s.title && (
            <div style={{ background: `rgba(${rgb},0.07)`, color, fontSize: 6.9, letterSpacing: 1.7, textTransform: 'uppercase', padding: '3.6px 7px', fontWeight: 'bold', borderBottom: `.6px solid rgba(${rgb},0.22)` }}>
              <span dangerouslySetInnerHTML={{ __html: richLabel(s.title, t, lang) }} />
            </div>
          )}
          {s.rows.map((row, i) => (
            <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, fontSize: 8.4, padding: '3.4px 7px', ...(i < s.rows.length - 1 ? { borderBottom: '.5px solid #efece2' } : {}) }}>
              <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}
                dangerouslySetInnerHTML={{ __html: richLabel(row.label, t, lang) }} />
              <span style={{ flex: 1, borderBottom: '.6px dotted #c2c9d3', height: 11 }} />
            </div>
          ))}
        </div>
      )
    }

    // End-of-Year band. Final term only: annualAverage is null on every other term's card,
    // the same gate Annual Average/Position and the Decision already use.
    if (sec.type === 'annual_band') {
      const s = sec as AnnualBandSec
      if (annualAverage == null || !s.cells.length) return null
      return (
        <div style={{ marginBottom: 9, border: `1.1px solid ${accent}`, background: `rgba(${accentRgb},0.07)`, display: 'flex', alignItems: 'stretch' }}>
          {s.tag && (
            <div style={{ background: accent, color: '#fff', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 7.4, letterSpacing: 2.4, fontWeight: 'bold', textAlign: 'center', padding: '6px 4px', textTransform: 'uppercase' }}
              dangerouslySetInnerHTML={{ __html: richLabel(s.tag, t, lang) }} />
          )}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${s.cells.length}, 1fr)` }}>
            {s.cells.map((cell, i) => (
              <div key={cell.id} style={{ padding: '7px 6px', textAlign: 'center', ...(i < s.cells.length - 1 ? { borderRight: `.6px dashed rgba(${accentRgb},0.5)` } : {}) }}>
                <div style={{ fontFamily: DISPLAY_SERIF, fontSize: cell.field === 'decision' || cell.field === 'classification' ? 12 : 15.5, fontWeight: 'bold', color: cell.field === 'decision' ? '#1b7a4b' : '#8a6516' }}>
                  {resolveStat(cell.field)}
                </div>
                <div style={{ fontSize: 6.6, letterSpacing: 1.1, textTransform: 'uppercase', color: '#9a8756', marginTop: 2, fontWeight: 'bold' }}
                  dangerouslySetInnerHTML={{ __html: localizeLabel(cell.label, lang) }} />
              </div>
            ))}
          </div>
        </div>
      )
    }

    // Side-by-side panels (grading scale + conduct; the two remark boxes + stamp). Children
    // that render nothing are dropped so the row doesn't keep a gap for them.
    if (sec.type === 'panel_row') {
      const s = sec as PanelRowSec
      const kids = s.children
        .filter(child => sectionShowsOn(child, variant))
        .map((child, i) => ({ child, node: renderSec(child), weight: s.weights?.[i] ?? 1 }))
        .filter(k => k.node != null)
      if (kids.length === 0) return null
      return (
        <div style={{ display: 'flex', gap: 9, marginBottom: 9, alignItems: 'stretch' }}>
          {kids.map(({ child, node, weight }) => (
            <div key={child.id} style={{ flex: weight, minWidth: 0 }}>{node}</div>
          ))}
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
            {s.label ? <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}
              dangerouslySetInnerHTML={{ __html: richLabel(s.label, t, lang) }} /> : null}
          </div>
        </div>
      )
    }

    if (sec.type === 'grading_legend') {
      const s = sec as GradingLegendSec
      // A rated card has no mark bands to look up, so the numeric legend below is wrong for
      // it — but it still needs a key. This used to print nothing, on the reasoning that
      // "Attained / Developing / Not Yet Attained" explain themselves. That stopped holding
      // once a school could name its own levels: a parent handed a card reading "Emerging"
      // has no way to tell whether that is the top of the scale or the bottom. Printing them
      // in order, highest first, answers that without a word of explanation.
      if (isCompetency) {
        return (
          <div key={sec.id} style={{ marginBottom: 10 }}>
            <table style={{ borderCollapse: 'collapse', border: `1px solid rgba(${rgb},0.3)`, width: '100%' }}>
              <thead>
                <tr>
                  <th colSpan={2} style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>
                    {t('RATING SCALE')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {competencyLevels.map((level) => (
                  <tr key={level.id}>
                    <td style={{ padding: '2px 6px', fontSize: 10, borderBottom: '1px solid #eef2f7', borderRight: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', width: 46, color: level.color }}>
                      {level.short}
                    </td>
                    <td style={{ padding: '2px 6px', fontSize: 10, borderBottom: '1px solid #eef2f7', textAlign: 'left' }}>
                      {levelLabel(level, lang, t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
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
              <tr><th colSpan={st.colCount} style={{ backgroundColor: color, color: '#fff', padding: '3px 8px', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}
                dangerouslySetInnerHTML={{ __html: richLabel(st.title, t, lang) }} /></tr>
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
          {s.title && <div style={{ fontWeight: 'bold', fontSize: 12, color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}
            dangerouslySetInnerHTML={{ __html: richLabel(s.title, t, lang) }} />}
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
            {/* RIGHT — configurable spreadsheet tables. Gated on `isUniv` until now, which
                is not the school type but "this grading scale carries grade points": a
                primary or secondary scale has none, so its OVERALL SUMMARY table — the one
                holding Annual Average and Grade on the annual report — was built by the
                default layout and then silently never rendered. A section only draws the
                tables its own design declares, so there is nothing to gate here. */}
            {rightTables.length > 0 && (
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
                  <td style={{ ...resitTd, fontWeight: 'bold', color: failed ? FAIL_RED : color }}>{entryGrade(e, bands, school.language === 'FR' ? 'FR' : 'EN')}</td>
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
    <div id="report-card-printable" style={{
      fontFamily: 'Carlito, Calibri, "DejaVu Sans", Arial, sans-serif',
      // Tighter page padding than the older layouts: the redesign's own framing rule
      // supplies the visual margin, so 40px on top of it would waste a third of the page.
      padding: isRedesign ? '22px 28px 18px' : 40,
      maxWidth: 800, margin: '0 auto', color: '#14213d', fontSize: 13,
      position: 'relative', overflow: 'hidden',
      backgroundColor: cfg.bgColor || (isRedesign ? '#fffdf9' : '#ffffff'),
      // The mockup's double frame: a solid rule in the theme's primary with a hairline of
      // the accent set just outside it. Redesign only — an older saved design must not
      // suddenly grow a border it was never designed with.
      ...(isRedesign ? { border: `2px solid ${color}`, outline: `1px solid ${accent}`, outlineOffset: 3 } : {}),
    }}>
      <Watermark cfg={cfg} schoolLogo={school.logo} schoolName={school.name} variant={variant} />
      {/* Sections scoped to the OTHER copy are dropped entirely — this is what makes one
          saved design print both the sealed official document and the student copy. */}
      {sections.filter(sec => sectionShowsOn(sec, variant)).map(sec => {
        const ts = sec.type === 'marks_table' ? (sec as MarksTableSec).transcriptSemester : undefined
        const resitSubjects = ts ? (props.transcriptSemesters?.[ts]?.subjects ?? []) : subjects
        const resitEntries  = ts ? (props.transcriptSemesters?.[ts]?.entries ?? []) : entries
        // Fallback for a layout with NO 'summary' section — the transcript's default is
        // exactly this case. Placed right before the signature block (the natural end of
        // the document's figures) rather than after everything, since a layout that DOES
        // have a summary section already showed it next to Average/Position above and
        // sets decisionRendered, so this never double-prints.
        const needsFallback = sec.type === 'signatures' && !decisionRendered
          && cfg.showDecision === true && school.type !== 'UNIVERSITY' && annualAverage != null
        if (needsFallback) decisionRendered = true
        return (
          <div key={sec.id}>
            {needsFallback && (
              <div style={{ display: 'grid', gridTemplateColumns: annualPosition != null ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{annualAverage!.toFixed(1)}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{t('Annual Average')}</div>
                </div>
                {annualPosition != null && (
                  <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{annualPosition}{annualClassSize ? `/${annualClassSize}` : ''}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{t('Annual Position')}</div>
                  </div>
                )}
                <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{resolveStat('decision')}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{t('Decision')}</div>
                </div>
              </div>
            )}
            {renderSec(sec)}
            {sec.type === 'marks_table' && renderResitAppendix(resitSubjects, resitEntries)}
          </div>
        )
      })}
      {/* Last-resort fallback: a layout with neither a 'summary' nor a 'signatures'
          section (unusual, but not impossible for a heavily customized design) would
          otherwise silently never show Decision even with the toggle on. */}
      {!decisionRendered && cfg.showDecision === true && school.type !== 'UNIVERSITY' && annualAverage != null && (
        <div style={{ display: 'grid', gridTemplateColumns: annualPosition != null ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{annualAverage.toFixed(1)}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{t('Annual Average')}</div>
          </div>
          {annualPosition != null && (
            <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{annualPosition}{annualClassSize ? `/${annualClassSize}` : ''}</div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{t('Annual Position')}</div>
            </div>
          )}
          <div style={{ border: `1px solid rgba(${rgb},0.3)`, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{resolveStat('decision')}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{t('Decision')}</div>
          </div>
        </div>
      )}
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
export default function PrintableReportCard(rawProps: PrintableReportCardProps) {
  // USER RULE: the Evening sitting is an internal grouping, not something a student's
  // printed report card or transcript announces ("the evening is just that you are in
  // evening section"). The marker only exists in the class NAME because class references
  // are name strings and two sittings would otherwise collide, so it is stripped here, at
  // the single entry point every layout and the sections renderer passes through. Doing it
  // once at the boundary means no individual field below can leak it, and neither can a
  // field added later.
  const props: PrintableReportCardProps = {
    ...rawProps,
    student: { ...rawProps.student, classLevel: stripProgrammeSuffix(rawProps.student.classLevel) },
  }
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
