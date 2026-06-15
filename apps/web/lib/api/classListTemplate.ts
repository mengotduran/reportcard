import api from './client'

// ── Flexible, editable column model ───────────────────────────────────────────
// A class list is a set of column GROUPS (e.g. terms / semesters), each holding
// one or more COLUMNS (e.g. Seq 1, Seq 2, Avg). Everything is admin-editable so
// the same designer works for Primary, Secondary, University, etc.
export interface ClassListColumn { id: string; label: string; avg?: boolean }
export interface ClassListGroup { id: string; label: string; columns: ClassListColumn[] }

export interface ClassListConfig {
  title: string
  subtitle: string
  showSchoolType: boolean
  showLogo: boolean
  headerColor: string   // group-bar + title border colour
  accentColor: string   // average-column tint
  showId: boolean
  groups: ClassListGroup[]
  showMeta: { subject: boolean; teacher: boolean; year: boolean }
  blankRows: number
  orientation: 'landscape' | 'portrait'
  footerFields: string[]
}

// ── id + column helpers ───────────────────────────────────────────────────────
let _uid = 0
export const clUid = (p: string) => `${p}${Date.now().toString(36)}${++_uid}${Math.random().toString(36).slice(2, 5)}`
export const clCol = (label: string, avg = false): ClassListColumn => ({ id: clUid('c'), label, avg })
export const clGroup = (label: string, columns: ClassListColumn[]): ClassListGroup => ({ id: clUid('g'), label, columns })

// ── Presets ───────────────────────────────────────────────────────────────────
export type ClassListPreset = 'secondary' | 'primary' | 'university'

export function presetGroups(preset: ClassListPreset): ClassListGroup[] {
  if (preset === 'primary') return [
    clGroup('1st Term', [clCol('Eval 1'), clCol('Eval 2'), clCol('Avg', true)]),
    clGroup('2nd Term', [clCol('Eval 3'), clCol('Eval 4'), clCol('Avg', true)]),
    clGroup('3rd Term', [clCol('Eval 5'), clCol('Eval 6'), clCol('Avg', true)]),
  ]
  if (preset === 'university') return [
    clGroup('Semester 1', [clCol('CA'), clCol('Exam'), clCol('Final', true)]),
    clGroup('Semester 2', [clCol('CA'), clCol('Exam'), clCol('Final', true)]),
  ]
  // secondary (default) — sequences numbered continuously across terms
  return [
    clGroup('1st Term', [clCol('Seq 1'), clCol('Seq 2'), clCol('Avg', true)]),
    clGroup('2nd Term', [clCol('Seq 3'), clCol('Seq 4'), clCol('Avg', true)]),
    clGroup('3rd Term', [clCol('Seq 5'), clCol('Seq 6'), clCol('Avg', true)]),
  ]
}

export function typeToClassListPreset(schoolType?: string): ClassListPreset {
  if (schoolType === 'PRIMARY') return 'primary'
  if (schoolType === 'UNIVERSITY') return 'university'
  return 'secondary'
}

export const DEFAULT_CLASS_LIST_CONFIG: ClassListConfig = {
  title: 'Class Marks Register',
  subtitle: '',
  showSchoolType: true,
  showLogo: false,
  headerColor: '#1a1a1a',
  accentColor: '#1e3a5f',
  showId: true,
  groups: presetGroups('secondary'),
  showMeta: { subject: true, teacher: true, year: true },
  blankRows: 5,
  orientation: 'landscape',
  footerFields: ["Teacher's Full Name", 'Signature', 'Date', 'HOD / Principal'],
}

// Migrate the old fixed term/column/seqLabel config shape → groups.
function migrateLegacy(p: any): ClassListGroup[] {
  const cols = p.columns ?? { seq1: true, seq2: true, avg: true }
  const sl = p.seqLabels ?? {}
  const prefix = String(sl.seq1 || 'Seq').replace(/\s*\d+\s*$/, '').trim() || 'Seq'
  const flags = p.terms ?? { term1: true, term2: true, term3: true }
  const labels = p.termLabels ?? { term1: '1st Term', term2: '2nd Term', term3: '3rd Term' }
  const keys: ('term1' | 'term2' | 'term3')[] = ['term1', 'term2', 'term3']
  const groups: ClassListGroup[] = []
  keys.forEach((k, idx) => {
    if (!flags[k]) return
    const columns: ClassListColumn[] = []
    if (cols.seq1) columns.push(clCol(`${prefix} ${idx * 2 + 1}`))
    if (cols.seq2) columns.push(clCol(`${prefix} ${idx * 2 + 2}`))
    if (cols.avg) columns.push(clCol(sl.avg || 'Avg', true))
    groups.push(clGroup(labels[k], columns))
  })
  return groups.length ? groups : presetGroups('secondary')
}

// Merge a stored (possibly partial / legacy) config onto the defaults. When no
// columns are stored yet, the default groups are chosen by the school's section
// type (Primary / Secondary / University).
export function mergeClassListConfig(partial?: any, schoolType?: string): ClassListConfig {
  const d = DEFAULT_CLASS_LIST_CONFIG
  const p: any = partial ?? {}
  let groups: ClassListGroup[]
  if (Array.isArray(p.groups) && p.groups.length) {
    groups = p.groups.map((g: any) => ({
      id: g.id || clUid('g'),
      label: g.label ?? '',
      columns: (Array.isArray(g.columns) ? g.columns : []).map((c: any) => ({ id: c.id || clUid('c'), label: c.label ?? '', avg: !!c.avg })),
    }))
  } else if (p.terms || p.columns || p.seqLabels || p.termLabels) {
    groups = migrateLegacy(p)
  } else {
    groups = presetGroups(typeToClassListPreset(schoolType))
  }
  return {
    title: p.title ?? d.title,
    subtitle: p.subtitle ?? d.subtitle,
    showSchoolType: p.showSchoolType ?? d.showSchoolType,
    showLogo: p.showLogo ?? d.showLogo,
    headerColor: p.headerColor ?? d.headerColor,
    accentColor: p.accentColor ?? d.accentColor,
    showId: p.showId ?? d.showId,
    groups,
    showMeta: { ...d.showMeta, ...(p.showMeta ?? {}) },
    blankRows: typeof p.blankRows === 'number' ? p.blankRows : d.blankRows,
    orientation: p.orientation === 'portrait' ? 'portrait' : 'landscape',
    footerFields: Array.isArray(p.footerFields) && p.footerFields.length ? p.footerFields : d.footerFields,
  }
}

export const getClassListTemplateApi = async (): Promise<{ config: Partial<ClassListConfig> }> => {
  const res = await api.get('/class-list-template')
  return res.data
}

export const saveClassListTemplateApi = async (config: ClassListConfig) => {
  const res = await api.put('/class-list-template', { config })
  return res.data
}
