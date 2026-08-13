import api from './client'
import type { StudentStatus } from './students'

export const getCurrentTermApi = async () => {
  const res = await api.get('/terms/current')
  return res.data as { term: { id: string; name: string; session: string; isCurrent: boolean } }
}

export const getClassLevelsApi = async () => {
  const res = await api.get('/students/class-levels')
  return res.data as { classLevels: string[] }
}

export interface ClassOverviewStudent {
  id: string; name: string; studentId: string; classLevel: string
  reportCard: {
    id: string; status: string; average: number | null
    marksEditGrantedTo: string | null; remarksEditGrantedTo: string | null; marksFilled?: boolean
    // Every entry's marks, straight off this one response — lets a marks-entry screen
    // build its rows without a per-student getReportCardApi round trip (see the mobile
    // marks screen's fetchData comment for why that used to matter on a phone network).
    // `grade` carries the RATING on a competency class (nursery), where there are no scores.
    entries: { subjectId: string; seq1Score: number | null; seq2Score: number | null; resitScore: number | null; grade?: string | null }[]
  } | null
}

export const getClassOverviewApi = async (termId: string, classLevel: string, subjectId?: string): Promise<{
  students: ClassOverviewStudent[]
  subjectCount: number
  teacherSubjectCount: number
  // Only meaningful when subjectId is passed — whether this term is the currently
  // active one, and (if not) whether an admin has unlocked this subject+term for
  // teachers to edit anyway. See PastTermMarksGrant.
  isCurrentTerm: boolean
  pastTermEditGranted: boolean
  /** How this class is assessed — marks, or a rating per subject. See ClassLevel.gradingMode. */
  gradingMode?: 'NUMERIC' | 'COMPETENCY'
}> => {
  const res = await api.get('/report-cards/class-overview', { params: { termId, classLevel, subjectId } })
  return res.data
}

export const getPastTermGrantApi = async (subjectId: string, termId: string): Promise<{ granted: boolean }> => {
  const res = await api.get('/past-term-grants', { params: { subjectId, termId } })
  return res.data
}

export const setPastTermGrantApi = async (subjectId: string, termId: string, granted: boolean): Promise<{ granted: boolean }> => {
  const res = await api.put('/past-term-grants', { subjectId, termId, granted })
  return res.data
}

// `rating` is the competency (nursery) path: the API takes it INSTEAD of any score and
// stores it as the entry's grade. Leave the key off an entry entirely to keep whatever
// rating it already has — sending `rating: null` is what clears one. See utils/competency.
export const saveEntriesWithSeqApi = async (id: string, data: {
  entries: { subjectId: string; seq1Score?: number | null; seq2Score?: number | null; resitScore?: number | null; score?: number | null; grade?: string | null; rating?: string | null; remarks?: string }[]
  remarks?: string
}) => {
  const res = await api.put(`/report-cards/${id}/entries`, data)
  return res.data
}

// `studentStatus` drives the Active / Disabled / Dismissed tabs. Filtered server-side
// because the list is paginated: narrowing only the rows already loaded would empty a page
// while later pages still held matches. Omitting it returns every status.
export const getReportCardsApi = async (params?: { termId?: string; classLevel?: string; session?: string; studentStatus?: StudentStatus }) => {
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

// `studentStatus` defaults to ACTIVE server-side, so a caller that has no status filter
// of its own (the single-class marks sheet) keeps its old behaviour by omitting it.
export const getMarksExportApi = async (termId: string, classLevel?: string, studentStatus?: StudentStatus): Promise<MarksExport> => {
  const res = await api.get('/report-cards/marks-export', {
    params: { termId, ...(classLevel ? { classLevel } : {}), ...(studentStatus ? { studentStatus } : {}) },
  })
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

// No deleteReportCardApi: the route was removed. A published card is an issued document a
// parent may already hold, and the card is re-created for any active student anyway. Use
// unpublishReportCardApi to reopen one for correction.

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
  otherStudentsBlocking: number
  otherStudentsBlockingNames: string[]
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
  resitScore?: number | null
  grade?: string | null
  subject: { id: string; name: string; code?: string | null; credit?: number | null; coefficient?: number | null; term?: string | null; classLevel: string; maxScore?: number | null }
}

export interface TranscriptReportCard {
  id: string
  term: { id: string; name: string; session: string; printingEnabled?: boolean }
  entries: TranscriptEntry[]
  average?: number | null
  remarks?: string | null
  // Stamped identically onto every card in the session once endAcademicYear has run — see
  // PromotionScale. Null until then.
  decision?: string | null
}

export interface StudentTranscript {
  student: {
    id: string; name: string; studentId: string; classLevel: string; gender?: string | null
    dateOfBirth?: string | null; nationality?: string | null; photo?: string | null
  }
  // `stamp` is the official seal, printed on official copies via the designer's stamp
  // section (the endpoint selects it explicitly, see getStudentTranscript).
  school: { name: string; logo?: string | null; stamp?: string | null; language?: string | null; type?: string | null; email?: string; phone?: string | null; address?: string | null; website?: string | null; authorizationNumber?: string | null; officialLeftTextEn?: string | null; officialLeftTextFr?: string | null; officialRightTextEn?: string | null; officialRightTextFr?: string | null }
  session: string
  reportCards: TranscriptReportCard[]
  /** Periods in this academic year (2 semesters / 3 terms) — reportCards only carries
   *  the PUBLISHED ones, so fewer than this means the year isn't complete yet. */
  termCount: number
  maxScore: number
  gradingScale: { id: string; minScore: number; maxScore: number; grade: string; remark: string; color: string; gradePoint?: number }[]
  classificationBands: { min: number; max: number; label: string }[]
}

export const getStudentTranscriptApi = async (studentId: string, session?: string): Promise<StudentTranscript> => {
  const res = await api.get(`/report-cards/student/${studentId}/transcript`, { params: session ? { session } : {} })
  return res.data
}
