import api from './client'

export type TemplateName = 'classic' | 'bilingual' | 'modern' | 'official' | 'ledger'

// ── Legacy toggle-based config (kept for backward compat) ─────────────────────
export interface TemplateConfig {
  template: TemplateName
  primaryColor: string
  reportTitle: string
  schoolSubtitle: string
  showSchoolType: boolean
  showSeq1: boolean
  showSeq2: boolean
  showGrade: boolean
  showRemarks: boolean
  showPosition: boolean
  showAverage: boolean
  showGeneralRemarks: boolean
  showTeacherSig: boolean
  showPrincipalSig: boolean
  showParentSig: boolean
  principalTitle: string
  footerText: string
  // university only: print failing (F-grade) marks in red instead of the default black.
  // Undefined/true = red (matches the printed transcript convention this was modeled on).
  highlightFailingRed?: boolean
  // sections-based layout (overrides toggle config if present)
  sections?: LayoutSection[]
  // background color of the card paper
  bgColor?: string
  // watermark
  watermark?: { enabled: boolean; type: 'text' | 'logo'; text: string; color: string; opacity: number; logoUrl?: string | null; size?: number; rotation?: number; x?: number; y?: number }
  // top-level layout type — 'standard' (section-based designer), 'transcript' (annual
  // transcript style, university only), or 'ledger' (totals-in-table style, non-university only)
  layoutType?: 'standard' | 'transcript' | 'ledger'
  // settings for the transcript layout
  transcriptConfig?: {
    showGradeSystem?: boolean
    showClassification?: boolean
    showLegend?: boolean
    deanLabel?: string
    registrarLabel?: string
    reportTitle?: string
    academicYearLabel?: string
  }
  // The school's saved TRANSCRIPT design (university only) — stored under its
  // own key so it can coexist with the standard/ledger design at the top
  // level. One school = one saved row, but saving the transcript must never
  // clobber the report-card design (or vice versa): before this key existed,
  // saving from the designer's Transcript view overwrote the whole config,
  // and every regular report card then printed with the transcript layout —
  // whose semester-scoped tables render nothing outside the transcript page.
  transcript?: Partial<TemplateConfig>
}

// ── Section types ─────────────────────────────────────────────────────────────
export interface InfoRow      { id: string; label: string; field: string; valueColor?: string }
export interface SummaryBox   { id: string; label: string; field: string; valueColor?: string }
export interface SignatureLine { id: string; label: string }
export interface MiniTableRow { id: string; label: string; field: string }
export interface MiniTable    { id: string; title: string; rows: MiniTableRow[]; hiddenCols?: string[] }

// ── Spreadsheet-style configurable table (replaces MiniTable for new templates) ─
export interface SheetCell {
  text?: string
  field?: string         // bound live-data key (credits, gpa, cgpa, average, etc.)
  bold?: boolean; italic?: boolean; underline?: boolean
  align?: 'left' | 'center' | 'right'
  bgColor?: string; textColor?: string; fontSize?: number
  colSpan?: number; rowSpan?: number
  _consumed?: true       // cell is hidden because it's part of a larger merged cell
}
export interface SheetRow {
  id: string; cells: SheetCell[]
  /** If true, this row is a repeating data-row template (one per subject in the print renderer). */
  _isDataRow?: boolean
}
export interface SpreadsheetTable {
  id: string; title: string
  colCount: number
  colWidths?: number[]   // per-column min-width px
  rows: SheetRow[]
}

export interface HeaderSec     { id: string; type: 'header';       reportTitle: string; subtitle: string; showSchoolType: boolean; showLogo: boolean; logoSize: number; logoPosition: 'left'|'center'|'right'; schoolNameColor?: string; schoolTypeColor?: string; officialHeader?: boolean
  // Legacy — the official header's left/right text used to be edited per
  // template here. It now lives in School Settings (English + French per
  // side, see School.officialLeftTextEn etc. and resolveOfficialText below),
  // read-only in the designer. Kept only as a fallback for templates saved
  // before the move, so they keep rendering unchanged until Settings is filled in.
  leftText?: string; rightText?: string
  // Official header only — independent per-field toggles for the contact line.
  // Each one only takes effect if the school actually has that value on file
  // (see buildOfficialContactLine); the line is computed live, never stored.
  showEmail?: boolean; showPhone?: boolean; showAddress?: boolean; showWebsite?: boolean
  // Official header only — same pattern as the contact-line toggles above:
  // the authorization/registration number lives in School Settings, and this
  // just switches on whether it's shown, never stores the text itself.
  showAuthorization?: boolean
  // Official header only — manual multiplier (default 1) on top of the automatic
  // logoSize-based scale (see officialTextScaleFor below), so the admin can fine
  // tune the left/right text block sizing independently of the logo.
  officialTextScale?: number }

// Official header only: the left/right text blocks auto-scale with the logo size
// (bigger logo -> bigger text, so they stay visually balanced), on top of the
// admin's own manual officialTextScale multiplier. 60 is the shared default
// logoSize used across every header style, so it's the scale-1.0 baseline.
// Default manual multiplier is 1.15 (115%), matching the default 60px logo.
export function officialTextScaleFor(sec: { logoSize: number; officialTextScale?: number }): number {
  return (sec.officialTextScale ?? 1.15) * (sec.logoSize / 60)
}

// School contact fields used by the Official header's contact line.
export interface SchoolContactInfo { email?: string; phone?: string | null; address?: string | null; website?: string | null; authorizationNumber?: string | null }

/**
 * Builds the Official header's contact line from the school's real, saved
 * info — only the fields the admin has switched on AND that actually have a
 * value are included (a field can't be switched on in the designer unless it
 * has a value, but this stays defensive either way). Computed fresh every
 * render (never baked into a stored string), so it can never go stale.
 */
export function buildOfficialContactLine(
  school: SchoolContactInfo | null | undefined,
  toggles: { showEmail?: boolean; showPhone?: boolean; showAddress?: boolean; showWebsite?: boolean },
): string {
  // Each toggle defaults to on (undefined = never explicitly touched by the
  // admin) — matches the checkbox UI, which shows checked until unticked.
  const parts: string[] = []
  if ((toggles.showEmail   ?? true) && school?.email)   parts.push(`Email: ${school.email}`)
  if ((toggles.showWebsite ?? true) && school?.website) parts.push(`WEB: ${school.website}`)
  if ((toggles.showPhone   ?? true) && school?.phone)   parts.push(`TEL: ${school.phone}`)
  if ((toggles.showAddress ?? true) && school?.address) parts.push(school.address)
  return parts.join(' | ')
}

