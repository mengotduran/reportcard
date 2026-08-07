import api from './client'

export const getTeachersApi = async (params?: { term?: string }) => {
  const res = await api.get('/teachers', { params })
  return res.data
}

export const createTeacherApi = async (data: {
  name: string
  // Exactly one of these two — a person with no email logs in with a username instead.
  email?: string
  username?: string
  // Offline installs, or anyone with no email — online schools with an email instead get
  // an emailed setup link.
  password?: string
  role: string
  masterClassLevel?: string
  departments?: string[]
  // Primary only — which class's shared teaching team (max 3) this teacher joins.
  // Omitted for a Vice Principal, who has no class of their own.
  classLevel?: string
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
/**
 * `effectiveAt` ("YYYY-MM-DD") is the date the change takes effect, and it is what splits a
 * course's hours between the outgoing and incoming teacher. Omit it and the API uses today,
 * which is right whenever the admin is recording the change as it happens.
 */
export const assignTeacherSubjectsApi = async (id: string, subjectIds: string[], term?: string, effectiveAt?: string) => {
  const res = await api.put(`/teachers/${id}/subjects`, {
    subjectIds,
    ...(term ? { term } : {}),
    ...(effectiveAt ? { effectiveAt } : {}),
  })
  return res.data
}
