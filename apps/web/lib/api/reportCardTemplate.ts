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
}

// ── Section types ─────────────────────────────────────────────────────────────
export interface InfoRow      { id: string; label: string; field: string; valueColor?: string }
export interface SummaryBox   { id: string; label: string; field: string; valueColor?: string }
export interface SignatureLine { id: string; label: string }

export interface HeaderSec     { id: string; type: 'header';       reportTitle: string; subtitle: string; showSchoolType: boolean; showLogo: boolean; logoSize: number; logoPosition: 'left'|'center'|'right'; schoolNameColor?: string; schoolTypeColor?: string }
export interface StudentInfoSec{ id: string; type: 'student_info'; columns: 1|2|3; rows: InfoRow[] }
export interface MarksTableSec { id: string; type: 'marks_table';  showSeq1: boolean; showSeq2: boolean; showGrade: boolean; showRemarks: boolean; headers?: Record<string,string>; headerColor?: string; colColors?: Record<string,string> }
export interface SummarySec    { id: string; type: 'summary';      boxes: SummaryBox[]; valueColor?: string }
export interface RemarksSec    { id: string; type: 'remarks';      label: string; placeholderColor?: string }
export interface SignaturesSec { id: string; type: 'signatures';   lines: SignatureLine[] }
export interface TextBlockSec  { id: string; type: 'text_block';   content: string; align: 'left'|'center'|'right' }
export interface DividerSec    { id: string; type: 'divider';      style: 'solid'|'dashed' }

export type LayoutSection =
  | HeaderSec | StudentInfoSec | MarksTableSec | SummarySec
  | RemarksSec | SignaturesSec | TextBlockSec | DividerSec

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

// ── API helpers ───────────────────────────────────────────────────────────────
export const getTemplateApi = async (): Promise<{ config: Partial<TemplateConfig> }> => {
  const res = await api.get('/report-card-template')
  return res.data
}

export const saveTemplateApi = async (config: TemplateConfig) => {
  const res = await api.put('/report-card-template', { config })
  return res.data
}
