import api from './client'

// The six colour themes. Since the 2026 redesign these differ by PALETTE only — every
// one renders the same layout (see getDefaultLayout) — so the names are labels for a
// colour scheme, not for a structure. `ledger` is retained purely so designs saved before
// the redesign still resolve; it is no longer offered in the designer.
export type TemplateName = 'classic' | 'bilingual' | 'modern' | 'official' | 'emerald' | 'slate' | 'ledger'

/** Palette for one theme. `primary` is the dark structural colour (header bands, table
 *  head, rules); `accent` is the metallic/secondary used for the term chip, the
 *  End-of-Year band and hairline rules. */
export const THEME_PALETTES: Record<TemplateName, { primary: string; accent: string; label: string }> = {
  classic:   { primary: '#1d3557', accent: '#b58a2b', label: 'Classic' },
  bilingual: { primary: '#14532d', accent: '#b58a2b', label: 'Bilingual' },
  modern:    { primary: '#1e40af', accent: '#64748b', label: 'Modern' },
  official:  { primary: '#7f1d1d', accent: '#b58a2b', label: 'Official' },
  emerald:   { primary: '#0f5132', accent: '#a97142', label: 'Emerald' },
  slate:     { primary: '#334155', accent: '#b87333', label: 'Slate' },
  // Legacy, not offered: same palette as classic so an old saved design keeps its look.
  ledger:    { primary: '#0f172a', accent: '#b58a2b', label: 'Ledger' },
}

/**
 * Split one stored letterhead block (officialLeftTextEn and friends) into typed lines for
 * the redesign's crest header. Roles are inferred rather than configured, because these
 * fields are plain text a school types in School Settings:
 *
 *   title   – the first line, or any line explicitly wrapped in <b>
 *   motto   – a line wrapped in <i>, or a non-title line that ISN'T all-caps
 *             ("Peace-Work-Fatherland" beside "MINISTRY OF SECONDARY EDUCATION")
 *   heading – everything else
 *
 * Shared by the print renderer and the designer canvas so the two can never disagree.
 */
export type HeaderLineRole = 'title' | 'heading' | 'motto'
export function parseHeaderLines(raw: string): { text: string; role: HeaderLineRole }[] {
  return raw.split(/<br\s*\/?>|\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const bold = /<b>/i.test(line)
      const em = /<i>/i.test(line)
      const text = line.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
      const isTitle = bold || (!em && i === 0)
      const role: HeaderLineRole = isTitle ? 'title'
        : (em || text !== text.toUpperCase()) ? 'motto'
        : 'heading'
      return { text, role }
    })
    .filter(l => !!l.text)
}

/** Inline styles for each letterhead line role — one source for both renderers. */
export function headerLineStyle(role: HeaderLineRole, color: string): Record<string, string | number> {
  if (role === 'title') return { fontFamily: 'Caladea, Georgia, "Times New Roman", serif', fontSize: 11, fontWeight: 'bold', letterSpacing: .5, color, textTransform: 'uppercase' }
  if (role === 'motto') return { fontSize: 7.4, letterSpacing: .9, color: '#8a7c58', textTransform: 'uppercase' }
  return { fontSize: 8.4, fontWeight: 'bold', letterSpacing: .5, color: '#33415c', textTransform: 'uppercase' }
}

/** Themes shown in the designer, in order. `ledger` is deliberately absent. */
export const SELECTABLE_THEMES: TemplateName[] = ['classic', 'bilingual', 'modern', 'official', 'emerald', 'slate']

/** The design's secondary colour. Falls back to the theme's own accent, then to the
 *  classic gold — a design saved before accentColor existed must never render accent-less. */
export function accentOf(cfg: { accentColor?: string; template?: TemplateName }): string {
  return cfg.accentColor || THEME_PALETTES[cfg.template ?? 'classic']?.accent || '#b58a2b'
}

// ── Legacy toggle-based config (kept for backward compat) ─────────────────────
export interface TemplateConfig {
  template: TemplateName
  primaryColor: string
  /** Secondary/metallic colour — term chip, End-of-Year band, hairline rules. Optional so
   *  pre-redesign designs stay valid; read it through accentOf(), never directly. */
  accentColor?: string
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
  // School-wide marking policy (NOT per-layout): print a failed subject's numbers and
  // grade letter in red instead of black. Applies to the report card, the ledger and
  // the transcript alike, so it always lives at the TOP level of the saved config, even
  // when the transcript design is the one being saved — see the designer's handleSave.
  // Undefined/true = red (matches the printed transcript convention this was modeled on).
  // What counts as a fail comes from the school's own grading scale (isFailingScore),
  // so it's a mark /100 at a university and a subject's term average /20 elsewhere.
  highlightFailingRed?: boolean
  // School-wide marking policy (NOT per-layout, same convention as highlightFailingRed):
  // whether the identity box's photo frame prints at all — on every layout that has one
  // (Standard, Ledger, Annual), for every student, with or without a photo on file (no
  // photo = an empty labelled rectangle, left for a physical photo to be glued in by
  // hand). Undefined/true = shown, matching how the frame behaved before this toggle
  // existed.
  showStudentPhoto?: boolean
  // Same school-wide convention: the photo frame's width in px (its height always
  // stretches to match the identity box beside it, so only width is a free choice — same
  // as HeaderSec.logoSize). Clamped to STUDENT_PHOTO_SIZE_MIN/MAX wherever it's used, so a
  // bad saved value (or an old design from before this existed) can't blow out the layout.
  // Undefined = the pre-toggle default width.
  studentPhotoSize?: number
  // School-wide (NOT per-layout, same convention as highlightFailingRed): print the
  // student's promotion Decision (Pass / Promoted on Trial / Repeat, in the school's own
  // PromotionScale wording) as a stat box next to Average/Position. Primary/secondary
  // only — never offered for a university. Undefined/false = hidden, since this is a new
  // opt-in field and existing saved designs must not suddenly start printing it.
  showDecision?: boolean
  // sections-based layout (overrides toggle config if present)
  sections?: LayoutSection[]
  // background color of the card paper
  bgColor?: string
  // watermark
  // `showOn` scopes the watermark to one printed copy, the way a section's does — it is
  // what stamps UNOFFICIAL across a student copy while the sealed official stays clean.
  // Undefined = both copies, so existing watermarks are unaffected.
  // Every field is OPTIONAL because only what an admin actually set is stored — a field left
  // alone keeps resolving to its default, and some of those defaults depend on `type` (a logo
  // watermark is upright and 240px, text is diagonal and 80px). Writing the resolved defaults
  // into the saved object instead would freeze a text tilt onto a logo the moment the type
  // changed. Readers must therefore default every field: see the designer's `watermark` and
  // PrintableReportCard's Watermark, which resolve the same ones.
  watermark?: { enabled?: boolean; type?: 'text' | 'logo'; text?: string; color?: string; opacity?: number; logoUrl?: string | null; size?: number; rotation?: number; x?: number; y?: number; showOn?: DocVariant }
  // top-level layout type — 'standard' (section-based designer), 'transcript' (the
  // annual/multi-period stacked design), or 'ledger' (totals-merged-into-the-table style)
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
  /**
   * One-time marker: the Date/Place of Birth rows have been offered to this design.
   * Adding them to the built-in defaults only reaches designs created AFTERWARDS, and a
   * school that had already saved its layout would never see them. So a saved design
   * picks them up once (see ensureBirthRows) and this records that it happened, which is
   * what stops them reappearing for an admin who deliberately deletes them.
   * Lives inside each design, so the report card and the transcript are marked separately.
   */
  birthRowsSeeded?: boolean
  /**
   * One-time marker: a Stamp/Seal section has been offered to this design. Ledger and
   * Annual only got a stamp in their built-in defaults after the Official/Student copy
   * split shipped, so a Ledger or Annual design saved before then would never see one —
   * same backfill idiom as birthRowsSeeded (see ensureStampSection).
   */
  stampSeeded?: boolean
  /** Same backfill idiom again: the annual document's Annual Average row has been offered
   *  to this saved design once (see ensureAnnualAverageRow). */
  annualAverageRowSeeded?: boolean
  /** And once for moving a centred seal to the right (see ensureStampOnRight). */
  stampAlignSeeded?: boolean
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
  officialTextScale?: number
  /** Redesign letterhead. 'crest' = the three-column bilingual letterhead with the seal
   *  centred between EN and FR blocks; 'logo' = a thin republic strip above a large
   *  centred school name with the logo to its left. Undefined = the pre-redesign header,
   *  so an old saved design renders exactly as before. */
  headerStyle?: 'crest' | 'logo'
  /** 'logo' style only: the thin bilingual republic strip along the very top. */
  showRepublicStrip?: boolean
  /** Ruled contact line under the letterhead (P.O. Box · Tel · email · website). */
  showContactLine?: boolean
  /** The dark title ribbon with the term/session chip on its right. */
  showTitleRibbon?: boolean
  /** Term/session chip background, independent of the shared accent colour. Unset =
   *  follows accent (unchanged look for every design saved before this existed). */
  termChipColor?: string
  /** Text colour of that same chip. The chip's words are generated (term name + session),
   *  not an editable field, so they cannot be coloured by selecting them — this is how. */
  termChipTextColor?: string }

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

