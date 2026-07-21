import api from './client'

export const getTermsApi = async () => {
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
export const getCurrentTermApi = async (): Promise<CurrentTerm | null> => {
  try {
    const res = await api.get('/terms/current')
    return res.data.term
  } catch (error: any) {
    if (error?.response?.status === 404) return null
    throw error
  }
}

export const createTermApi = async (data: {
  name: string
  session: string
  startDate: string
  endDate: string
}) => {
  const res = await api.post('/terms', data)
  return res.data
}

export const updateTermApi = async (id: string, data: { name?: string; session?: string; startDate?: string; endDate?: string }) => {
  const res = await api.put(`/terms/${id}`, data)
  return res.data
}

export const setCurrentTermApi = async (id: string) => {
  const res = await api.put(`/terms/${id}/set-current`)
  return res.data
}

export const deleteTermApi = async (id: string) => {
  const res = await api.delete(`/terms/${id}`)
  return res.data
}

export const endAcademicYearApi = async (): Promise<{ session: string; termsEnded: number; decisionsSet: number }> => {
  const res = await api.post('/terms/end-year')
  return res.data
}

export interface NewYearTermDef { name: string; startDate: string; endDate: string }

export const startNewAcademicYearApi = async (
  session: string,
  terms: NewYearTermDef[],
  setFirstCurrent = true,
): Promise<{ session: string; terms: unknown[] }> => {
  const res = await api.post('/terms/new-year', { session, terms, setFirstCurrent })
  return res.data
}
