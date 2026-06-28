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