export interface StudentInfoSec{ id: string; type: 'student_info'; columns: 1|2|3; rows: InfoRow[]
  /** Redesign: box the rows, with room to their right for the photo frame — shown or
   *  hidden by the school-wide TemplateConfig.showStudentPhoto toggle, not per-section.
   *  The frame prints as an empty labelled rectangle when the student has no photo on
   *  file, so the card's shape is the same either way. */
  boxed?: boolean }
export interface MarksTableSec { id: string; type: 'marks_table';  showSeq1: boolean; showSeq2: boolean; showCoef?: boolean; showGrade: boolean; showRemarks: boolean; headers?: Record<string,string>; headerColor?: string; colColors?: Record<string,string>; columnOrder?: string[];
  /** When set, the marks table is rendered from this SpreadsheetTable template instead of the default layout. The row marked _isDataRow repeats per subject in the print renderer. */
  template?: SpreadsheetTable
  /** Small caps caption printed above the table with a rule beside it (the redesign's
   *  "ACADEMIC RECORD — THIRD TERM"). `{term}` is replaced with the card's term name. */
  caption?: string
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
  // Deliberately valueless: a ruled box the subject teacher initials by hand once the
  // card is printed. Resolves to '' for every student, like the signature rules elsewhere.
  visa:         { label: "Teacher's Visa", align: 'center' },
}