// The official header's left/right blocks live in School Settings (one EN and
// one FR variant per side) so they stay consistent across every report-card
// template instead of being retyped per-template — see School Settings'
// "Official Header Letterhead" card.
export interface SchoolOfficialTextInfo {
  officialLeftTextEn?: string | null
  officialLeftTextFr?: string | null
  officialRightTextEn?: string | null
  officialRightTextFr?: string | null
}

/**
 * Combines the left/right official-header text's English and French variants
 * — real Cameroon institutional letterheads are always bilingual (both
 * languages shown together, not one-or-the-other), so both saved blocks are
 * stacked with a blank-line gap when both exist. Falls back to `legacy` (a
 * per-template leftText/rightText saved before this moved to Settings) only
 * when NEITHER language has been filled in yet in Settings, so older
 * templates keep rendering unchanged until an admin fills in the new fields.
 */
export function resolveOfficialText(school: SchoolOfficialTextInfo | null | undefined, side: 'left' | 'right', legacy: string): string {
  const en = (side === 'left' ? school?.officialLeftTextEn : school?.officialRightTextEn)?.trim()
  const fr = (side === 'left' ? school?.officialLeftTextFr : school?.officialRightTextFr)?.trim()
  if (en && fr) return `${en}\n\n${fr}`
  return en || fr || legacy
}

// ── Official header text blocks ──────────────────────────────────────────────
// One renderer shared by the designer canvas AND the print output (same
// no-drift rule as buildOfficialContactLine). Styling follows Cameroon
// official-letterhead conventions and is driven purely by how each line is
// typed — nothing extra to configure:
//   • ALL-CAPS line               → bold heading (institution / ministry names)
//   • one short ALL-CAPS word     → large display line (the school acronym)
//   • Mixed-case line             → small italic (mottos: "Peace-Work-Fatherland")
//   • blank line                  → a small gap between groups, not a full row
// "Share Tech" (Google Fonts), loaded as a real stylesheet link in
// app/layout.tsx — matches the real Cameroon institutional letterhead this
// header style is modeled on. Falls back to Arial/Helvetica if the stylesheet
// fails to load.
export const OFFICIAL_HEADER_FONT = "'Share Tech', Arial, Helvetica, sans-serif"

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// No artificial word-spacing (justify). Every multi-word ALL-CAPS line
// individually scales its own font-size toward the block's longest such line, by
// character-count ratio (with a small boost since Share Tech isn't perfectly
// monospace, so a plain ratio tends to undershoot the real rendered width) --
// capped as a sanity ceiling against a truly extreme outlier. The one-word
// acronym line and the italic motto line are the ONLY lines that don't reach the
// edge -- fixed size, centered, regardless of the surrounding lines' lengths.
// `scale` (see officialTextScaleFor) multiplies every size uniformly -- the
// boost/cap ratios that drive edge-alignment stay the same at any scale.
export function officialTextBlockHtml(text: string, edge: 'left' | 'right', scale = 1): string {
  const base = `font-family:${OFFICIAL_HEADER_FONT};text-align:center;line-height:1.35;`
  const CAPS_BASE_PX = 8.5 * scale
  // Same boost on both sides so the right block reaches the edge exactly like
  // the left does — `edge` here only decides which outer edge each block hugs.
  const CAPS_BOOST = 1.6
  const CAPS_MAX_SCALE = 2.2
  const isScalableCaps = (l: string) => l.length > 0 && l === l.toUpperCase() && /[A-Z]/.test(l) && l.includes(' ')
  // contentEditable round-trips blank rows as a non-breaking space -- normalize first
  const rawLines = text.split('\n').map(raw => raw.replace(/\u00a0/g, ' ').trim())
  const maxCapsLen = Math.max(0, ...rawLines.filter(isScalableCaps).map(l => l.length))

  const lines = rawLines.map(line => {
    if (!line) return `<div style="${base}font-size:${(4 * scale).toFixed(1)}px;">&nbsp;</div>`
    const esc = escapeHtml(line)
    const caps = line === line.toUpperCase() && /[A-Z]/.test(line)
    if (caps && !line.includes(' ') && line.length <= 12)
      return `<div style="${base}font-size:${(13.5 * scale).toFixed(1)}px;font-weight:800;letter-spacing:3px;padding:1px 0;">${esc}</div>`
    if (caps) {
      const s = Math.min(CAPS_MAX_SCALE, (maxCapsLen / line.length) * CAPS_BOOST)
      return `<div style="${base}font-size:${(CAPS_BASE_PX * s).toFixed(1)}px;font-weight:bold;letter-spacing:0.3px;">${esc}</div>`
    }
    return `<div style="${base}font-size:${(7.5 * scale).toFixed(1)}px;font-style:italic;color:#333;">${esc}</div>`
  }).join('')
  // Shrink-wrap to the widest natural line and hug the block's outer edge (left
  // block flush-left, right block flush-right).
  const edgeMargin = edge === 'left' ? 'margin-right:auto' : 'margin-left:auto'
  return `<div style="width:fit-content;${edgeMargin}">${lines}</div>`
}

export interface StudentInfoSec{ id: string; type: 'student_info'; columns: 1|2|3; rows: InfoRow[] }
export interface MarksTableSec { id: string; type: 'marks_table';  showSeq1: boolean; showSeq2: boolean; showCoef?: boolean; showGrade: boolean; showRemarks: boolean; headers?: Record<string,string>; headerColor?: string; colColors?: Record<string,string>; columnOrder?: string[];
  /** When set, the marks table is rendered from this SpreadsheetTable template instead of the default layout. The row marked _isDataRow repeats per subject in the print renderer. */
  template?: SpreadsheetTable
  /** Transcript layout only: sources this table's data from ONE specific period of the
   *  academic year instead of the document's combined subjects/entries. The slots are
   *  ordinal, not literally semesters — a university year has two (sem1/sem2), a primary
   *  or secondary year has three terms (sem1/sem2/sem3). The key keeps its original name
   *  so designs saved before terms were supported still resolve. */
  transcriptSemester?: TranscriptPeriod
}

/** Ordinal period slot a transcript marks table can be scoped to. Slot N = the Nth
 *  period of the academic year, whatever that school type calls it. */
