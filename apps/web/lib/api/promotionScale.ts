import api from './client'

export interface PromotionScale {
  trialMinimum: number | null
  passLabel: string
  trialLabel: string
  repeatLabel: string
  /** Real pass mark (10/20 for non-university; the school's own classification "Pass" band
   *  for university). Not stored on PromotionScale itself — derived server-side, read-only. */
  truePassMark: number
}

export const getPromotionScaleApi = async (): Promise<PromotionScale> => {
  const res = await api.get('/promotion-scale')
  return res.data
}

export const savePromotionScaleApi = async (data: {
  trialMinimum: number | null
  passLabel: string
  trialLabel: string
  repeatLabel: string
}) => {
  const res = await api.put('/promotion-scale', data)
  return res.data as { message: string; trialMinimum: number | null; passLabel: string; trialLabel: string; repeatLabel: string }
}
