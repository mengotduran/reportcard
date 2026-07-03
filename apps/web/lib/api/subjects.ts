import api from './client'

export const getSubjectsApi = async () => {
  const res = await api.get('/subjects')
  return res.data
}

export const createSubjectApi = async (data: { name: string; classLevel: string; code?: string | null; coefficient?: number; credit?: number | null; term?: string | null }) => {
  const res = await api.post('/subjects', data)
  return res.data
}

export const updateSubjectApi = async (id: string, data: { name?: string; classLevel?: string; code?: string | null; coefficient?: number; credit?: number | null; term?: string | null }) => {
  const res = await api.put(`/subjects/${id}`, data)
  return res.data
}

export const deleteSubjectApi = async (id: string) => {
  const res = await api.delete(`/subjects/${id}`)
  return res.data
}

export const copySubjectsApi = async (fromClassLevel: string, toClassLevel: string): Promise<{ copied: number }> => {
  const res = await api.post('/subjects/copy', { fromClassLevel, toClassLevel })
  return res.data
}
