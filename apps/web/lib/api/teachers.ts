import api from './client'

export const getTeachersApi = async (params?: { term?: string }) => {
  const res = await api.get('/teachers', { params })
  return res.data
}

export const createTeacherApi = async (data: {
  name: string
  email: string
  // Offline installs only — online schools email the teacher a setup link instead.
  password?: string
  role: string
  masterClassLevel?: string
  departments?: string[]
  // University only — the semester this teacher was added under.
  term?: string
}) => {
  const res = await api.post('/teachers', data)
  return res.data
}

export const updateTeacherApi = async (id: string, data: { role: string; masterClassLevel?: string | null; departments?: string[] }) => {
  const res = await api.put(`/teachers/${id}`, data)
  return res.data as { message: string; teacher: any; displaced?: string }
}

export const deleteTeacherApi = async (id: string) => {
  const res = await api.delete(`/teachers/${id}`)
  return res.data
}

export const getTeacherSubjectsApi = async (id: string) => {
  const res = await api.get(`/teachers/${id}/subjects`)
  return res.data as { subjects: { id: string; name: string; classLevel: string }[] }
}

export const assignTeacherSubjectsApi = async (id: string, subjectIds: string[]) => {
  const res = await api.put(`/teachers/${id}/subjects`, { subjectIds })
  return res.data
}
