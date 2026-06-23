import api from './client'

export const getStudentClassLevelsApi = async () => {
  const res = await api.get('/students/class-levels')
  return res.data
}

export const getStudentsApi = async (params?: { classLevel?: string; search?: string }) => {
  const res = await api.get('/students', { params })
  return res.data
}

export const createStudentApi = async (data: {
  name: string
  classLevel: string
  gender: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
}) => {
  const res = await api.post('/students', data)
  return res.data
}

export const updateStudentApi = async (id: string, data: {
  name?: string
  classLevel?: string
  gender?: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
}) => {
  const res = await api.put(`/students/${id}`, data)
  return res.data
}

export const deleteStudentApi = async (id: string) => {
  const res = await api.delete(`/students/${id}`)
  return res.data
}
