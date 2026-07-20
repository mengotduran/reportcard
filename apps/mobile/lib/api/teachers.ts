import api from './client'

export interface Teacher {
  id: string
  name: string
  email: string
  role: 'CLASS_TEACHER' | 'CLASS_MASTER'
  masterClassLevel: string | null
  // Every class this teacher is attached to, by assigned subject or by being class
  // master — one of two signals behind department membership (see `departments`).
  classLevels?: string[]
  // Departments (secondary) / programmes (university) this teacher is explicitly
  // placed in, independent of classLevels — a teacher can be in more than one.
  departments?: string[]
}

export const getTeachers = async (): Promise<{ teachers: Teacher[] }> => {
  const res = await api.get('/teachers')
  return res.data
}

export const createTeacher = async (data: {
  name: string; email: string; password: string
  role: string; masterClassLevel?: string; departments?: string[]
}) => {
  const res = await api.post('/teachers', data)
  return res.data
}

export const updateTeacher = async (id: string, data: Partial<{ name: string; email: string; masterClassLevel: string | null; departments: string[] }>) => {
  const res = await api.put(`/teachers/${id}`, data)
  return res.data
}

export const deleteTeacher = async (id: string) => {
  const res = await api.delete(`/teachers/${id}`)
  return res.data
}
