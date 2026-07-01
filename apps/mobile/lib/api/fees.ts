import api from './client'

export type FeeStatus = 'COMPLETE' | 'PARTIAL' | 'UNPAID' | 'NONE'

export interface FeePayment {
  id: string
  studentId: string
  session: string
  amount: number
  paidOn: string
  note: string | null
  recordedBy: string | null
  createdAt: string
}

export interface StudentFees {
  session: string | null
  student: { id: string; name: string; studentId: string; classLevel: string }
  due: number
  totalPaid: number
  balance: number
  status: FeeStatus
  payments: FeePayment[]
}

export interface FeeOverviewRow {
  studentId: string
  due: number
  paid: number
  balance: number
  status: FeeStatus
}

export const getStudentFees = async (studentId: string): Promise<StudentFees> => {
  const res = await api.get(`/fees/student/${studentId}`)
  return res.data
}

export const addFeePayment = async (
  studentId: string,
  data: { amount: number; paidOn?: string; note?: string },
): Promise<StudentFees> => {
  const res = await api.post(`/fees/student/${studentId}/payments`, data)
  return res.data
}

export const deleteFeePayment = async (paymentId: string) => {
  const res = await api.delete(`/fees/payments/${paymentId}`)
  return res.data
}

export const getFeesOverview = async (): Promise<{ session: string | null; students: FeeOverviewRow[] }> => {
  const res = await api.get('/fees/overview')
  return res.data
}

export interface ClassFeeRow {
  studentId: string
  name: string
  studentIdCode: string
  paid: number
  balance: number
  status: FeeStatus
}

export interface ClassFees {
  session: string | null
  classLevel: string
  feeAmount: number
  students: ClassFeeRow[]
}

export const getClassFees = async (classLevel: string): Promise<ClassFees> => {
  const res = await api.get(`/fees/class/${encodeURIComponent(classLevel)}`)
  return res.data
}

export const addBulkPayments = async (
  data: { entries: { studentId: string; amount: number; paidOn?: string; note?: string }[] },
): Promise<{ recorded: number }> => {
  const res = await api.post('/fees/payments/bulk', data)
  return res.data
}

/** Format an XAF integer with thousands separators, e.g. 150000 -> "150,000 XAF". */
export function formatXAF(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} XAF`
}
