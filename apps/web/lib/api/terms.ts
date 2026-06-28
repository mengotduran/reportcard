import api from './client'

export const getTermsApi = async () => {
  const res = await api.get('/terms')
  return res.data
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
