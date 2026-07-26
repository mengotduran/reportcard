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
  // `term` is the semester a university course belongs to (null for primary/secondary,
  // whose subjects run the whole year) — needed to scope a teacher's courses to the
  // semester now running.
  return res.data as { subjects: { id: string; name: string; classLevel: string; term: string | null }[] }
}

// `term` scopes the replace to one semester (universities). Without it the whole set is
// replaced, which is right for primary/secondary where subjects run the full year.
export const assignTeacherSubjectsApi = async (id: string, subjectIds: string[], term?: string) => {
  const res = await api.put(`/teachers/${id}/subjects`, { subjectIds, ...(term ? { term } : {}) })
  return res.data
}
