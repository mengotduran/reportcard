import api from './client'

export const getCurrentTermApi = async () => {
  const res = await api.get('/terms/current')
  return res.data as { term: { id: string; name: string; session: string; isCurrent: boolean } }
}

export const getClassLevelsApi = async () => {
  const res = await api.get('/students/class-levels')
  return res.data as { classLevels: string[] }
}

export const getClassOverviewApi = async (termId: string, classLevel: string): Promise<{ students: any[]; subjectCount: number }> => {
  const res = await api.get('/report-cards/class-overview', { params: { termId, classLevel } })
  return res.data as {
    students: {
      id: string; name: string; studentId: string; classLevel: string
      reportCard: { id: string; status: string; average: number | null; marksEditGrantedTo: string | null; remarksEditGrantedTo: string | null; marksFilled?: boolean } | null
    }[]
  }
}

export const saveEntriesWithSeqApi = async (id: string, data: {
  entries: { subjectId: string; seq1Score?: number | null; seq2Score?: number | null; score?: number | null; grade?: string | null; remarks?: string }[]
  remarks?: string
}) => {
  const res = await api.put(`/report-cards/${id}/entries`, data)
  return res.data
}

export const getReportCardsApi = async (params?: { termId?: string; classLevel?: string }) => {
  const res = await api.get('/report-cards', { params })
  return res.data
}

export const getReportCardApi = async (id: string) => {
  const res = await api.get(`/report-cards/${id}`)
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

export const updateRemarksApi = async (id: string, remarks: string) => {
  const res = await api.put(`/report-cards/${id}/remarks`, { remarks })
  return res.data
}

export interface ClassReadiness {
  ready: boolean
  missingSeqs: number
  missingRemarks: number
  total: number
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
