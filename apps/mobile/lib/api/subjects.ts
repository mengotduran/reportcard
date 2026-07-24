import api from './client'

export interface Subject {
  id: string
  name: string
  classLevel: string
  maxScore: number
  coefficient: number
  credit?: number | null
  term?: string | null
  requiredHours?: number | null
}

export const getSubjects = async (): Promise<{ subjects: Subject[] }> => {
  const res = await api.get('/subjects')
  return res.data
}

export const createSubject = async (data: { name: string; classLevel: string; maxScore?: number; coefficient?: number; credit?: number | null; term?: string | null; requiredHours?: number | null }) => {
  const res = await api.post('/subjects', data)
  return res.data
}

export const deleteSubject = async (id: string) => {
  const res = await api.delete(`/subjects/${id}`)
  return res.data
}
