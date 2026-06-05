import api from './client'

export interface Term {
  id: string
  name: string
  session: string
  isCurrent: boolean
}

export const getTerms = async (): Promise<{ terms: Term[] }> => {
  const res = await api.get('/terms')
  return res.data
}

export const createTerm = async (data: { name: string; session: string }) => {
  const res = await api.post('/terms', data)
  return res.data
}

export const setCurrentTerm = async (id: string) => {
  const res = await api.put(`/terms/${id}/set-current`)
  return res.data
}

export const deleteTerm = async (id: string) => {
  const res = await api.delete(`/terms/${id}`)
  return res.data
}
