import api from './client'

export type TemplateName = 'classic' | 'bilingual' | 'modern' | 'official'

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
  // sections-based layout (overrides toggle config if present)
  sections?: LayoutSection[]
  // background color of the card paper
  bgColor?: string
  // watermark
  watermark?: { enabled: boolean; type: 'text' | 'logo'; text: string; color: string; opacity: number; logoUrl?: string | null; size?: number; rotation?: number; x?: number; y?: number }
  // top-level layout type — 'standard' (section-based designer) or 'transcript' (annual transcript style, university only)
  layoutType?: 'standard' | 'transcript'
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

export interface HeaderSec     { id: string; type: 'header';       reportTitle: string; subtitle: string; showSchoolType: boolean; showLogo: boolean; logoSize: number; logoPosition: 'left'|'center'|'right'; schoolNameColor?: string; schoolTypeColor?: string; officialHeader?: boolean; leftText?: string; rightText?: string }
export interface StudentInfoSec{ id: string; type: 'student_info'; columns: 1|2|3; rows: InfoRow[] }
export interface MarksTableSec { id: string; type: 'marks_table';  showSeq1: boolean; showSeq2: boolean; showCoef?: boolean; showGrade: boolean; showRemarks: boolean; headers?: Record<string,string>; headerColor?: string; colColors?: Record<string,string>; columnOrder?: string[];
  /** When set, the marks table is rendered from this SpreadsheetTable template instead of the default layout. The row marked _isDataRow repeats per subject in the print renderer. */
  template?: SpreadsheetTable
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
        ...(t.showAverage  ? [{ id: uid('b'), label: isBi ? 'Moyenne / Average'  : 'Average',  field: 'average' }]  : []),
        ...(t.showPosition ? [{ id: uid('b'), label: isBi ? 'Rang / Position'    : 'Position', field: 'position' }] : []),
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

// ── API helpers ───────────────────────────────────────────────────────────────
export const getTemplateApi = async (): Promise<{ config: Partial<TemplateConfig> }> => {
  const res = await api.get('/report-card-template')
  return res.data
}

export const saveTemplateApi = async (config: TemplateConfig) => {
  const res = await api.put('/report-card-template', { config })
  return res.data
}
