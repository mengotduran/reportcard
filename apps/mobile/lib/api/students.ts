import api from './client'

export interface Student {
  id: string
  name: string
  studentId: string
  classLevel: string
  gender: string | null
  guardianName: string | null
  isActive: boolean
}

export const getStudents = async (params?: { classLevel?: string; search?: string; session?: string }): Promise<{ students: Student[] }> => {
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

export const deleteStudent = async (id: string) => {
  const res = await api.delete(`/students/${id}`)
  return res.data
}
