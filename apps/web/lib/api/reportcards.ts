import api from './client'

export const getCurrentTermApi = async () => {
  const res = await api.get('/terms/current')
  return res.data as { term: { id: string; name: string; session: string; isCurrent: boolean } }
}

export const getClassLevelsApi = async () => {
  const res = await api.get('/students/class-levels')
  return res.data as { classLevels: string[] }
}

export const getClassOverviewApi = async (termId: string, classLevel: string): Promise<{ students: any[]; subjectCount: number; teacherSubjectCount: number }> => {
  const res = await api.get('/report-cards/class-overview', { params: { termId, classLevel } })
  return res.data as {
    students: {
      id: string; name: string; studentId: string; classLevel: string
      reportCard: { id: string; status: string; average: number | null; marksEditGrantedTo: string | null; remarksEditGrantedTo: string | null; marksFilled?: boolean } | null
    }[]
    subjectCount: number
    teacherSubjectCount: number
  }
}

export const saveEntriesWithSeqApi = async (id: string, data: {
  entries: { subjectId: string; seq1Score?: number | null; seq2Score?: number | null; score?: number | null; grade?: string | null; remarks?: string }[]
  remarks?: string
}) => {
  const res = await api.put(`/report-cards/${id}/entries`, data)
  return res.data
}

export const getReportCardsApi = async (params?: { termId?: string; classLevel?: string; session?: string }) => {
  const res = await api.get('/report-cards', { params })
  return res.data
}

export const getReportCardApi = async (id: string) => {
  const res = await api.get(`/report-cards/${id}`)
  return res.data
}

export interface MarksExportStudent {
  studentId: string
  name: string
  studentIdCode: string
  classLevel: string
  average: number | null
  position: number | null
  scores: Record<string, number | null>
}

export interface MarksExport {
  term: { id: string; name: string; session: string }
  classLevel: string | null
  subjects: string[]
  students: MarksExportStudent[]
}

export const getMarksExportApi = async (termId: string, classLevel?: string): Promise<MarksExport> => {
  const res = await api.get('/report-cards/marks-export', { params: { termId, ...(classLevel ? { classLevel } : {}) } })
  return res.data
}

export const createReportCardApi = async (data: { studentId: string; termId: string }) => {
  const res = await api.post('/report-cards', data)
  return res.data
}

export const saveEntriesApi = async (id: string, data: {
  entries: { subjectId: string; score: number; grade?: string; remarks?: string }[]
  remarks?: string
}) => {
  const res = await api.put(`/report-cards/${id}/entries`, data)
  return res.data
}

export const publishReportCardApi = async (id: string) => {
  const res = await api.put(`/report-cards/${id}/publish`)
  return res.data
}

export const unpublishReportCardApi = async (id: string) => {
  const res = await api.put(`/report-cards/${id}/unpublish`)
  return res.data
}

export const bulkPublishApi = async (classLevel: string, termId: string) => {
  const res = await api.post('/report-cards/bulk-publish', { classLevel, termId })
  return res.data as { published: number; skipped: number; issues: { student: string; reason: string }[] }
}

export const grantEditPermissionApi = async (id: string, type: 'marks' | 'remarks', userId: string) => {
  const res = await api.put(`/report-cards/${id}/grant-edit`, { type, userId })
  return res.data
}

export const revokeEditPermissionApi = async (id: string, type: 'marks' | 'remarks') => {
  const res = await api.put(`/report-cards/${id}/revoke-edit`, { type })
  return res.data
}

export const deleteReportCardApi = async (id: string) => {
  const res = await api.delete(`/report-cards/${id}`)
  return res.data
}

export const updateRemarksApi = async (id: string, remarks?: string, remarksFr?: string) => {
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

// Generate an AI bilingual remark draft. Returns editable EN/FR text — not saved
// as final until the user saves via updateRemarksApi.
export const generateRemarksApi = async (id: string): Promise<GenerateRemarksResult> => {
  const res = await api.post(`/report-cards/${id}/generate-remarks`)
  return res.data
}

// Provenance label for a remark, for admin display.
export const remarkSourceLabel = (source: string | null | undefined): { text: string; tone: 'ai' | 'edited' | 'manual' } | null => {
  switch (source) {
    case 'AI': return { text: 'AI-generated', tone: 'ai' }
    case 'AI_EDITED': return { text: 'AI-generated · edited by teacher', tone: 'edited' }
    case 'MANUAL': return { text: 'Written by teacher', tone: 'manual' }
    default: return null
  }
}

export interface ClassReadiness {
  ready: boolean
  missingSeqs: number
  missingRemarks: number
  total: number
  noSubjects: boolean
}

export interface ReadinessDetail {
  allSeqsFilled: boolean
  missingSubjects: { subjectId: string; subjectName: string; teacher: { id: string; name: string } | null }[]
  classMaster: { id: string; name: string } | null
  missingRemarks: { id: string; name: string } | null
}

export const getReadinessDetailApi = async (id: string): Promise<ReadinessDetail> => {
  const res = await api.get(`/report-cards/${id}/readiness-detail`)
  return res.data
}

export const getClassReadinessApi = async (termId: string): Promise<{ readiness: Record<string, ClassReadiness> }> => {
  const res = await api.get(`/report-cards/class-readiness?termId=${termId}`)
  return res.data
}

export interface TranscriptEntry {
  id: string
  score: number | null
  seq1Score?: number | null
  seq2Score?: number | null
  grade?: string | null
  subject: { id: string; name: string; code?: string | null; credit?: number | null; term?: string | null; classLevel: string }
}

export interface TranscriptReportCard {
  id: string
  term: { id: string; name: string; session: string; printingEnabled?: boolean }
  entries: TranscriptEntry[]
  average?: number | null
  remarks?: string | null
}

export interface StudentTranscript {
  student: {
    id: string; name: string; studentId: string; classLevel: string; gender?: string | null
    dateOfBirth?: string | null; nationality?: string | null
  }
  school: { name: string; logo?: string | null; language?: string | null; type?: string | null }
  session: string
  reportCards: TranscriptReportCard[]
  maxScore: number
  gradingScale: { id: string; minScore: number; maxScore: number; grade: string; remark: string; color: string; gradePoint?: number }[]
  classificationBands: { min: number; max: number; label: string }[]
}

export const getStudentTranscriptApi = async (studentId: string, session?: string): Promise<StudentTranscript> => {
  const res = await api.get(`/report-cards/student/${studentId}/transcript`, { params: session ? { session } : {} })
  return res.data
}