/** Marks columns that never carry data — printed blank to be completed by hand. */
export const BLANK_MARKS_COLS = new Set(['visa'])

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
  // Neither university (CA/Exam, no coefficient) nor primary (Test/Exam, plain average, no
  // coefficient) ever weight a subject by coefficient — see reportcard.controller.ts.
  const cols = marksColumnOrder(sec).filter(k => !((schoolType === 'UNIVERSITY' || schoolType === 'PRIMARY') && k === 'coef'))
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
  if (schoolType && schoolType !== 'UNIVERSITY') return seedTranscriptTermMarksTable(color, schoolType)
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
 *  annual transcript. No GPA machinery (that's university-only): secondary subjects carry
 *  a coefficient and the hero line is the term's own coefficient-weighted average out of
 *  20; primary subjects carry no coefficient (Test+Exam, plain average, out of 100 — see
 *  reportcard.controller.ts saveEntries). */
function seedTranscriptTermMarksTable(color: string, schoolType?: string): SpreadsheetTable {
  const isPrimary = schoolType === 'PRIMARY'
  const cols = isPrimary
    ? (['subject', 'seq1', 'seq2', 'score', 'grade', 'remarks'] as const)
    : (['subject', 'coef', 'seq1', 'seq2', 'score', 'grade', 'remarks'] as const)
  const labels: Record<string, string> = isPrimary
    ? { subject: 'SUBJECT', seq1: 'TEST', seq2: 'EXAM', score: 'TOTAL', grade: 'GRADE', remarks: 'REMARKS' }
    : { subject: 'SUBJECT', coef: 'COEF', seq1: 'SEQ 1', seq2: 'SEQ 2', score: 'AVERAGE', grade: 'GRADE', remarks: 'REMARKS' }
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
      // TOTAL row. Secondary: coefficient and weighted-point sums, scoped to this table's
      // term — wpTotal here is Σ(avg × coef) (see the school-type branch in statResolver's
      // scopedAgg handling), not the raw Σ of averages 'total' would give. Primary has no
      // coefficient at all, so it's just the plain Overall Total (Σ of subject totals).
      // Spans are sized against this table's own column widths (NARROW_PX in
      // PrintableReportCard.tsx) — a label defaulting to colSpan 1 on a narrow numeric
      // column clips its own text.
      {
        id: `mfoot_${ts + 2}`,
        cells: isPrimary
          ? [
              { text: 'TOTAL:', bold: true, colSpan: 5, align: 'right', bgColor: bandBg, textColor: bandFg },
              { field: 'total', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
            ]
          : [
              { text: 'TOTAL:', bold: true, align: 'right', bgColor: bandBg, textColor: bandFg },
              { field: 'coefTotal', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
              { text: 'TOTAL POINTS:', bold: true, colSpan: 4, align: 'right', bgColor: bandBg, textColor: bandFg },
              { field: 'wpTotal', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
            ],
      } as SheetRow,
      // Hero line — this term's own average.
      {
        id: `mfoot_${ts + 3}`,
        cells: isPrimary
          ? [
              { text: 'TERM AVERAGE /20:', bold: true, colSpan: 4, align: 'right', textColor: color },
              { field: 'average', bold: true, align: 'center', textColor: color, fontSize: 15 },
              { text: '', colSpan: 1 },
            ]
          : [
              { text: 'TERM AVERAGE /20:', bold: true, colSpan: 4, align: 'right', textColor: color },
              { field: 'average', bold: true, align: 'center', textColor: color, fontSize: 15 },
              { text: '', colSpan: 2 },
            ],
      } as SheetRow,
    ],
  }
}

export interface SummarySec    { id: string; type: 'summary';      boxes: SummaryBox[]; valueColor?: string }
export interface RemarksSec    { id: string; type: 'remarks';      label: string; placeholderColor?: string
  /** Redesign: render as a bordered panel with a titled header bar (the mockup's
   *  "Class Master's Remark" / "General Remarks" boxes) rather than the older plain block.
   *  Undefined = the old look, so pre-redesign designs are untouched. */
  panel?: boolean
  /** Panel variant only: draw a thick coloured bar down the left edge (the mockup's
   *  General Remarks box). Uses the theme accent unless overridden. */
  edgeColor?: string
  /** Panel variant only: a signature rule under the text, with this caption. */
  signatureCaption?: string }

/**
 * Conduct & Attendance — printed as a LABELLED BUT EMPTY panel. The school stores none of
 * this (the Attendance feature records TEACHER absence, not students'), so every value
 * prints blank for the class master to complete by hand, exactly like the ruled signature
 * lines elsewhere on the card. Labels are editable; add/remove rows freely.
 */
export interface ConductSec {
  id: string; type: 'conduct'
  title?: string
  rows: { id: string; label: string }[]
}

/**
 * The gold "End of Year" strip. Only renders on the session's FINAL term — it is gated on
 * annualAverage being present, the same rule Annual Average/Position and the promotion
 * Decision already follow, so a First/Second Term card simply omits it.
 */
export interface AnnualBandSec {
  id: string; type: 'annual_band'
  /** Vertical tag down the left edge. */
  tag?: string
  cells: { id: string; label: string; field: string }[]
}
export interface SignaturesSec { id: string; type: 'signatures';   lines: SignatureLine[] }
export interface TextBlockSec  { id: string; type: 'text_block';   content: string; align: 'left'|'center'|'right' }
/**
 * The school's official stamp/seal (School.stamp, uploaded in School Settings).
 * Nothing here decides whether it prints: mark the section `showOn: 'official'` so it
 * appears on the sealed copy and never on the student's. Prints nothing when the school
 * hasn't uploaded a stamp, leaving room to stamp the page by hand instead.
 */
export interface StampSec      { id: string; type: 'stamp';        size: number; align: 'left'|'center'|'right'; label?: string }
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

/**
 * Which printed copy a document is: the OFFICIAL one the school seals and sends on
 * itself (WES and the like), or the STUDENT copy handed out at the end of a term.
 *
 * Deliberately NOT called "official header" — `HeaderSec.officialHeader` already means
 * the Cameroon letterhead block and has nothing to do with this.
 *
 * The variant is chosen when PRINTING, never saved into the design: a school needs both
 * copies available at once, so it can't be a property of the one saved layout.
 */
export type DocVariant = 'official' | 'student'

/** Per-section variant scoping. Undefined means the section prints on BOTH copies, so
 *  an untouched design behaves exactly as it did before this existed. */
export interface SectionVariant {
  /** Restrict this section to one copy (e.g. the registrar's signature and school seal
   *  on the official only; a "not valid for official use" note on the student copy). */
  showOn?: DocVariant
}

/** Does this section print on the copy being produced? */
export function sectionShowsOn(sec: SectionVariant, variant: DocVariant): boolean {
  return !sec.showOn || sec.showOn === variant
}

export type LayoutSection = (
  | HeaderSec | StudentInfoSec | MarksTableSec | SummarySec
  | RemarksSec | SignaturesSec | TextBlockSec | DividerSec | GradingLegendSec | StampSec
  | ConductSec | AnnualBandSec | PanelRowSec
) & SectionVariant

/**
 * Lays its children side by side in one row (the mockup pairs Grading Scale with Conduct,
 * and the two remark boxes with the stamp). A row rather than a CSS concern because the
 * designer reorders and deletes whole sections — nesting keeps a pair moving together.
 * `weights` are flex ratios, one per child.
 */
export interface PanelRowSec {
  id: string; type: 'panel_row'
  children: LayoutSection[]
  weights?: number[]
}

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

// ── Theme presets ─────────────────────────────────────────────────────────────
// Since the 2026 redesign every theme renders the SAME layout and differs only in its
// palette (see THEME_PALETTES / getDefaultLayout). The per-template structural toggles
// below are identical across all six on purpose — they are legacy fields the sections
// renderer no longer consults, kept so the type and any pre-redesign saved design stay
// valid. To restyle a theme, change its entry in THEME_PALETTES, not here.
const themeBase = (name: TemplateName, reportTitle: string, footerText = ''): TemplateConfig => ({
  template: name,
  primaryColor: THEME_PALETTES[name].primary,
  accentColor: THEME_PALETTES[name].accent,
  reportTitle, schoolSubtitle: '',
  showSchoolType: true, showSeq1: true, showSeq2: true,
  showGrade: true, showRemarks: true, showPosition: true, showAverage: true,
  showGeneralRemarks: true, showTeacherSig: true, showPrincipalSig: true, showParentSig: true,
  principalTitle: 'Principal', footerText,
})

export const TEMPLATE_DEFAULTS: Record<TemplateName, TemplateConfig> = {
  classic:   themeBase('classic',   'STUDENT REPORT CARD'),
  bilingual: themeBase('bilingual', 'STUDENT REPORT CARD', 'Paix — Travail — Patrie / Peace — Work — Fatherland'),
  modern:    themeBase('modern',    'STUDENT REPORT CARD'),
  official:  themeBase('official',  'STUDENT REPORT CARD', 'This report is an official academic document of the school.'),
  emerald:   themeBase('emerald',   'STUDENT REPORT CARD'),
  slate:     themeBase('slate',     'STUDENT REPORT CARD'),
  ledger:    themeBase('ledger',    'STUDENT LEDGER REPORT'),
}

export const DEFAULT_CONFIG = TEMPLATE_DEFAULTS.classic

// The identity box's photo frame: default/min/max width in px (its height always
// stretches to match the rows box beside it). Shared by the designer's slider and the
// print renderer so a bad/stale saved value is clamped identically in both places.
export const STUDENT_PHOTO_SIZE_DEFAULT = 74
export const STUDENT_PHOTO_SIZE_MIN = 50
export const STUDENT_PHOTO_SIZE_MAX = 150
export function clampStudentPhotoSize(size?: number): number {
  if (size == null || Number.isNaN(size)) return STUDENT_PHOTO_SIZE_DEFAULT
  return Math.min(STUDENT_PHOTO_SIZE_MAX, Math.max(STUDENT_PHOTO_SIZE_MIN, size))
}

// Starter text for the official Cameroon-style three-column header (editable).
export const OFFICIAL_HEADER_LEFT = `<b>RÉPUBLIQUE DU CAMEROUN</b><br><i>Paix - Travail - Patrie</i><br>MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES<br>DÉLÉGATION RÉGIONALE DE …<br>DÉLÉGATION DÉPARTEMENTALE DE …`
export const OFFICIAL_HEADER_RIGHT = `<b>REPUBLIC OF CAMEROON</b><br><i>Peace - Work - Fatherland</i><br>MINISTRY OF SECONDARY EDUCATION<br>REGIONAL DELEGATION OF …<br>DIVISIONAL DELEGATION FOR …`

// ── Default layout builder ────────────────────────────────────────────────────
let _id = 0
const uid = (prefix: string) => `${prefix}_${++_id}_${Math.random().toString(36).slice(2, 6)}`

/**
 * The 2026 house design, for every school type. One layout; the six themes only change
 * its palette (THEME_PALETTES). Structure, top to bottom:
 *
 *   letterhead → identity box + photo frame → captioned marks table (ONE straight table,
 *   no subject-group bands) → five stat boxes → End-of-Year band (final term only) →
 *   grading scale beside the blank conduct panel → general remarks → the two remark
 *   boxes beside the stamp → footer line.
 *
 * Built out of ordinary sections so everything the designer already does — drag to
 * reorder, edit any text, add/remove/re-key table columns, scope a section to one printed
 * copy — keeps working with no special cases.
 */
function buildRedesignLayout(tpl: TemplateName, schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
  const t = TEMPLATE_DEFAULTS[tpl]
  const color = t.primaryColor
  const accent = accentOf(t)
  const isUni = schoolType === 'UNIVERSITY'
  const isPrimary = schoolType === 'PRIMARY'
  const learner = isPrimary ? 'Pupil' : 'Student'
  const periodWord = isUni ? 'Semester' : 'Term'

  // University marks on a /100 course scale with credits and grade points; secondary on the
  // Cameroon /20 sequence-and-coefficient grid; primary on a raw Test+Exam scale out of the
  // class's own maxScore. Primary's SUBJECTS are raw, but its average is coefficient-weighted
  // and normalised to /20 exactly like secondary's — see saveEntries. (This note used to say
  // primary had "NO coefficient weighting, plain average"; that stopped being true when the
  // weighting landed, and the /20 labels below were wrong for as long as it stood.)
  // Same table either way — only the columns and their headers differ.
  // No `visa` column by default. It is a blank box for a teacher to initial by hand, which
  // most schools do not use, and it padded every card with an empty right-hand column. Still
  // available from the designer's "Add column" for a school that wants one.
  const cols = isUni
    ? ['sn', 'code', 'subject', 'credit', 'seq1', 'seq2', 'score', 'grade', 'gradePoint', 'weighted']
    : isPrimary
      ? ['sn', 'subject', 'seq1', 'seq2', 'score', 'grade', 'remarks']
      : ['sn', 'subject', 'coef', 'seq1', 'seq2', 'score', 'weighted', 'grade', 'remarks']
  const headers: Record<string, string> = isUni
    ? { subject: 'Course Title', credit: 'Credits', seq1: 'CA', seq2: 'Exam', score: 'Total /100', gradePoint: 'GP', weighted: 'WGP' }
    : isPrimary
      ? { subject: 'Subject', seq1: 'Test', seq2: 'Exam', score: 'Total /100', remarks: 'Remark' }
      : { score: 'Avg /20', weighted: 'Avg × Coef', remarks: 'Remark' }

  const ts = Date.now()
  // Same pair the Ledger and transcript bands use — see the totals band below for why the
  // foreground has to be dark rather than white.
  const bandBg = '#f1f5f9'
  const bandFg = '#111827'
  const marksTemplate: SpreadsheetTable = {
    id: `marks_${ts}`,
    title: '',
    colCount: cols.length,
    rows: [
      {
        id: `mhdr_${ts}`,
        cells: cols.map((k) => ({
          text: headers[k] ?? MARKS_COL_LABELS[k]?.label ?? k,
          bold: true, align: MARKS_COL_LABELS[k]?.align ?? 'center',
          bgColor: color, textColor: '#ffffff',
        })),
      },
      {
        id: `mdata_${ts + 1}`,
        _isDataRow: true,
        cells: cols.map((k) => ({
          field: `m:${k}`,
          align: MARKS_COL_LABELS[k]?.align ?? 'center',
          ...(MARKS_COL_LABELS[k]?.bold ? { bold: true } : {}),
          ...(k === 'weighted' ? { bgColor: '#f4f1e8', bold: true } : {}),
        })),
      },
      // Totals bands. One row per figure: a right-aligned label taking every column but the
      // last, and the value in the last — so a band ALWAYS spans exactly cols.length,
      // whatever columns the school type has or an admin later removes.
      //
      // This used to be one hand-spanned row per school type, and primary's was a verbatim
      // copy of secondary's: 10 columns wide (referencing coefTotal/wpTotal, which primary
      // has no column for) sitting under an 8-column table. A browser widens a table to fit
      // its widest row, so the header and data rows came up two columns short — the marks
      // grid hugged the left edge with two stray cells hanging off the totals row.
      ...(isUni
        ? [
            { label: 'TOTAL CREDITS', field: 'credits' },
            { label: 'TOTAL POINTS', field: 'wpTotal' },
            { label: 'GPA', field: 'gpa' },
          ]
        : isPrimary
          // No band at all. The five summary boxes sit immediately below this table and
          // already state the term average, so a band here only repeats it directly under
          // the Grade and Remark columns — and primary has no coefficient column of its
          // own to total up in the first place.
          //
          // Ledger keeps its equivalent bands (see getLedgerLayout): that layout has no
          // summary section, so there the bands are the only place the figures appear.
          ? []
          // Σ(avg × coef) — the numerator of the weighted average, matching the "Avg × Coef"
          // column above it. NOT `total` (Σ of the raw averages), which would not divide by
          // the coefficient total to give the term average.
          : [
              { label: 'TOTAL COEFFICIENTS', field: 'coefTotal' },
              { label: 'TOTAL POINTS OBTAINED', field: 'wpTotal' },
              { label: 'WEIGHTED AVERAGE /20', field: 'average' },
            ]
      // DARK text on a light band, never white-on-colour. The print page forces
      // `tbody td { background-color: transparent !important }` to kill row shading, and a
      // totals row lives in the tbody — so a coloured background is stripped at print time
      // and white text lands on white paper, i.e. vanishes. Dark-on-light survives that
      // (it is why the Ledger layout's bands read correctly), and still looks like a band
      // in the designer, where the background is not stripped.
      ).map((band, i) => ({
        id: `mfoot_${ts + 2 + i}`,
        cells: [
          { text: band.label, bold: true, colSpan: Math.max(1, cols.length - 1), align: 'right' as const, bgColor: bandBg, textColor: bandFg },
          { field: band.field, bold: true, align: 'center' as const, bgColor: band.field === 'wpTotal' ? accent : bandBg, textColor: bandFg },
        ],
      })),
    ],
  }

  const infoRows = [
    { label: 'Name', field: 'student.name' },
    { label: `${learner} ID`, field: 'student.studentId' },
    { label: isUni ? 'Programme' : 'Class', field: 'student.classLevel' },
    { label: 'Sex', field: 'student.gender' },
    { label: 'Date of Birth', field: 'student.dateOfBirth' },
    { label: 'Place of Birth', field: 'student.placeOfBirth' },
    { label: periodWord, field: 'term.name' },
    { label: 'Academic Year', field: 'term.session' },
  ]

  // Five stat boxes. `appreciation` is the school's own grading-scale remark for the term
  // average — real data, unlike a per-term pass/fail, which the system does not compute.
  const summaryBoxes = isUni
    ? [
        { label: 'Total Credits', field: 'credits' },
        { label: `${periodWord} GPA`, field: 'gpa' },
        { label: 'Cumulative GPA', field: 'cgpa' },
        { label: 'Class Average', field: 'classAverage' },
        { label: 'Classification', field: 'classification' },
      ]
    : [
        // /20 for primary as well as secondary. A primary school marks its SUBJECTS on a
        // raw 0-100 scale, but the average it states is coefficient-weighted and normalised
        // to /20 (see saveEntries, and §7 of DOCUMENTATION.md) — these labels used to read
        // "/100" for primary and sat next to a figure like 11.2, which is the /20 average.
        { label: `${periodWord} Average /20`, field: 'average' },
        { label: 'Class Average /20', field: 'classAverage' },
        { label: 'Position in Class', field: 'position' },
        { label: 'Best Average', field: 'bestAverage' },
        { label: 'Appreciation', field: 'appreciation' },
      ]

  const sections: LayoutSection[] = [
    {
      id: uid('hdr'), type: 'header',
      reportTitle: t.reportTitle, subtitle: '',
      showSchoolType: true, showLogo: true, logoSize: 74, logoPosition: 'center',
      headerStyle: 'crest', showRepublicStrip: true, showContactLine: true, showTitleRibbon: true,
      showEmail: true, showPhone: true, showAddress: true, showWebsite: true, showAuthorization: true,
    },
    {
      id: uid('info'), type: 'student_info', columns: 2, boxed: true,
      rows: infoRows.map((r) => ({ id: uid('r'), label: r.label, field: r.field })),
    },
    {
      id: uid('tbl'), type: 'marks_table',
      caption: `Academic Record — {term}`,
      showSeq1: true, showSeq2: true, showGrade: true, showRemarks: !isUni,
      showCoef: !isUni && !isPrimary, columnOrder: cols, headers,
      template: marksTemplate,
    },
    { id: uid('sum'), type: 'summary', boxes: summaryBoxes.map((b) => ({ id: uid('b'), label: b.label, field: b.field })) },
    // Final term only — see AnnualBandSec. University years close on CGPA/classification
    // rather than an annual /20 average, so its cells differ.
    {
      id: uid('ann'), type: 'annual_band', tag: 'End of Year',
      cells: (isUni
        ? [
            { label: 'Cumulative GPA', field: 'cgpa' },
            { label: 'Total Credits', field: 'credits' },
            { label: 'Classification', field: 'classification' },
          ]
        : [
            // /20 for the same reason as the term average above — every figure derived
            // from ReportCard.average inherits its scale.
            { label: 'Annual Average /20', field: 'annualAverage' },
            { label: 'Annual Position', field: 'annualPosition' },
            { label: 'Annual Class Average', field: 'annualClassAverage' },
            { label: 'Final Decision', field: 'decision' },
          ]
      ).map((c) => ({ id: uid('ac'), label: c.label, field: c.field })),
    },
    {
      id: uid('row1'), type: 'panel_row', weights: [1.55, 1],
      children: [
        {
          id: uid('leg'), type: 'grading_legend', title: 'Grading Scale · Appreciation',
          showGradeSystem: true, showClassification: isUni, showLegend: false,
          ...(isUni ? { legendText: DEFAULT_TRANSCRIPT_LEGEND } : {}),
        },
        {
          id: uid('con'), type: 'conduct', title: 'Conduct & Attendance',
          rows: ['Discipline', 'Punctuality', 'Days Absent', 'Late Arrivals', 'Warnings Issued']
            .map((label) => ({ id: uid('cr'), label })),
        },
      ],
    },
    {
      id: uid('gen'), type: 'remarks', label: 'General Remarks',
      panel: true, edgeColor: accent,
    },
    {
      id: uid('row2'), type: 'panel_row', weights: [1, 1],
      children: [
        {
          id: uid('rm1'), type: 'remarks',
          label: isUni ? "Adviser's Remark" : "Class Master's Remark",
          panel: true, signatureCaption: 'Signature',
        },
        {
          id: uid('rm2'), type: 'remarks',
          label: isUni ? "Dean's Remark" : "Principal's Remark",
          panel: true, signatureCaption: isUni ? 'Dean' : 'Principal',
        },
      ],
    },
    // A FULL ROW to itself, same as Ledger's and the transcript's stamp — not squeezed into
    // a panel_row alongside the two remark boxes above (a 0.42-weight column next to two
    // 1-weight ones), which is what used to make its left/center/right align control
    // pointless: the column is barely wider than the stamp itself, so no alignment choice
    // visibly moved it. A section with the whole row can actually sit left, center or right
    // across the page.
    //
    // Official-copy-only — the seal is what makes a printed copy official, and a student
    // copy must never carry it (see StampSec's own doc comment). Missing entirely let it
    // print on BOTH copies for every school on the default (Standard) layout until that was
    // found and fixed separately from this.
    { id: uid('stp'), type: 'stamp', size: 92, align: 'right', label: 'School Stamp', showOn: 'official' },
    {
      id: uid('ft'), type: 'text_block',
      content: t.footerText || 'This document is an official record and is invalid without the school stamp.',
      align: 'center',
    },
  ]

  return { ...t, sections }
}

export function getDefaultLayout(tpl: TemplateName, schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
  return buildRedesignLayout(tpl, schoolType)
}

/** Pre-redesign layout builder. Unused by the designer now — kept so a school that saved
 *  a design under the old structure can still be rendered until it re-saves. */
export function getLegacyDefaultLayout(tpl: TemplateName): TemplateConfig & { sections: LayoutSection[] } {
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
export function getLedgerLayout(schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
  const color = '#0f172a'
  const isUni = schoolType === 'UNIVERSITY'
  const isPrimary = schoolType === 'PRIMARY'
  const cols = isUni
    ? (['sn', 'code', 'subject', 'credit', 'score', 'gradePoint', 'grade', 'weighted'] as const)
    : isPrimary
      ? (['sn', 'subject', 'seq1', 'seq2', 'score', 'grade', 'remarks'] as const)
      : (['sn', 'subject', 'coef', 'seq1', 'seq2', 'score', 'weighted', 'grade', 'remarks'] as const)
  const headers: Record<string, string> = isUni
    ? { subject: 'Course Title', score: 'Mark /100', gradePoint: 'GP', weighted: 'WGP' }
    : isPrimary
      ? { subject: 'Subject', seq1: 'Test', seq2: 'Exam', score: 'Total /100', remarks: 'Remark' }
      : { score: 'Avg /20', weighted: 'Avg × Coef', remarks: 'Remark' }
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
      // Full-width term/semester banner — resolves to "FIRST TERM" etc. per report card.
      {
        id: `mban_${ts}`,
        cells: [
          { field: 'term', bold: true, align: 'left', colSpan: cols.length, bgColor: color, textColor: '#ffffff', fontSize: 11 },
        ],
      },
      {
        id: `mhdr_${ts + 1}`,
        cells: cols.map((k) => ({
          text: headers[k] ?? MARKS_COL_LABELS[k]?.label ?? k,
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
      // Totals band — credits/points for a university, coefficients/points otherwise.
      // Spans are hand-picked against this table's own fixed/flex column widths (see
      // NARROW_PX in PrintableReportCard.tsx): each label's span must reach across
      // enough real pixels for its own text, not just "however many columns are left" —
      // a colSpan defaulting to 1 narrow numeric column clips a label like "TOTAL POINTS
      // OBTAINED:" down to "TOTAL", and a value like "12th/12" needs 2 narrow columns,
      // not 1, or it clips too.
      {
        id: `mfoot_${ts + 3}`,
        cells: isUni
          ? [
              { text: 'TOTAL CREDITS:', bold: true, colSpan: 3, align: 'right', bgColor: bandBg, textColor: bandFg },
              { field: 'credits', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
              { text: 'TOTAL POINTS:', bold: true, colSpan: 3, align: 'right', bgColor: bandBg, textColor: bandFg },
              { field: 'wpTotal', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
            ]
          : isPrimary
            // Primary shows no Coef column here, so it reports the figures it actually
            // displays: the raw sum of the Total /100 column, and the term average (which
            // IS coefficient-weighted, and is stated out of 20 — see saveEntries).
            // Its own 7 columns, not secondary's 9: these three bands used to be shared
            // with secondary and spanned 9, which widened the table and left primary's
            // header and marks rows two columns short of the totals underneath them.
            ? [
                { text: 'OVERALL TOTAL:', bold: true, colSpan: 2, align: 'right', bgColor: bandBg, textColor: bandFg },
                { field: 'total', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
                { text: 'TERM AVERAGE /20:', bold: true, colSpan: 3, align: 'right', bgColor: bandBg, textColor: bandFg },
                { field: 'average', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
              ]
            : [
                { text: 'TOTAL:', bold: true, colSpan: 2, align: 'right', bgColor: bandBg, textColor: bandFg },
                { field: 'coefTotal', bold: true, align: 'center', bgColor: bandBg, textColor: bandFg },
                { text: 'TOTAL POINTS OBTAINED:', bold: true, colSpan: 4, align: 'right', bgColor: bandBg, textColor: bandFg },
                { field: 'wpTotal', bold: true, align: 'center', colSpan: 2, bgColor: bandBg, textColor: bandFg },
              ],
      },
      // Second row: this period's average/GPA | class average. Non-university only gets
      // a third row for position/best average — university has no ranking concept
      // anywhere in this app (see the Standard layout's own annual_band).
      {
        id: `mfoot_${ts + 4}`,
        cells: isUni
          ? [
              { text: 'SEMESTER GPA:', bold: true, colSpan: 3, align: 'right', textColor: '#475569' },
              { field: 'gpa', bold: true, align: 'center' },
              { text: 'CLASS AVERAGE:', bold: true, colSpan: 3, align: 'right', textColor: '#475569' },
              { field: 'classAverage', bold: true, align: 'center' },
            ]
          : isPrimary
            ? [
                { text: 'CLASS AVERAGE /20:', bold: true, colSpan: 2, align: 'right', textColor: '#475569' },
                { field: 'classAverage', bold: true, align: 'center' },
                { text: 'POSITION IN CLASS:', bold: true, colSpan: 3, align: 'right', textColor: '#475569' },
                { field: 'position', bold: true, align: 'center' },
              ]
            : [
                { text: 'TERM AVERAGE:', bold: true, colSpan: 2, align: 'right', textColor: '#475569' },
                { field: 'average', bold: true, align: 'center' },
                { text: 'CLASS AVERAGE:', bold: true, colSpan: 4, align: 'right', textColor: '#475569' },
                { field: 'classAverage', bold: true, align: 'center', colSpan: 2 },
              ],
      },
      ...(isUni ? [] : [isPrimary
        ? {
            id: `mfoot_${ts + 5}`,
            cells: [
              { text: 'BEST AVERAGE:', bold: true, colSpan: 6, align: 'right' as const, textColor: '#475569' },
              { field: 'bestAverage', bold: true, align: 'center' as const },
            ],
          } as SheetRow
        : {
            id: `mfoot_${ts + 5}`,
            cells: [
              { text: 'POSITION IN CLASS:', bold: true, colSpan: 2, align: 'right' as const, textColor: '#475569' },
              { field: 'position', bold: true, align: 'center' as const, colSpan: 2 },
              { text: 'BEST AVERAGE:', bold: true, colSpan: 3, align: 'right' as const, textColor: '#475569' },
              { field: 'bestAverage', bold: true, align: 'center' as const, colSpan: 2 },
            ],
          } as SheetRow]),
      // Closing band — every period. University bands on Classification (which itself
      // bands on the cumulative GPA once one exists, otherwise this semester's own GPA —
      // see classificationForGpa), so it needs no final-period gate. Everyone else gets
      // this period's own grading-scale appreciation; on the year's final term the
      // renderer swaps this row for Annual Average/Position + Decision instead.
      {
        id: `mfoot_${ts + 6}`,
        cells: [
          { text: `${(isUni ? 'CLASSIFICATION' : 'TERM APPRECIATION')}:`, bold: true, colSpan: cols.length - 1, align: 'right', textColor: color },
          { field: isUni ? 'classification' : 'appreciation', bold: true, align: 'center', textColor: color, fontSize: 15 },
        ],
      },
    ],
  }

  const sections: LayoutSection[] = [
    { id: uid('hdr'), type: 'header', reportTitle: 'STUDENT LEDGER REPORT', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left', headerStyle: 'crest' },
    {
      id: uid('info'), type: 'student_info', columns: 2, boxed: true,
      rows: isUni
        ? [
            { id: uid('r'), label: 'Student Name', field: 'student.name' },
            { id: uid('r'), label: 'Student ID',    field: 'student.studentId' },
            { id: uid('r'), label: 'Programme',     field: 'student.classLevel' },
            { id: uid('r'), label: 'Sex',           field: 'student.gender' },
            { id: uid('r'), label: 'Semester',      field: 'term.name' },
            { id: uid('r'), label: 'Academic Year', field: 'term.session' },
          ]
        : [
            { id: uid('r'), label: 'Student Name', field: 'student.name' },
            { id: uid('r'), label: 'Student ID',    field: 'student.studentId' },
            { id: uid('r'), label: 'Class',         field: 'student.classLevel' },
            { id: uid('r'), label: 'Guardian',      field: 'student.guardianName' },
            { id: uid('r'), label: 'Term',          field: 'term.name' },
            { id: uid('r'), label: 'Session',       field: 'term.session' },
          ],
    },
    { id: uid('tbl'), type: 'marks_table', showSeq1: !isUni, showSeq2: !isUni, showGrade: true, showRemarks: !isUni, showCoef: !isUni, template: marksTemplate },
    // Same boxed-table look as the university transcript's grading legend — the
    // classification/CGPA side table only makes sense for a university.
    { id: uid('leg'), type: 'grading_legend', title: `Grading Scale${isUni ? ' · Classification' : ''}`, showGradeSystem: true, showClassification: isUni, showLegend: false },
    { id: uid('rem'), type: 'remarks', label: 'General Remarks' },
    // Official-copy-only, same as Standard's — without this, previewing "Official" on
    // Ledger looked identical to "Student copy" and gave no way to place a seal.
    { id: uid('stp'), type: 'stamp', size: 92, align: 'right', label: 'School Stamp', showOn: 'official' },
    {
      id: uid('sig'), type: 'signatures',
      lines: isUni
        ? [
            { id: uid('s'), label: "Dean of Studies' Signature" },
            { id: uid('s'), label: "Registrar's Signature" },
          ]
        : [
            { id: uid('s'), label: "Class Teacher's Signature" },
            { id: uid('s'), label: "Principal's Signature" },
            { id: uid('s'), label: "Parent / Guardian's Signature" },
          ],
    },
  ]

  // On by default — unlike Standard, where "Show Decision" is an opt-in extra box,
  // the whole point of the Ledger's closing band is to carry the year's verdict once
  // it exists, so a school that picks this layout shouldn't have to separately find
  // and enable the toggle just to see it.
  return { ...TEMPLATE_DEFAULTS.ledger, sections, showDecision: true }
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
    // Same crest letterhead as the standard university layout, so the transcript's
    // header never falls back to the plain pre-2026 look Standard moved away from.
    { id: uid('hdr'), type: 'header', reportTitle: 'ANNUAL TRANSCRIPT', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left', headerStyle: 'crest' },
    {
      id: uid('info'), type: 'student_info', columns: 2, boxed: true,
      rows: [
        { id: uid('r'), label: 'Student Name', field: 'student.name' },
        { id: uid('r'), label: 'Matricule No.', field: 'student.studentId' },
        { id: uid('r'), label: 'Programme', field: 'student.classLevel' },
        { id: uid('r'), label: 'Sex', field: 'student.gender' },
        // Optional per student: blank when not recorded (see formatBirthDate/resolveField).
        { id: uid('r'), label: 'Date of Birth', field: 'student.dateOfBirth' },
        { id: uid('r'), label: 'Place of Birth', field: 'student.placeOfBirth' },
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
          // Every annual document states the year's average, whatever the school type —
          // a university's is a credit-weighted mark out of 100 (what ReportCard.average
          // holds there), which is why the scale is spelled out rather than assumed. The
          // GPA rows below say something different: how those marks convert to points.
          { id: uid('rr'), cells: [{ text: 'Annual Average /100', bold: true }, { field: 'average' }] },
          { id: uid('rr'), cells: [{ text: 'Cumulative GPA', bold: true }, { field: 'cgpa' }] },
          { id: uid('rr'), cells: [{ text: 'Remark', bold: true }, { field: 'classification' }] },
        ],
      }],
    },
    // Official-copy-only, same as Standard's — without this, previewing "Official" on
    // the transcript looked identical to "Student copy" and gave no way to place a seal.
    { id: uid('stp'), type: 'stamp', size: 92, align: 'right', label: 'School Stamp', showOn: 'official' },
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
    { id: uid('hdr'), type: 'header', reportTitle: 'ANNUAL REPORT', subtitle: '', showSchoolType: true, showLogo: true, logoSize: 60, logoPosition: 'left', headerStyle: 'crest' },
    {
      id: uid('info'), type: 'student_info', columns: 2, boxed: true,
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
          // /20 on both primary and secondary: subjects are marked on the class's own
          // ceiling but the average is normalised, the same figure the report card prints
          // under "TERM AVERAGE /20" (see primary's note in saveEntries).
          { id: uid('rr'), cells: [{ text: 'Annual Average /20', bold: true }, { field: 'average' }] },
          { id: uid('rr'), cells: [{ text: 'Grade', bold: true }, { field: 'grade' }] },
        ],
      }],
    },
    // Official-copy-only, same as Standard's — without this, previewing "Official" on
    // the transcript looked identical to "Student copy" and gave no way to place a seal.
    { id: uid('stp'), type: 'stamp', size: 92, align: 'right', label: 'School Stamp', showOn: 'official' },
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
/** Figures a primary card already states in the summary boxes under its marks table. */
const PRIMARY_BOXED_TOTAL_FIELDS = new Set(['total', 'average'])

/**
 * Is this marks-table row one of the OVERALL TOTAL / TERM AVERAGE bands that a primary
 * Standard card repeats in its summary boxes?
 *
 * Matched on the bound field rather than the label, because the label is freely editable
 * in the designer and a school may well have renamed or translated it. The repeating data
 * row is never a match: it binds `m:`-prefixed per-subject keys, not bare stat fields.
 */
export function isPrimaryRedundantTotalsRow(row: SheetRow): boolean {
  if (row._isDataRow) return false
  return row.cells.some((c) => c.field != null && PRIMARY_BOXED_TOTAL_FIELDS.has(c.field))
}

/**
 * Should those bands be dropped for this card?
 *
 * Primary only, and Standard only. Ledger states every figure as a band and has no summary
 * section at all, so dropping them there would remove the term average from the card
 * entirely rather than de-duplicate it. Transcripts are a separate layout with their own
 * per-period tables and are left alone.
 */
export function dropsPrimaryTotalsBands(
  schoolType?: string,
  cfg?: { template?: string; layoutType?: string } | null
): boolean {
  if (schoolType !== 'PRIMARY') return false
  return cfg?.template !== 'ledger' && cfg?.layoutType !== 'ledger' && cfg?.layoutType !== 'transcript'
}

/**
 * Take those bands out of an already-saved primary Standard design.
 *
 * Changing the default only reaches designs built after the change, so a primary school
 * that had saved a layout would keep printing the duplicated rows. Applied on load in the
 * designer so the canvas shows what will actually print; the print renderer drops them
 * independently, so a card is correct whether or not the admin ever re-saves.
 */
export function ensureNoPrimaryTotalsBands<T extends Partial<TemplateConfig>>(cfg: T, schoolType?: string): T {
  if (!dropsPrimaryTotalsBands(schoolType, cfg as { template?: string; layoutType?: string })) return cfg
  const sections = cfg.sections
  if (!Array.isArray(sections)) return cfg
  let changed = false
  const next = sections.map((sec) => {
    const ms = sec as Partial<MarksTableSec> & { template?: SpreadsheetTable }
    if (ms.type !== 'marks_table' || ms.transcriptSemester || !ms.template?.rows) return sec
    const rows = ms.template.rows.filter((r) => !isPrimaryRedundantTotalsRow(r))
    if (rows.length === ms.template.rows.length) return sec
    changed = true
    return { ...sec, template: { ...ms.template, rows } } as LayoutSection
  })
  return changed ? { ...cfg, sections: next } : cfg
}

/**
 * Give an already-saved university design the Date/Place of Birth rows, once.
 *
 * Defaults only apply to designs built after the default changed, so a school that had
 * saved its layout would never see a newly added row. This backfills the student_info
 * section in the designer (the admin still has to Save, and can delete or move the rows
 * first), then marks the design so it never happens twice: nobody could have deliberately
 * removed these rows before they existed, but they can afterwards, and that must stick.
 *
 * University only, matching where these rows are shown by default. Idempotent: the field
 * check alone prevents duplicates even on a fresh default that already has them.
 */
export function ensureBirthRows<T extends Partial<TemplateConfig>>(cfg: T, schoolType?: string): T {
  if (schoolType !== 'UNIVERSITY' || cfg.birthRowsSeeded) return cfg
  const sections = cfg.sections
  if (!Array.isArray(sections)) return { ...cfg, birthRowsSeeded: true }
  const idx = sections.findIndex(s => s.type === 'student_info')
  if (idx < 0) return { ...cfg, birthRowsSeeded: true }

  const info = sections[idx] as StudentInfoSec
  const has = (field: string) => info.rows.some(r => r.field === field)
  const additions: InfoRow[] = []
  if (!has('student.dateOfBirth')) additions.push({ id: uid('r'), label: 'Date of Birth', field: 'student.dateOfBirth' })
  if (!has('student.placeOfBirth')) additions.push({ id: uid('r'), label: 'Place of Birth', field: 'student.placeOfBirth' })
  if (additions.length === 0) return { ...cfg, birthRowsSeeded: true }

  // Slot them in ahead of the academic-year/term rows, where the defaults put them, so a
  // backfilled design reads the same as a fresh one instead of tacking them on the end.
  const at = info.rows.findIndex(r => r.field === 'term.session' || r.field === 'term.name')
  const rows = [...info.rows]
  rows.splice(at < 0 ? rows.length : at, 0, ...additions)

  const next = [...sections]
  next[idx] = { ...info, rows }
  return { ...cfg, sections: next, birthRowsSeeded: true }
}

/**
 * Give an already-saved Ledger or Annual design the Stamp/Seal section, once — same
 * reasoning and idiom as ensureBirthRows above. `kind` picks which layout's defaults to
 * match (Ledger's stamp sits before its signatures block; Annual's does too), and callers
 * pass `false` for Standard/never-applicable configs so the marker still gets set and this
 * doesn't re-run every load.
 */
export function ensureStampSection<T extends Partial<TemplateConfig>>(cfg: T, applies: boolean): T {
  if (cfg.stampSeeded) return cfg
  if (!applies) return { ...cfg, stampSeeded: true }
  const sections = cfg.sections
  if (!Array.isArray(sections)) return { ...cfg, stampSeeded: true }
  if (sections.some(s => s.type === 'stamp')) return { ...cfg, stampSeeded: true }

  const stamp: StampSec & SectionVariant = { id: uid('stp'), type: 'stamp', size: 92, align: 'right', label: 'School Stamp', showOn: 'official' }
  // Same slot as the fresh defaults: right before Signatures, so a backfilled design
  // reads the same as one built after this existed, instead of tacking it on the end.
  const idx = sections.findIndex(s => s.type === 'signatures')
  const next = [...sections]
  next.splice(idx < 0 ? next.length : idx, 0, stamp)
  return { ...cfg, sections: next, stampSeeded: true }
}

/**
 * Give an already-saved ANNUAL (transcript) design its Annual Average row, once — same
 * idiom as ensureBirthRows/ensureStampSection above.
 *
 * An annual document that does not state the year's average is missing the one figure it
 * exists to report, and a school whose transcript design predates this would never get it
 * from a changed default. University designs never had the row at all (they summarised by
 * CGPA alone); primary/secondary ones had it, but it was suppressed at render time by a
 * gate that only let these tables print when the grading scale carried grade points.
 *
 * Idempotent by two independent means: the seeded marker, and a field check that leaves any
 * table already binding `average` alone. Once seeded, a deliberate deletion sticks.
 */
export function ensureAnnualAverageRow<T extends Partial<TemplateConfig>>(cfg: T, schoolType?: string, applies = true): T {
  if (cfg.annualAverageRowSeeded) return cfg
  if (!applies) return { ...cfg, annualAverageRowSeeded: true }
  const sections = cfg.sections
  if (!Array.isArray(sections)) return { ...cfg, annualAverageRowSeeded: true }

  const idx = sections.findIndex(s => s.type === 'grading_legend')
  if (idx < 0) return { ...cfg, annualAverageRowSeeded: true }
  const legend = sections[idx] as GradingLegendSec & { rightTables?: SpreadsheetTable[] }
  const tables = legend.rightTables
  if (!Array.isArray(tables) || tables.length === 0) return { ...cfg, annualAverageRowSeeded: true }
  // Already states it — under whatever label the school has renamed it to, which is why
  // this matches on the bound field and not on the text.
  if (tables.some(t => t.rows?.some(r => r.cells?.some(c => c.field === 'average')))) {
    return { ...cfg, annualAverageRowSeeded: true }
  }

  const isUni = schoolType === 'UNIVERSITY'
  const row: SheetRow = {
    id: uid('rr'),
    cells: [
      { text: isUni ? 'Annual Average /100' : 'Annual Average /20', bold: true, align: 'left' },
      { field: 'average' },
    ],
  }
  // Second row at a university, matching the fresh default: under Credits Earned and above
  // the GPA rows, since it describes the same marks those points are derived from.
  const at = isUni ? Math.min(1, tables[0].rows.length) : 0
  const rows = [...tables[0].rows]
  rows.splice(at, 0, row)
  const nextTables = [{ ...tables[0], rows }, ...tables.slice(1)]
  const next = [...sections]
  next[idx] = { ...legend, rightTables: nextTables } as LayoutSection
  return { ...cfg, sections: next, annualAverageRowSeeded: true }
}

/**
 * Repaint a saved design: every colour in `from` becomes `to`.
 *
 * The Color and Accent pickers only ever set two top-level fields, but a table's colours
 * are STORED ON ITS CELLS — a header cell carries `bgColor` written when the table was
 * seeded, not a reference to the design's colour. So picking a new Color moved anything
 * that reads `primaryColor` live (captions, rules, hero text) and left every table header
 * on the colour it was born with: an Annual layout seeded teal stayed teal however many
 * times the Color box changed. Rather than making cells read the design colour — which
 * would take away the ability to colour one column differently, which the cell toolbar
 * exists for — the picker now rewrites the cells that were using the old colour.
 *
 * Deep-walks the whole structure rather than knowing field names, so `bgColor`,
 * `textColor`, `valueColor`, `placeholderColor` and a colour inside legend HTML are all
 * covered, and a section type added later needs nothing here. Case-insensitive: a hand-
 * typed `#0F766E` and a seeded `#0f766e` are the same colour.
 */
export function recolorSections<T>(sections: T[], from: (string | undefined)[], to: string): T[] {
  const set = new Set(from.filter((c): c is string => !!c).map((c) => c.toLowerCase()))
  if (set.size === 0) return sections
  const walk = (v: any): any => {
    if (typeof v === 'string') return set.has(v.toLowerCase()) ? to : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: any = {}
      for (const k of Object.keys(v)) out[k] = walk(v[k])
      return out
    }
    return v
  }
  return sections.map(walk)
}

/**
 * Which colours the Color picker should repaint: the design's current `primaryColor`, plus
 * whatever its marks-table HEADER ROWS are actually painted with.
 *
 * The second half is what makes the picker work on a design whose tables never matched
 * `primaryColor` in the first place (every Annual layout, seeded teal for primary and navy
 * for secondary regardless of the theme). Reading the colour off the header means the
 * picker changes what you can see is coloured, instead of a field that agrees with it only
 * on a freshly seeded design.
 *
 * White and the page background are excluded: an uncoloured header must not drag every
 * white in the document along with it.
 */
export function primaryColorTargets(cfg: Partial<TemplateConfig>): (string | undefined)[] {
  const out = new Set<string>()
  if (cfg.primaryColor) out.add(cfg.primaryColor)
  const neutral = new Set(['#fff', '#ffffff', 'transparent', (cfg.bgColor ?? '').toLowerCase()])
  for (const sec of cfg.sections ?? []) {
    if (sec.type !== 'marks_table') continue
    for (const cell of (sec as MarksTableSec).template?.rows?.[0]?.cells ?? []) {
      if (cell.bgColor && !neutral.has(cell.bgColor.toLowerCase())) out.add(cell.bgColor)
    }
  }
  return [...out]
}

/**
 * Put the seal on the RIGHT, once, on a design that still has it centred.
 *
 * Every layout seeded it right except Standard, which seeded `align: 'center'` — so the
 * everyday report card was the one document whose stamp sat in the middle of the page,
 * under the signatures rather than beside them, which is not where a school stamps.
 * Changing the default only reaches designs built afterwards, so this moves an existing one.
 *
 * Only a stamp still on the OLD default is touched, and the marker means it happens once:
 * a school that then deliberately centres its seal keeps it centred. Recurses into
 * `panel_row` children, where a layout can pair the seal with a remarks block.
 */
export function ensureStampOnRight<T extends Partial<TemplateConfig>>(cfg: T): T {
  if (cfg.stampAlignSeeded) return cfg
  const sections = cfg.sections
  if (!Array.isArray(sections)) return { ...cfg, stampAlignSeeded: true }
  let changed = false
  const move = (secs: LayoutSection[]): LayoutSection[] => secs.map((sec) => {
    if (sec.type === 'panel_row') {
      const row = sec as PanelRowSec
      if (!Array.isArray(row.children)) return sec
      const kids = move(row.children as LayoutSection[])
      return kids === row.children ? sec : { ...row, children: kids } as LayoutSection
    }
    if (sec.type !== 'stamp' || (sec as StampSec).align !== 'center') return sec
    changed = true
    return { ...sec, align: 'right' as const }
  })
  const next = move(sections)
  return changed ? { ...cfg, sections: next, stampAlignSeeded: true } : { ...cfg, stampAlignSeeded: true }
}

export function getDefaultLayoutForType(schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
  // Since the 2026 redesign every school type gets the SAME layout, differing only in its
  // marks columns and stat boxes (see buildRedesignLayout). The per-type builders below
  // are the pre-redesign defaults, unused now but kept for reference/rollback.
  return buildRedesignLayout('classic', schoolType)
}

/** Pre-redesign per-type defaults. Superseded by buildRedesignLayout; retained so the
 *  older shapes are still on hand if a school needs one rebuilt. */
export function getLegacyDefaultLayoutForType(schoolType?: string): TemplateConfig & { sections: LayoutSection[] } {
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
      // Optional per student: blank when not recorded.
      { label: 'Date of Birth', field: 'student.dateOfBirth' },
      { label: 'Place of Birth', field: 'student.placeOfBirth' },
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
  return getLegacyDefaultLayout('classic') // secondary / default
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
  // `highlightFailingRed`, `showStudentPhoto` and `studentPhotoSize` are school-wide
  // marking/print policy rather than part of any one design, so they have to survive
  // even the fallbacks below that discard the saved design. `showDecision`, unlike
  // those, is deliberately PER DESIGN (Standard/Ledger vs Transcript each remember their
  // own toggle) — it is NOT carried through here, so a fallback to defaults correctly
  // reads it as unset rather than inheriting it.
  const policy = {
    ...(top.highlightFailingRed != null ? { highlightFailingRed: top.highlightFailingRed } : {}),
    ...(top.showStudentPhoto != null ? { showStudentPhoto: top.showStudentPhoto } : {}),
    ...(top.studentPhotoSize != null ? { studentPhotoSize: top.studentPhotoSize } : {}),
  }
  if (Object.keys(top).length === 0 || top.layoutType === 'transcript')
    return { ...getDefaultLayoutForType(schoolType), ...policy }
  const base = TEMPLATE_DEFAULTS[(top.template as TemplateName) ?? 'classic']
  // Applied here rather than at each call site: this is the one path every standard-layout
  // reader shares (the card page, the class print page, the report cards list), so the seal
  // moves on paper whether or not the admin ever reopens the designer.
  return ensureStampOnRight({ ...base, ...top } as TemplateConfig)
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