export type TranscriptPeriod = 'sem1' | 'sem2' | 'sem3'

/** Every slot, in year order. Slice with transcriptPeriodCount() for a given school type. */
export const TRANSCRIPT_PERIODS: TranscriptPeriod[] = ['sem1', 'sem2', 'sem3']

/** Periods in one academic year: universities run 2 semesters, primary/secondary 3 terms. */
export function transcriptPeriodCount(schoolType?: string): number {
  return schoolType === 'UNIVERSITY' ? 2 : 3
}

/** Slots a given school type's transcript uses, in year order. */
export function transcriptPeriodsFor(schoolType?: string): TranscriptPeriod[] {
  return TRANSCRIPT_PERIODS.slice(0, transcriptPeriodCount(schoolType))
}

/** Human label for a period slot ("First Semester" / "First Term"). Used as the caption
 *  above each transcript marks table when the real term name isn't available (the print
 *  renderer prefers the actual term name from the student's data). */
export function transcriptPeriodLabel(period: TranscriptPeriod, schoolType?: string): string {
  const ordinal = { sem1: 'First', sem2: 'Second', sem3: 'Third' }[period]
  return `${ordinal} ${schoolType === 'UNIVERSITY' ? 'Semester' : 'Term'}`
}

// Secondary marks-table columns, in their default order. `subject` and `score` always show.
export const MARKS_COLS = ['subject', 'coef', 'seq1', 'seq2', 'score', 'grade', 'remarks'] as const
// Extra columns used by the university transcript layout (GPA): course code, credit
// hours, grade point (/4.0), weighted point (grade point × credit), evaluation text,
// and jury decision (VALIDATED / FAIL).
export const UNIVERSITY_MARKS_COLS = ['code', 'credit', 'gradePoint', 'evaluation', 'weighted', 'juryDecision'] as const

/** Static label + alignment metadata for every known marks column key. */
export const MARKS_COL_LABELS: Record<string, { label: string; align: 'left' | 'center'; bold?: boolean }> = {
  sn:           { label: 'S/N',          align: 'center' },
  subject:      { label: 'Subject',      align: 'left' },
  coef:         { label: 'Coef',         align: 'center' },
  seq1:         { label: 'Seq 1',        align: 'center' },
  seq2:         { label: 'Seq 2',        align: 'center' },
  score:        { label: 'Score',        align: 'center', bold: true },
  grade:        { label: 'Grade',        align: 'center', bold: true },
  remarks:      { label: 'Remarks',      align: 'left' },
  code:         { label: 'Code',         align: 'center' },
  credit:       { label: 'Credit',       align: 'center' },
  gradePoint:   { label: 'GP',           align: 'center' },
  evaluation:   { label: 'Evaluation',   align: 'left' },
  weighted:     { label: 'Weight',       align: 'center' },
  juryDecision: { label: 'Jury Decision',align: 'center', bold: true },
  min:          { label: 'Min',          align: 'center' },
  avg:          { label: 'Avg',          align: 'center' },
  max:          { label: 'Max',          align: 'center' },
}

/** Ordered, visibility-filtered column keys for a marks table (respects columnOrder). */
export function marksColumnOrder(sec: Pick<MarksTableSec, 'columnOrder' | 'showSeq1' | 'showSeq2' | 'showCoef' | 'showGrade' | 'showRemarks'>): string[] {
  const order = sec.columnOrder?.length ? sec.columnOrder : [...MARKS_COLS]
  const visible = (k: string) =>
    k === 'coef' ? sec.showCoef !== false :
    k === 'seq1' ? sec.showSeq1 :
    k === 'seq2' ? sec.showSeq2 :
    k === 'grade' ? sec.showGrade :
    k === 'remarks' ? sec.showRemarks : true // subject, score, code, credit, gradePoint, weighted
  return order.filter(visible)
}

/** Build a SpreadsheetTable for a marks section. Used both at design time and when adding new sections. */
export function seedMarksTableSection(sec: MarksTableSec, color: string, schoolType?: string): SpreadsheetTable {
  const cols = marksColumnOrder(sec).filter(k => !(schoolType === 'UNIVERSITY' && k === 'coef'))
  const hdrs = sec.headers || {}
  const cc   = sec.colColors || {}
  const ts   = Date.now()
  return {
    id: `marks_${ts}`,
    title: '',
    colCount: cols.length,
    rows: [
      {
        id: `mhdr_${ts}`,
        cells: cols.map(k => ({
          text: hdrs[k] ? hdrs[k].replace(/<[^>]*>/g, '') : (MARKS_COL_LABELS[k]?.label ?? k),
          bold: true,
          align: MARKS_COL_LABELS[k]?.align ?? 'center',
          bgColor: color,
          textColor: sec.headerColor ?? '#ffffff',
        })),
      } as SheetRow,
      {
        id: `mdata_${ts + 1}`,
        _isDataRow: true,
        cells: cols.map(k => ({
          field: `m:${k}`,
          align: MARKS_COL_LABELS[k]?.align ?? 'center',
          ...(MARKS_COL_LABELS[k]?.bold ? { bold: true } : {}),
          ...(cc[k] ? { textColor: cc[k] } : {}),
        })),
      } as SheetRow,
    ],
  }
}

/** Build the banded SpreadsheetTable a university transcript's per-semester marks
 *  table starts from (CODE/TITLE/CREDIT/MARK/GRADE/GRADE POINT/WEIGHTED POINT, a
 *  TOTAL row, and a big SEMESTER GPA row) — same section mechanics as any other
 *  marks_table (draggable, deletable, columns removable/re-keyable via double-click),
 *  just a different starting shape. The footer fields (`credits`/`total`/`gpTotal`/
 *  `wpTotal`/`gpa`) resolve scoped to THIS section's own semester — see the
 *  transcriptSemester-aware resolver in PrintableReportCard.tsx. */
