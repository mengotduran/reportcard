import api from './client'
import { FeePayment } from './fees'

export type RegStatus = 'COMPLETE' | 'PARTIAL' | 'UNPAID'

export interface DepartmentFeeRow {
  department: string
  classLevel: string
  fee: number
  isDefault: boolean
}

export interface HndRegRow {
  studentId: string
  name: string
  studentIdCode: string
  classLevel: string
  department: string
  fee: number
  paid: number
  balance: number
  status: RegStatus
}

export interface HndRegList {
  session: string | null
  defaultFee: number
  departments: DepartmentFeeRow[]
  students: HndRegRow[]
}

export interface HndRegDetail {
  session: string | null
  fee: number
  student: { id: string; name: string; studentId: string; classLevel: string }
  totalPaid: number
  balance: number
  status: RegStatus
  payments: FeePayment[]
}

export const getHndRegistrationList = async (): Promise<HndRegList> => {
  const res = await api.get('/hnd-registration')
  return res.data
}

export const getStudentHndRegistration = async (studentId: string): Promise<HndRegDetail> => {
  const res = await api.get(`/hnd-registration/student/${studentId}`)
  return res.data
}

export const addHndRegistrationPayment = async (
  studentId: string,
  data: { amount: number; paidOn?: string; note?: string },
): Promise<HndRegDetail> => {
  const res = await api.post(`/hnd-registration/student/${studentId}/payments`, data)
  return res.data
}

export const deleteHndRegistrationPayment = async (paymentId: string) => {
  const res = await api.delete(`/hnd-registration/payments/${paymentId}`)
  return res.data
}

export const updateDepartmentFee = async (classLevel: string, fee: number | null): Promise<DepartmentFeeRow> => {
  const res = await api.patch('/hnd-registration/department-fee', { classLevel, fee })
  return res.data
}
