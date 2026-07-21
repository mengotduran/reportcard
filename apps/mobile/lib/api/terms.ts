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

export interface CurrentTerm {
  id: string
  name: string
  session: string
  startDate: string
  endDate: string
  isCurrent: boolean
}

// 404 just means the school hasn't set a current term yet — not an error the
// caller needs to handle, so it resolves to null instead of throwing.
export const getCurrentTerm = async (): Promise<CurrentTerm | null> => {
  try {
    const res = await api.get('/terms/current')
    return res.data.term
  } catch (error: any) {
    if (error?.response?.status === 404) return null
    throw error
  }
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
