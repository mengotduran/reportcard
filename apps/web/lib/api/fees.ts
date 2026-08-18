import api from './client'

export type FeeStatus = 'COMPLETE' | 'PARTIAL' | 'UNPAID' | 'NONE'

export type FeeKind = 'TUITION' | 'REGISTRATION'

export interface FeePayment {
  id: string
  studentId: string
  session: string
  amount: number
  kind: FeeKind
  paidOn: string
  note: string | null
  recordedBy: string | null
  createdAt: string
}

/** One side of what a student owes: the class fee, or the yearly registration. */
export interface FeeSide { due: number; paid: number; balance: number }

export interface StudentFees {
  session: string | null
  isHndProgram?: boolean
  isRepeatingYear?: boolean
  student: { id: string; name: string; studentId: string; classLevel: string; directLevel2Entry?: boolean }
  due: number
  totalPaid: number
  balance: number
  status: FeeStatus
  /** Whether this school keeps registration apart from the class fee. */
  registrationSeparate: boolean
  tuition: FeeSide
  registration: FeeSide
  payments: FeePayment[]
}

export interface FeeOverviewRow {
  studentId: string
  due: number
  paid: number
  balance: number
  status: FeeStatus
}

export const getStudentFeesApi = async (studentId: string): Promise<StudentFees> => {
  const res = await api.get(`/fees/student/${studentId}`)
  return res.data
}

export const addFeePaymentApi = async (
  studentId: string,
  data: { amount: number; paidOn?: string; note?: string; kind?: FeeKind },
): Promise<StudentFees> => {
  const res = await api.post(`/fees/student/${studentId}/payments`, data)
  return res.data
}

export const deleteFeePaymentApi = async (paymentId: string) => {
  const res = await api.delete(`/fees/payments/${paymentId}`)
  return res.data
}

export const getFeesOverviewApi = async (): Promise<{ session: string | null; students: FeeOverviewRow[] }> => {
  const res = await api.get('/fees/overview')
  return res.data
}

export interface ClassFeeRow {
  studentId: string
  name: string
  studentIdCode: string
  fee?: number   // per-student (may differ for carry-over vs direct Level 2 entrants)
  directLevel2Entry?: boolean
  paid: number
  balance: number
  status: FeeStatus
}

export interface ClassFees {
  session: string | null
  isHndProgram?: boolean
  classLevel: string
  feeAmount: number
  students: ClassFeeRow[]
}

export const getClassFeesApi = async (classLevel: string): Promise<ClassFees> => {
  const res = await api.get(`/fees/class/${encodeURIComponent(classLevel)}`)
  return res.data
}

export const addBulkPaymentsApi = async (
  data: { entries: { studentId: string; amount: number; paidOn?: string; note?: string }[] },
): Promise<{ recorded: number }> => {
  const res = await api.post('/fees/payments/bulk', data)
  return res.data
}

/** Format an XAF integer with thousands separators, e.g. 150000 -> "150,000 XAF". */
export function formatXAF(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} XAF`
}

// ── Revenue ─────────────────────────────────────────────────────────────────

export interface RevenueLine { expected: number; collected: number; outstanding: number }

/** How many students sit behind a figure, by how far through paying they are. */
export interface Headcount { complete: number; partial: number; unpaid: number; noFee: number }

export interface RevenueRow {
  classLevel: string
  departmentId: string | null
  departmentName: string | null
  students: number
  headcount: Headcount
  tuition: RevenueLine
  registration: RevenueLine
  total: RevenueLine
}

export interface RevenueDepartmentRow {
  departmentId: string | null
  name: string
  students: number
  headcount: Headcount
  tuition: RevenueLine
  registration: RevenueLine
  total: RevenueLine
}

export interface Revenue {
  session: string
  registrationSeparate: boolean
  totals: { tuition: RevenueLine; registration: RevenueLine; total: RevenueLine }
  /** School-wide, for the headline. */
  headcount: Headcount
  byClass: RevenueRow[]
  byDepartment: RevenueDepartmentRow[]
  /** Collected for an exam board, so it sits beside the school's own money and never inside it. */
  examRegistration: { collected: number }
}

export const getRevenueApi = async (session?: string): Promise<Revenue> => {
  const res = await api.get('/fees/revenue', { params: session ? { session } : {} })
  return res.data
}
