import api from './client'

export interface ReportCardSummary {
  id: string
  status: string
  average: number | null
  student: { name: string; classLevel: string }
  term: { name: string; session: string }
}

export interface ReportCardDetail {
  id: string
  status: string
  totalScore: number | null
  average: number | null
  position: number | null
  remarks: string | null
  remarksFr: string | null
  remarksSource: string | null
  student: { id: string; name: string; classLevel: string; studentId: string; guardianName?: string }
  term: { id: string; name: string; session: string }
  school: { name: string; type: string; language?: string }
  entries: { id: string; score: number | null; seq1Score?: number | null; seq2Score?: number | null; grade: string | null; remarks: string; subject: { id: string; name: string; maxScore: number; coefficient: number } }[]
}

export interface Subject {
  id: string
  name: string
  classLevel: string
  maxScore: number
  coefficient: number
}

export interface Term {
  id: string
  name: string
  session: string
  isCurrent: boolean
}

export interface ClassStudentOverview {
  id: string
  name: string
  studentId: string
  classLevel: string
  reportCard: { id: string; status: string; average: number | null; marksEditGrantedTo: string | null; remarksEditGrantedTo: string | null; marksFilled?: boolean } | null
}

export const getCurrentTerm = async (): Promise<{ term: Term }> => {
  const res = await api.get('/terms/current')
  return res.data
}

export const getClassLevels = async (): Promise<{ classLevels: string[] }> => {
  const res = await api.get('/students/class-levels')
  return res.data
}

export const getClassOverview = async (
  termId: string,
  classLevel: string
): Promise<{ students: ClassStudentOverview[]; subjectCount: number }> => {
  const res = await api.get('/report-cards/class-overview', { params: { termId, classLevel } })
  return res.data
}

export const createReportCard = async (data: {
  studentId: string
  termId: string
}): Promise<{ reportCard: { id: string } }> => {
  const res = await api.post('/report-cards', data)
  return res.data
}

export const getReportCards = async (): Promise<{ reportCards: ReportCardSummary[] }> => {
  const res = await api.get('/report-cards')
  return res.data
}

export const getReportCard = async (id: string): Promise<ReportCardDetail> => {
  const res = await api.get(`/report-cards/${id}`)
  return res.data
}

export const getSubjects = async (): Promise<{ subjects: Subject[] }> => {
  const res = await api.get('/subjects')
  return res.data
}

export const saveEntries = async (
  id: string,
  data: { entries: { subjectId: string; seq1Score?: number | null; seq2Score?: number | null; score?: number | null; grade?: string | null; remarks?: string }[]; remarks?: string }
) => {
  const res = await api.put(`/report-cards/${id}/entries`, data)
  return res.data
}

export const publishReportCard = async (id: string) => {
  const res = await api.put(`/report-cards/${id}/publish`)
  return res.data
}

export const updateRemarks = async (id: string, remarks?: string, remarksFr?: string) => {
  const res = await api.put(`/report-cards/${id}/remarks`, { remarks, remarksFr })
  return res.data
}

export interface GenerateRemarksResult {
  message: string
  aiAvailable: boolean
  language: 'EN' | 'FR'
  remarks: string | null
  remarksFr: string | null
}

// Generate an AI remark draft in the school section's language. Editable — not
// saved as final until the user saves via updateRemarks.
export const generateRemarks = async (id: string): Promise<GenerateRemarksResult> => {
  const res = await api.post(`/report-cards/${id}/generate-remarks`)
  return res.data
}

// Provenance label for admin display.
export const remarkSourceLabel = (source: string | null | undefined): { text: string; color: string } | null => {
  switch (source) {
    case 'AI': return { text: 'AI-generated', color: '#7c3aed' }
    case 'AI_EDITED': return { text: 'AI · edited by teacher', color: '#2563eb' }
    case 'MANUAL': return { text: 'Written by teacher', color: '#059669' }
    default: return null
  }
}

export const unpublishReportCard = async (id: string) => {
  const res = await api.put(`/report-cards/${id}/unpublish`)
  return res.data
}

export const grantEditPermission = async (id: string, type: 'marks' | 'remarks', userId: string) => {
  const res = await api.put(`/report-cards/${id}/grant-edit`, { type, userId })
  return res.data
}

export const revokeEditPermission = async (id: string, type: 'marks' | 'remarks') => {
  const res = await api.put(`/report-cards/${id}/revoke-edit`, { type })
  return res.data
}

export interface ReadinessDetail {
  allSeqsFilled: boolean
  missingSubjects: { subjectId: string; subjectName: string; teacher: { id: string; name: string } | null }[]
  classMaster: { id: string; name: string } | null
  missingRemarks: { id: string; name: string } | null
}

export const getReadinessDetail = async (id: string): Promise<ReadinessDetail> => {
  const res = await api.get(`/report-cards/${id}/readiness-detail`)
  return res.data
}

export const bulkPublish = async (classLevel: string, termId: string) => {
  const res = await api.post('/report-cards/bulk-publish', { classLevel, termId })
  return res.data as { published: number; skipped: number; issues: { student: string; reason: string }[] }
}

export const getAllReportCards = async (params?: { termId?: string; classLevel?: string }) => {
  const res = await api.get('/report-cards', { params })
  return res.data as { reportCards: (ReportCardSummary & { marksEditGrantedTo: string | null; remarksEditGrantedTo: string | null })[]; total: number }
}
