import api from './client'

export type StudentStatus = 'ACTIVE' | 'DISABLED' | 'DISMISSED'

export interface Student {
  id: string
  name: string
  studentId: string
  classLevel: string
  gender: string | null
  guardianName: string | null
  isActive: boolean
  status?: StudentStatus
}

export const getStudents = async (params?: { classLevel?: string; search?: string; session?: string; status?: string }): Promise<{ students: Student[] }> => {
  const res = await api.get('/students', { params })
  return res.data
}

export const createStudent = async (data: { name: string; classLevel: string; gender: string; guardianName?: string }) => {
  const res = await api.post('/students', data)
  return res.data
}

export const updateStudent = async (id: string, data: Partial<{ name: string; classLevel: string; guardianName: string | null; isActive: boolean }>) => {
  const res = await api.put(`/students/${id}`, data)
  return res.data
}

// Replaces the old silent "delete" (which never deleted anything — just set
// isActive: false with no visible status and no way back). See
// Student.status in schema.prisma.
export const setStudentStatus = async (id: string, status: StudentStatus) => {
  const res = await api.put(`/students/${id}/status`, { status })
  return res.data
}

// Bulk import — mirrors apps/web/lib/api/students.ts. Two-step flow:
// preview (parse + validate, no DB writes) then commit (create only the
// reviewed rows). The API is the same endpoint as the web; only the
// FormData construction differs (mobile uses a URI-based file object).

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

export const downloadStudentImportTemplate = async (): Promise<string> => {
  // Returns the raw download URL — the caller opens it via Linking.openURL
  // so the OS handles saving the file (no expo-file-system needed).
  const baseUrl = (api.defaults.baseURL ?? '').replace(/\/$/, '')
  const token = api.defaults.headers.common?.['Authorization'] ?? ''
  return `${baseUrl}/students/import/template?token=${encodeURIComponent(String(token).replace('Bearer ', ''))}`
}

export const previewStudentImportApi = async (fileUri: string, fileName: string, mimeType: string): Promise<ImportPreviewResult> => {
  const formData = new FormData()
  formData.append('file', { uri: fileUri, name: fileName, type: mimeType } as any)
  const res = await api.post('/students/import/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
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
