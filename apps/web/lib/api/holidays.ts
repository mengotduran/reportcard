import api from './client'

/**
 * A school closure — public holiday, mid-term break, anything that cancels teaching.
 *
 * Dates are plain "YYYY-MM-DD" calendar days and the range is INCLUSIVE of both ends, so a
 * one-day holiday has startDate === endDate and `days: 1`. Any scheduled period falling
 * inside one stops counting toward taught hours, and an absence reported for such a period
 * stops subtracting — nobody missed a class that never ran.
 */
export interface SchoolHoliday {
  id: string
  name: string
  startDate: string
  endDate: string
  /** Inclusive day count, computed server-side. */
  days: number
}

export const getHolidaysApi = async (): Promise<{ holidays: SchoolHoliday[] }> => {
  const res = await api.get('/holidays')
  return res.data
}

export const createHolidayApi = async (data: { name: string; startDate: string; endDate: string }) => {
  const res = await api.post('/holidays', data)
  return res.data
}

export const updateHolidayApi = async (id: string, data: { name: string; startDate: string; endDate: string }) => {
  const res = await api.put(`/holidays/${id}`, data)
  return res.data
}

export const deleteHolidayApi = async (id: string) => {
  const res = await api.delete(`/holidays/${id}`)
  return res.data
}
