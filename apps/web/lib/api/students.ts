import api from './client'

export const getStudentClassLevelsApi = async () => {
  const res = await api.get('/students/class-levels')
  return res.data
}

export type StudentStatus = 'ACTIVE' | 'DISABLED' | 'DISMISSED'

export const getStudentsApi = async (params?: { classLevel?: string; search?: string; session?: string; status?: string }) => {
  const res = await api.get('/students', { params })
  return res.data
}

export const createStudentApi = async (data: {
  name: string
  classLevel: string
  gender: string
  /** Optional birth details, "YYYY-MM-DD" and free text. Omitted or blank = not recorded,
   *  and the row prints blank on the report card/transcript. */
  dateOfBirth?: string
  placeOfBirth?: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  directLevel2Entry?: boolean
}) => {
  const res = await api.post('/students', data)
  return res.data
}

export const updateStudentApi = async (id: string, data: {
  name?: string
  classLevel?: string
  gender?: string
  dateOfBirth?: string
  placeOfBirth?: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  directLevel2Entry?: boolean
  isRepeatingLevel?: boolean
}) => {
  const res = await api.put(`/students/${id}`, data)
  return res.data
}

export const bulkPromoteStudentsApi = async (studentIds: string[]): Promise<{ promoted: number; message: string }> => {
  const res = await api.post('/students/bulk-promote', { studentIds })
  return res.data
}

// Replaces the old silent "delete" (which never deleted anything — just set
// isActive: false with no visible status and no way back). See Student.status
// in schema.prisma.
export const setStudentStatusApi = async (id: string, status: StudentStatus) => {
  const res = await api.put(`/students/${id}/status`, { status })
  return res.data
}

// Bulk import — see apps/api/src/utils/studentImport.ts. Two steps: preview
// (parses + validates, writes nothing) then commit (creates only the rows
// the admin reviewed) — never re-uploads the raw file twice, so a corrected
// re-upload can't double-create the rows that already succeeded.

export interface ParsedStudentRow {
  row: number
  name: string
  classLevel: string
  gender: 'Male' | 'Female'
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  matricule?: string
  directLevel2Entry?: boolean
  feePaid?: number
  paymentDate?: string
}

export interface CarryOverRow {
  row: number
  name: string
  classLevel: string
  matricule?: string
  matchType: 'matricule' | 'name'
}

export interface ImportRowError { row: number; reason: string }

export interface ImportPreviewResult {
  valid: ParsedStudentRow[]
  errors: ImportRowError[]
  carryOvers?: CarryOverRow[]
  headerError?: string
}

export const downloadStudentImportTemplateApi = async (): Promise<Blob> => {
  const res = await api.get('/students/import/template', { responseType: 'blob' })
  return res.data
}

export const previewStudentImportApi = async (file: File): Promise<ImportPreviewResult> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/students/import/preview', formData)
  return res.data
}

export const commitStudentImportApi = async (rows: ParsedStudentRow[]): Promise<{
  created: number
  failed: { row: number; name: string; reason: string }[]
  feesRecorded: number
  feeWarning?: string
}> => {
  const res = await api.post('/students/import/commit', { rows })
  return res.data
}