export function seedTranscriptMarksTable(color: string, schoolType?: string): SpreadsheetTable {
  if (schoolType && schoolType !== 'UNIVERSITY') return seedTranscriptTermMarksTable(color)
  const cols = ['code', 'subject', 'credit', 'score', 'grade', 'gradePoint', 'weighted'] as const
  const labels: Record<string, string> = { code: 'CODE', subject: 'TITLE', credit: 'CREDIT', score: 'MARK /100', grade: 'GRADE', gradePoint: 'GRADE POINT', weighted: 'WEIGHTED POINT' }
  const ts = Date.now()
  const bandBg = '#f1f5f9'
  const bandFg = '#111827'
  return {
    id: `marks_${ts}`,
    title: '',
    colCount: cols.length,
    rows: [
      {
        id: `mhdr_${ts}`,
        cells: cols.map(k => ({
          text: labels[k], bold: true, align: k === 'subject' ? 'left' : 'center',
          bgColor: color, textColor: '#ffffff',
        })),
      } as SheetRow,
      {
        id: `mdata_${ts + 1}`,
        _isDataRow: true,
        cells: cols.map(k => ({
          field: `m:${k}`, align: k === 'subject' ? 'left' : 'center',
          ...(k === 'score' || k === 'grade' ? { bold: true } : {}),
        })),
      } as SheetRow,
      // TOTAL row — credit/mark/GP/WP sums, scoped to this table's semester.
      {
        id: `mfoot_${ts + 2}`,
        cells: [
          { text: 'TOTAL', bold: true, colSpan: 2, align: 'left', bgColor: bandBg, textColor: bandFg },
          { field: 'credits', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
          { field: 'total', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
          { text: '', bgColor: bandBg },
          { field: 'gpTotal', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
          { field: 'wpTotal', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
        ],
      } as SheetRow,
      // Hero line — this semester's own GPA.
      {
        id: `mfoot_${ts + 3}`,
        cells: [
          { text: 'SEMESTER GPA:', bold: true, colSpan: 6, align: 'right', textColor: color },
          { field: 'gpa', bold: true, align: 'center', textColor: color, fontSize: 15 },
        ],
      } as SheetRow,
    ],
  }
}

/** Primary/secondary counterpart of seedTranscriptMarksTable — one term's marks on the
 *  annual transcript. No GPA machinery (that's university-only): subjects carry a
 *  coefficient rather than credit hours, and the hero line is the term's own
 *  coefficient-weighted average out of 20, not a GPA. */
function seedTranscriptTermMarksTable(color: string): SpreadsheetTable {
  const cols = ['subject', 'coef', 'seq1', 'seq2', 'score', 'grade', 'remarks'] as const
  const labels: Record<string, string> = { subject: 'SUBJECT', coef: 'COEF', seq1: 'SEQ 1', seq2: 'SEQ 2', score: 'AVERAGE', grade: 'GRADE', remarks: 'REMARKS' }
  const ts = Date.now()
  const bandBg = '#f1f5f9'
  const bandFg = '#111827'
  return {
    id: `marks_${ts}`,
    title: '',
    colCount: cols.length,
    rows: [
      {
        id: `mhdr_${ts}`,
        cells: cols.map(k => ({
          text: labels[k], bold: true, align: k === 'subject' || k === 'remarks' ? 'left' : 'center',
          bgColor: color, textColor: '#ffffff',
        })),
      } as SheetRow,
      {
        id: `mdata_${ts + 1}`,
        _isDataRow: true,
        cells: cols.map(k => ({
          field: `m:${k}`, align: k === 'subject' || k === 'remarks' ? 'left' : 'center',
          ...(k === 'score' || k === 'grade' ? { bold: true } : {}),
        })),
      } as SheetRow,
      // TOTAL row — coefficient and weighted-mark sums, scoped to this table's term.
      {
        id: `mfoot_${ts + 2}`,
        cells: [
          { text: 'TOTAL', bold: true, align: 'left', bgColor: bandBg, textColor: bandFg },
          { field: 'coefTotal', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
          { text: '', bgColor: bandBg },
          { text: '', bgColor: bandBg },
          { field: 'total', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
          { text: '', bgColor: bandBg },
          { text: '', bgColor: bandBg },
        ],
      } as SheetRow,
      // Hero line — this term's own average.
      {
        id: `mfoot_${ts + 3}`,
        cells: [
          { text: 'TERM AVERAGE:', bold: true, colSpan: 4, align: 'right', textColor: color },
          { field: 'average', bold: true, align: 'center', textColor: color, fontSize: 15 },
          { text: '', colSpan: 2 },
        ],
      } as SheetRow,
    ],
  }
}

export interface SummarySec    { id: string; type: 'summary';      boxes: SummaryBox[]; valueColor?: string }
export interface RemarksSec    { id: string; type: 'remarks';      label: string; placeholderColor?: string }
export interface SignaturesSec { id: string; type: 'signatures';   lines: SignatureLine[] }
export interface TextBlockSec  { id: string; type: 'text_block';   content: string; align: 'left'|'center'|'right' }
export interface DividerSec    { id: string; type: 'divider';      style: 'solid'|'dashed' }
// University transcript footer: the grading system, degree classification and a
// legend of abbreviations. Grade rows come from the school's GPA grading scale.
export interface GradingLegendSec {
  id: string; type: 'grading_legend'
  title?: string
  showGradeSystem: boolean; showClassification: boolean; showLegend: boolean; legendText?: string
  // Legacy per-column / per-row hide flags (used when builtinTable is NOT set)
  hiddenCols?: string[]
  hiddenRowIndices?: number[]
  // When set, the built-in grade-system table is a freely-editable SpreadsheetTable
  // (seeded from the grading scale by the designer; null = use dynamic rendering)
  builtinTable?: SpreadsheetTable
  leftTables?: SpreadsheetTable[]
  leftLayout?: 'columns' | 'rows'
  rightTables?: SpreadsheetTable[]
  rightLayout?: 'columns' | 'rows'
}

export type LayoutSection =
  | HeaderSec | StudentInfoSec | MarksTableSec | SummarySec
  | RemarksSec | SignaturesSec | TextBlockSec | DividerSec | GradingLegendSec

// Degree classification by CGPA (mirrors classificationForGpa in lib/api/gradingScale).
export const CLASSIFICATION_BANDS: { min: number; max: number; label: string }[] = [
  { min: 3.60, max: 4.00, label: 'Distinction' },
  { min: 2.80, max: 3.59, label: 'Upper Credit' },
  { min: 2.40, max: 2.79, label: 'Lower Credit' },
  { min: 2.00, max: 2.39, label: 'Pass' },
  { min: 0.00, max: 1.99, label: 'Fail' },
]
export const DEFAULT_TRANSCRIPT_LEGEND =
  'CV = Credit Value &nbsp;·&nbsp; GP = Grade Point &nbsp;·&nbsp; WGP = Weighted Grade Point (CV × GP) &nbsp;·&nbsp; GPA = Grade Point Average &nbsp;·&nbsp; CGPA = Cumulative Grade Point Average'

// ── Template presets ──────────────────────────────────────────────────────────
export const TEMPLATE_DEFAULTS: Record<TemplateName, TemplateConfig> = {
  classic: {
    template: 'classic', primaryColor: '#1e3a5f',
    reportTitle: 'STUDENT REPORT CARD', schoolSubtitle: '',
    showSchoolType: true, showSeq1: true, showSeq2: true,
    showGrade: true, showRemarks: true, showPosition: true, showAverage: true,
    showGeneralRemarks: true, showTeacherSig: true, showPrincipalSig: true, showParentSig: true,
    principalTitle: 'Principal', footerText: '',
  },
  bilingual: {
    template: 'bilingual', primaryColor: '#1a5c1a',
    reportTitle: 'END OF TERM REPORT / RAPPORT DE FIN DE TERME',
    schoolSubtitle: 'République du Cameroun / Republic of Cameroon',
    showSchoolType: true, showSeq1: true, showSeq2: true,
    showGrade: true, showRemarks: true, showPosition: true, showAverage: true,
    showGeneralRemarks: true, showTeacherSig: true, showPrincipalSig: true, showParentSig: true,
    principalTitle: 'Principal', footerText: 'Paix — Travail — Patrie / Peace — Work — Fatherland',
  },
  modern: {
    template: 'modern', primaryColor: '#2563eb',
    reportTitle: 'ACADEMIC PERFORMANCE REPORT', schoolSubtitle: '',
    showSchoolType: false, showSeq1: false, showSeq2: false,
    showGrade: true, showRemarks: false, showPosition: true, showAverage: true,
    showGeneralRemarks: true, showTeacherSig: false, showPrincipalSig: true, showParentSig: false,
    principalTitle: 'Principal', footerText: '',
  },
  official: {
    template: 'official', primaryColor: '#92400e',
    reportTitle: 'OFFICIAL ACADEMIC REPORT',
    schoolSubtitle: 'Republic of Cameroon — Peace, Work, Fatherland',
    showSchoolType: true, showSeq1: true, showSeq2: true,
    showGrade: true, showRemarks: true, showPosition: true, showAverage: true,
    showGeneralRemarks: true, showTeacherSig: true, showPrincipalSig: true, showParentSig: true,
    principalTitle: 'Headmaster/Headmistress',
    footerText: 'This report is an official academic document of the school.',
  },
  ledger: {
    template: 'ledger', primaryColor: '#0f172a',
    reportTitle: 'STUDENT LEDGER REPORT', schoolSubtitle: '',
    showSchoolType: true, showSeq1: true, showSeq2: true,
    showGrade: true, showRemarks: true, showPosition: true, showAverage: true,
    showGeneralRemarks: true, showTeacherSig: true, showPrincipalSig: true, showParentSig: true,
    principalTitle: 'Principal', footerText: '',
  },
}

export const DEFAULT_CONFIG = TEMPLATE_DEFAULTS.classic

// Starter text for the official Cameroon-style three-column header (editable).
export const OFFICIAL_HEADER_LEFT = `<b>RÉPUBLIQUE DU CAMEROUN</b><br><i>Paix - Travail - Patrie</i><br>MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES<br>DÉLÉGATION RÉGIONALE DE …<br>DÉLÉGATION DÉPARTEMENTALE DE …`
export const OFFICIAL_HEADER_RIGHT = `<b>REPUBLIC OF CAMEROON</b><br><i>Peace - Work - Fatherland</i><br>MINISTRY OF SECONDARY EDUCATION<br>REGIONAL DELEGATION OF …<br>DIVISIONAL DELEGATION FOR …`

// ── Default layout builder ────────────────────────────────────────────────────
let _id = 0
const uid = (prefix: string) => `${prefix}_${++_id}_${Math.random().toString(36).slice(2, 6)}`

export function getDefaultLayout(tpl: TemplateName): TemplateConfig & { sections: LayoutSection[] } {
  const t = TEMPLATE_DEFAULTS[tpl]
  const isBi = tpl === 'bilingual'
  const sections: LayoutSection[] = [
    {
      id: uid('hdr'), type: 'header',
      reportTitle: t.reportTitle,
      subtitle: t.schoolSubtitle,
      showSchoolType: t.showSchoolType,
      showLogo: true,
      logoSize: 60,
      logoPosition: 'left',
    },
    {
      id: uid('info'), type: 'student_info', columns: 2,
      rows: [
        { id: uid('r'), label: isBi ? 'Nom / Name'         : 'Student Name',  field: 'student.name' },
        { id: uid('r'), label: isBi ? 'Matricule / ID'     : 'Student ID',    field: 'student.studentId' },
        { id: uid('r'), label: isBi ? 'Classe / Class'     : 'Class',         field: 'student.classLevel' },
        { id: uid('r'), label: isBi ? 'Tuteur / Guardian'  : 'Guardian',      field: 'student.guardianName' },
        { id: uid('r'), label: isBi ? 'Terme / Term'       : 'Term',          field: 'term.name' },
        { id: uid('r'), label: isBi ? 'Année / Session'    : 'Session',       field: 'term.session' },
      ],
    },
    {
      id: uid('tbl'), type: 'marks_table',
      showSeq1: t.showSeq1, showSeq2: t.showSeq2,
      showGrade: t.showGrade, showRemarks: t.showRemarks,
    },
    {
      id: uid('sum'), type: 'summary',
      boxes: [
        { id: uid('b'), label: 'Total Score', field: 'total' },
        ...(t.showAverage  ? [{ id: uid('b'), label: isBi ? 'Moyenne / Average'        : 'Average',       field: 'average' }]  : []),
        ...(t.showPosition ? [{ id: uid('b'), label: isBi ? 'Moyenne de Classe / Class Average' : 'Class Average', field: 'classAverage' }] : []),
        ...(t.showPosition ? [{ id: uid('b'), label: isBi ? 'Rang / Position'          : 'Position',      field: 'position' }] : []),
      ],
    },
    {
      id: uid('rem'), type: 'remarks',
      label: isBi ? 'Observations / General Remarks' : 'General Remarks',
    },
    {
      id: uid('sig'), type: 'signatures',
      lines: [
        ...(t.showTeacherSig  ? [{ id: uid('s'), label: isBi ? 'Maître de Classe / Class Teacher'        : "Class Teacher's Signature" }] : []),
        ...(t.showPrincipalSig? [{ id: uid('s'), label: `${t.principalTitle}'s Signature` }]                                               : []),
        ...(t.showParentSig   ? [{ id: uid('s'), label: isBi ? 'Parent / Tuteur / Guardian'               : "Parent / Guardian's Signature" }] : []),
      ],
    },
    ...(t.footerText ? [{ id: uid('ft'), type: 'text_block' as const, content: t.footerText, align: 'center' as const }] : []),
  ]
  return { ...t, sections }
}

// ── Section-type defaults (Primary / Secondary / University) ──────────────────
function buildLayout(opts: {
  primaryColor: string; reportTitle: string; subtitle: string
  infoRows: { label: string; field: string }[]
  marks: { showSeq1: boolean; showSeq2: boolean; showGrade: boolean; showRemarks: boolean; showCoef?: boolean; columnOrder?: string[]; headers?: Record<string, string> }
  summaryBoxes: { label: string; field: string }[]
  remarksLabel: string; signatures: string[]; footerText?: string
  gradingLegend?: boolean // university: grade system + classification + legend block
}): TemplateConfig & { sections: LayoutSection[] } {
  const base = TEMPLATE_DEFAULTS.classic
  const sections: LayoutSection[] = [
    { id: uid('hdr'), type: 'header', reportTitle: opts.reportTitle, subtitle: opts.subtitle, showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left' },
    { id: uid('info'), type: 'student_info', columns: 2, rows: opts.infoRows.map(r => ({ id: uid('r'), label: r.label, field: r.field })) },
    { id: uid('tbl'), type: 'marks_table', showSeq1: opts.marks.showSeq1, showSeq2: opts.marks.showSeq2, showGrade: opts.marks.showGrade, showRemarks: opts.marks.showRemarks, ...(opts.marks.showCoef !== undefined ? { showCoef: opts.marks.showCoef } : {}), ...(opts.marks.columnOrder ? { columnOrder: opts.marks.columnOrder } : {}), ...(opts.marks.headers ? { headers: opts.marks.headers } : {}) },
    { id: uid('sum'), type: 'summary', boxes: opts.summaryBoxes.map(b => ({ id: uid('b'), label: b.label, field: b.field })) },
    ...(opts.gradingLegend ? [{ id: uid('leg'), type: 'grading_legend' as const, title: 'Grading System', showGradeSystem: true, showClassification: true, showLegend: true, legendText: DEFAULT_TRANSCRIPT_LEGEND, rightLayout: 'columns' as const, rightTables: [{ id: uid('rt'), title: 'SEMESTER SUMMARY', colCount: 2, rows: [{ id: uid('rr'), cells: [{ text: 'Credits Earned', bold: true }, { field: 'credits' }] }, { id: uid('rr'), cells: [{ text: 'Semester GPA', bold: true }, { field: 'gpa' }] }, { id: uid('rr'), cells: [{ text: 'Cumulative GPA', bold: true }, { field: 'cgpa' }] }, { id: uid('rr'), cells: [{ text: 'Remark', bold: true }, { field: 'classification' }] }] }] }] : []),
    { id: uid('rem'), type: 'remarks', label: opts.remarksLabel },
    { id: uid('sig'), type: 'signatures', lines: opts.signatures.map(l => ({ id: uid('s'), label: l })) },
    ...(opts.footerText ? [{ id: uid('ft'), type: 'text_block' as const, content: opts.footerText, align: 'center' as const }] : []),
  ]
  return { ...base, primaryColor: opts.primaryColor, reportTitle: opts.reportTitle, schoolSubtitle: opts.subtitle, sections }
}

/**
 * "Ledger" layout (non-university): Total Score / Average / Position are rows
 * INSIDE the marks table itself instead of separate stat boxes below it — a
 * TOTAL row (mirrors the transcript's course-total row), then a bold colored
 * "TERM AVERAGE" banner and a "CLASS POSITION" banner (mirrors the transcript's
 * "SEMESTER GPA:" banner line), all resolved live via the same mechanism the
 * transcript-style footer rows already use.
 */
export function getLedgerLayout(): TemplateConfig & { sections: LayoutSection[] } {
  const color = '#0f172a'
  const cols = ['sn', 'subject', 'seq1', 'seq2', 'score', 'grade', 'remarks'] as const
  const ts = Date.now()

  // CITEC-transcript-style banding: near-black full-width term banner on top,
  // light-gray bordered header + TOTAL band, white stats rows, then one big
  // bold "TERM AVERAGE" hero line (mirrors the transcript's SEMESTER GPA row).
  const bandBg = '#f1f5f9'
  const bandFg = '#111827'

  const marksTemplate: SpreadsheetTable = {
    id: `marks_${ts}`,
    title: '',
    colCount: cols.length,
    rows: [
      // Full-width term banner — resolves to "FIRST TERM" etc. per report card.
      {
        id: `mban_${ts}`,
        cells: [
          { field: 'term', bold: true, align: 'left', colSpan: cols.length, bgColor: color, textColor: '#ffffff', fontSize: 11 },
        ],
      },
      {
        id: `mhdr_${ts + 1}`,
        cells: cols.map((k) => ({
          text: MARKS_COL_LABELS[k]?.label ?? k,
          bold: true,
          align: MARKS_COL_LABELS[k]?.align ?? 'center',
          bgColor: bandBg,
          textColor: bandFg,
        })),
      },
      {
        id: `mdata_${ts + 2}`,
        _isDataRow: true,
        cells: cols.map((k) => ({
          field: `m:${k}`,
          align: MARKS_COL_LABELS[k]?.align ?? 'center',
          ...(MARKS_COL_LABELS[k]?.bold ? { bold: true } : {}),
        })),
      },
      // TOTAL band — mirrors the transcript's course-total row.
      {
        id: `mfoot_${ts + 3}`,
        cells: [
          { text: 'TOTAL', bold: true, colSpan: 4, align: 'left', bgColor: bandBg, textColor: bandFg },
          { field: 'total', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
          { text: '', colSpan: 2, bgColor: bandBg },
        ],
      },
      // Secondary stats share one white row: class average | class position.
      // Spans are chosen around the print column widths: the first label
      // absorbs the wide flexible subject column (S/N + Subject), its value
      // lands in the narrow Seq 1 column, the second label spans Seq 2 +
      // Score + Grade (~134px — wide enough that the column border never
      // slices the text), and its value sits in the fixed-width Remarks
      // column at the right edge, on the same border line as the TERM
      // AVERAGE value below it.
      {
        id: `mfoot_${ts + 4}`,
        cells: [
          { text: 'CLASS AVERAGE:', bold: true, colSpan: 2, align: 'right', textColor: '#475569' },
          { field: 'classAverage', bold: true, align: 'center' },
          { text: 'CLASS POSITION:', bold: true, colSpan: 3, align: 'right', textColor: '#475569' },
          { field: 'position', bold: true, align: 'center' },
        ],
      },
      // Hero line — big bold term average, like the transcript's GPA row.
      {
        id: `mfoot_${ts + 5}`,
        cells: [
          { text: 'TERM AVERAGE:', bold: true, colSpan: 6, align: 'right', textColor: color },
          { field: 'average', bold: true, align: 'center', textColor: color, fontSize: 15 },
        ],
      },
    ],
  }

  const sections: LayoutSection[] = [
    { id: uid('hdr'), type: 'header', reportTitle: 'STUDENT LEDGER REPORT', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left' },
    {
      id: uid('info'), type: 'student_info', columns: 2,
      rows: [
        { id: uid('r'), label: 'Student Name', field: 'student.name' },
        { id: uid('r'), label: 'Student ID',    field: 'student.studentId' },
        { id: uid('r'), label: 'Class',         field: 'student.classLevel' },
        { id: uid('r'), label: 'Guardian',      field: 'student.guardianName' },
        { id: uid('r'), label: 'Term',          field: 'term.name' },
        { id: uid('r'), label: 'Session',       field: 'term.session' },
      ],
    },
    { id: uid('tbl'), type: 'marks_table', showSeq1: true, showSeq2: true, showGrade: true, showRemarks: true, template: marksTemplate },
    // Same boxed-table look as the university transcript's grading legend —
    // just the one grade-scale table (no classification/CGPA side table, since
    // that's a university-only concept).
    { id: uid('leg'), type: 'grading_legend', title: 'Grading Scale', showGradeSystem: true, showClassification: false, showLegend: false },
    { id: uid('rem'), type: 'remarks', label: 'General Remarks' },
    {
      id: uid('sig'), type: 'signatures',
      lines: [
        { id: uid('s'), label: "Class Teacher's Signature" },
        { id: uid('s'), label: "Principal's Signature" },
        { id: uid('s'), label: "Parent / Guardian's Signature" },
      ],
    },
  ]

  return { ...TEMPLATE_DEFAULTS.ledger, sections }
}

/**
 * Annual transcript, built from the same section system as every other layout — a
 * marks_table section with `transcriptSemester` set sources its data from that ONE
 * period of the year (instead of the document's combined subjects/entries) but is
 * otherwise a completely normal, editable SpreadsheetTable (columns removable/re-keyable
 * via double-click, same as any other marks table). Everything else (header, student
 * info, grading legend, signatures) is a normal, freely editable section too.
 *
 * Shape follows the school type: a university year is two semesters summarised by
 * credits/CGPA, a primary or secondary year is three terms summarised by the annual
 * average (see getTranscriptTermLayout).
 */
export function getDefaultTranscriptLayout(schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
  if (schoolType && schoolType !== 'UNIVERSITY') return getTranscriptTermLayout(schoolType)
  const color = '#1e3a5f'
  const sections: LayoutSection[] = [
    // Same non-official defaults as the standard university layout (logo left,
    // school type shown) — so unchecking "Official" on this header behaves the
    // same way it does on standard, instead of falling back to its own look.
    { id: uid('hdr'), type: 'header', reportTitle: 'ANNUAL TRANSCRIPT', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left' },
    {
      id: uid('info'), type: 'student_info', columns: 2,
      rows: [
        { id: uid('r'), label: 'Student Name', field: 'student.name' },
        { id: uid('r'), label: 'Matricule No.', field: 'student.studentId' },
        { id: uid('r'), label: 'Programme', field: 'student.classLevel' },
        { id: uid('r'), label: 'Sex', field: 'student.gender' },
        { id: uid('r'), label: 'Academic Year', field: 'term.session' },
      ],
    },
    { id: uid('tbl1'), type: 'marks_table', showSeq1: true, showSeq2: true, showGrade: true, showRemarks: false, transcriptSemester: 'sem1', template: seedTranscriptMarksTable(color) },
    { id: uid('tbl2'), type: 'marks_table', showSeq1: true, showSeq2: true, showGrade: true, showRemarks: false, transcriptSemester: 'sem2', template: seedTranscriptMarksTable(color) },
    {
      id: uid('leg'), type: 'grading_legend', title: 'Grading System',
      showGradeSystem: true, showClassification: true, showLegend: true, legendText: DEFAULT_TRANSCRIPT_LEGEND,
      rightLayout: 'columns',
      rightTables: [{
        id: uid('rt'), title: 'OVERALL SUMMARY', colCount: 2,
        rows: [
          { id: uid('rr'), cells: [{ text: 'Credits Earned', bold: true }, { field: 'credits' }] },
          { id: uid('rr'), cells: [{ text: 'Cumulative GPA', bold: true }, { field: 'cgpa' }] },
          { id: uid('rr'), cells: [{ text: 'Remark', bold: true }, { field: 'classification' }] },
        ],
      }],
    },
    {
      id: uid('sig'), type: 'signatures',
      lines: [
        { id: uid('s'), label: "Dean of Studies' Signature" },
        { id: uid('s'), label: "Registrar's Signature" },
      ],
    },
  ]

  return { ...TEMPLATE_DEFAULTS.classic, template: 'classic', primaryColor: color, reportTitle: 'ANNUAL TRANSCRIPT', schoolSubtitle: '', sections }
}

/**
 * Primary/secondary annual transcript: the year's THREE terms, one marks table each,
 * summarised by the annual average rather than the university's credits/CGPA. Printed
 * from the third term, once every term of the year is published.
 */
function getTranscriptTermLayout(schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
  const color = schoolType === 'PRIMARY' ? '#0f766e' : '#1e3a5f'
  const pupil = schoolType === 'PRIMARY'
  const sections: LayoutSection[] = [
    { id: uid('hdr'), type: 'header', reportTitle: 'ANNUAL REPORT', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left' },
    {
      id: uid('info'), type: 'student_info', columns: 2,
      rows: [
        { id: uid('r'), label: pupil ? 'Pupil Name' : 'Student Name', field: 'student.name' },
        { id: uid('r'), label: pupil ? 'Pupil ID' : 'Student ID', field: 'student.studentId' },
        { id: uid('r'), label: 'Class', field: 'student.classLevel' },
        { id: uid('r'), label: 'Sex', field: 'student.gender' },
        { id: uid('r'), label: 'Academic Year', field: 'term.session' },
      ],
    },
    ...transcriptPeriodsFor(schoolType).map(p => ({
      id: uid(`tbl_${p}`), type: 'marks_table' as const,
      showSeq1: true, showSeq2: true, showGrade: true, showRemarks: true,
      transcriptSemester: p, template: seedTranscriptMarksTable(color, schoolType),
    })),
    {
      id: uid('leg'), type: 'grading_legend', title: 'Grading Scale',
      showGradeSystem: true, showClassification: false, showLegend: false,
      rightLayout: 'columns',
      rightTables: [{
        id: uid('rt'), title: 'OVERALL SUMMARY', colCount: 2,
        rows: [
          { id: uid('rr'), cells: [{ text: 'Annual Average', bold: true }, { field: 'average' }] },
          { id: uid('rr'), cells: [{ text: 'Grade', bold: true }, { field: 'grade' }] },
        ],
      }],
    },
    {
      id: uid('sig'), type: 'signatures',
      lines: [
        { id: uid('s'), label: "Class Teacher's Signature" },
        { id: uid('s'), label: pupil ? "Head Teacher's Signature" : "Principal's Signature" },
        { id: uid('s'), label: "Parent / Guardian's Signature" },
      ],
    },
  ]

  return { ...TEMPLATE_DEFAULTS.classic, template: 'classic', primaryColor: color, reportTitle: 'ANNUAL REPORT', schoolSubtitle: '', sections }
}

/** Default report-card layout tailored to the school's section type. */
export function getDefaultLayoutForType(schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
  if (schoolType === 'PRIMARY') return buildLayout({
    primaryColor: '#0f766e',
    reportTitle: 'PRIMARY SCHOOL REPORT CARD', subtitle: '',
    infoRows: [
      { label: 'Pupil Name', field: 'student.name' },
      { label: 'Pupil ID', field: 'student.studentId' },
      { label: 'Class', field: 'student.classLevel' },
      { label: 'Parent / Guardian', field: 'student.guardianName' },
      { label: 'Term', field: 'term.name' },
      { label: 'Session', field: 'term.session' },
    ],
    marks: { showSeq1: true, showSeq2: true, showGrade: true, showRemarks: true },
    summaryBoxes: [
      { label: 'Average', field: 'average' },
      { label: 'Class Average', field: 'classAverage' },
      { label: 'Position', field: 'position' },
      { label: 'Conduct', field: 'conduct' },
      { label: 'Attendance', field: 'attendance' },
      { label: 'No. on Roll', field: 'rollCount' },
    ],
    remarksLabel: "Class Teacher's Comment",
    signatures: ["Class Teacher's Signature", "Head Teacher's Signature", "Parent / Guardian's Signature"],
  })
  if (schoolType === 'UNIVERSITY') return buildLayout({
    primaryColor: '#1e3a8a',
    reportTitle: 'STUDENT TRANSCRIPT', subtitle: '',
    infoRows: [
      { label: 'Student Name', field: 'student.name' },
      { label: 'Matricule No.', field: 'student.studentId' },
      { label: 'Programme', field: 'student.classLevel' },
      { label: 'Sex / Gender', field: 'student.gender' },
      { label: 'Semester', field: 'term.name' },
      { label: 'Academic Year', field: 'term.session' },
    ],
    // HND/University transcript: Code | Course Title | CA/25 | Exam/70 | Total/100 | Grade | GPA | Evaluation | Credit | Weight | Jury Decision
    marks: {
      showSeq1: true, showSeq2: true, showGrade: true, showRemarks: false, showCoef: false,
      columnOrder: ['code', 'subject', 'seq1', 'seq2', 'score', 'grade', 'gradePoint', 'evaluation', 'credit', 'weighted', 'juryDecision'],
      headers: { subject: 'Course Title', seq1: 'CA/25', seq2: 'EXAM/70', score: 'TOTAL/100', code: 'Code', credit: 'Credit', grade: 'Grade', gradePoint: 'GP', evaluation: 'Evaluation', weighted: 'Weight', juryDecision: 'Jury Decision' },
    },
    summaryBoxes: [
      { label: 'Total Credits', field: 'credits' },
      { label: 'Semester GPA', field: 'gpa' },
      { label: 'Cumulative GPA', field: 'cgpa' },
      { label: 'Classification', field: 'classification' },
    ],
    remarksLabel: 'Remark',
    signatures: ["Dean of Studies", "Registrar"],
    gradingLegend: true,
  })
  return getDefaultLayout('classic') // secondary / default
}

/**
 * Resolve the school's saved STANDARD/LEDGER design from a fetched template
 * config, for printing regular report cards. Never returns the transcript
 * design: the `transcript` sub-key is dropped, and a legacy row whose top
 * level IS the transcript (saved before the sub-key existed) counts as having
 * no standard design at all — its semester-scoped tables render nothing
 * outside the transcript page, so falling back to the school-type default is
 * the only rendering that shows the student's marks.
 */
export function mergeSavedStandardConfig(saved: Partial<TemplateConfig> | null | undefined, schoolType?: string): TemplateConfig {
  const { transcript: _t, ...top } = (saved ?? {}) as Partial<TemplateConfig>
  if (Object.keys(top).length === 0 || top.layoutType === 'transcript') return getDefaultLayoutForType(schoolType)
  const base = TEMPLATE_DEFAULTS[(top.template as TemplateName) ?? 'classic']
  return { ...base, ...top } as TemplateConfig
}

// ── API helpers ───────────────────────────────────────────────────────────────
export const getTemplateApi = async (): Promise<{ config: Partial<TemplateConfig> }> => {
  const res = await api.get('/report-card-template')
  return res.data
}

export const saveTemplateApi = async (config: TemplateConfig) => {
  const res = await api.put('/report-card-template', { config })
  return res.data
}
