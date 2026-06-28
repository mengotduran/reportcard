import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

export type FeeStatus = 'COMPLETE' | 'PARTIAL' | 'UNPAID' | 'NONE'

/**
 * The academic session fees are tracked against = the session of the current
 * term. Returns null when no current term is set (fees can't be scoped yet).
 */
export async function currentSession(schoolId: string): Promise<string | null> {
  const term = await prisma.term.findFirst({
    where: { schoolId, isCurrent: true },
    select: { session: true },
  })
  return term?.session ?? null
}

function feeStatus(due: number, paid: number): FeeStatus {
  if (due <= 0) return 'NONE'
  if (paid >= due) return 'COMPLETE'
  if (paid > 0) return 'PARTIAL'
  return 'UNPAID'
}

interface ClassFeeInfo { name: string; feeAmount: number; hasStream: boolean }

/**
 * Resolve a student's classLevel to its class fee. A streamed class is stored as
 * "Form 4" while its students are "Form 4 Arts"/"Form 4 Science", so an exact
 * name match misses them — fall back to the streamed base class.
 */
function makeFeeResolver(classes: ClassFeeInfo[]) {
  return (classLevel: string): number => {
    const exact = classes.find((c) => c.name === classLevel)
    if (exact) return exact.feeAmount
    const streamed = classes.find((c) => c.hasStream && classLevel.startsWith(`${c.name} `))
    return streamed ? streamed.feeAmount : 0
  }
}

async function loadClassFees(schoolId: string): Promise<ClassFeeInfo[]> {
  return prisma.classLevel.findMany({ where: { schoolId }, select: { name: true, feeAmount: true, hasStream: true } })
}

/** GET /api/fees/student/:studentId — ledger + balance for the current session. */
export const getStudentFees = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentId = String(req.params.studentId)

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const session = await currentSession(schoolId)
    const due = makeFeeResolver(await loadClassFees(schoolId))(student.classLevel)

    const payments = session
      ? await prisma.feePayment.findMany({
          where: { studentId, session },
          orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
        })
      : []

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    const balance = Math.max(0, due - totalPaid)

    res.json({
      session,
      student: { id: student.id, name: student.name, studentId: student.studentId, classLevel: student.classLevel },
      due,
      totalPaid,
      balance,
      status: feeStatus(due, totalPaid),
      payments,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** POST /api/fees/student/:studentId/payments — record one installment. */
export const addPayment = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentId = String(req.params.studentId)
    const { amount, paidOn, note } = req.body

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const amt = Math.round(Number(amount))
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ message: 'Enter a payment amount greater than zero' })
      return
    }

    const session = (req.body.session as string) || (await currentSession(schoolId))
    if (!session) {
      res.status(400).json({ message: 'No current term/session is set. Set a current term first.' })
      return
    }

    const when = paidOn ? new Date(paidOn) : new Date()
    if (isNaN(when.getTime())) {
      res.status(400).json({ message: 'Invalid payment date' })
      return
    }

    await prisma.feePayment.create({
      data: {
        schoolId,
        studentId,
        session,
        amount: amt,
        paidOn: when,
        note: note?.trim() || null,
        recordedBy: req.user!.id,
      },
    })

    // Return the refreshed summary so clients don't need a second round-trip.
    req.params.studentId = studentId
    return getStudentFees(req, res)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** DELETE /api/fees/payments/:paymentId — undo a mistaken entry. */
export const deletePayment = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const paymentId = String(req.params.paymentId)

    const payment = await prisma.feePayment.findFirst({ where: { id: paymentId, schoolId } })
    if (!payment) {
      res.status(404).json({ message: 'Payment not found' })
      return
    }

    await prisma.feePayment.delete({ where: { id: paymentId } })
    res.json({ message: 'Payment removed', studentId: payment.studentId })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/fees/class/:classLevel — roster for one class with each student's
 * paid/balance/status for the current session (drives the per-class fees grid).
 */
export const getClassFees = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const classLevel = decodeURIComponent(String(req.params.classLevel))
    const session = await currentSession(schoolId)

    const classes = await loadClassFees(schoolId)
    const cls = classes.find((c) => c.name === classLevel)
    const feeAmount = cls ? cls.feeAmount : makeFeeResolver(classes)(classLevel)

    // For a streamed class ("Form 4") the students are "Form 4 Arts"/"Form 4 Science".
    const studentWhere = cls?.hasStream
      ? { schoolId, isActive: true, OR: [{ classLevel }, { classLevel: { startsWith: `${classLevel} ` } }] }
      : { schoolId, isActive: true, classLevel }

    const students = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true, name: true, studentId: true },
      orderBy: { name: 'asc' },
    })

    const paidByStudent = new Map<string, number>()
    if (session && students.length) {
      const grouped = await prisma.feePayment.groupBy({
        by: ['studentId'],
        where: { schoolId, session, studentId: { in: students.map((s) => s.id) } },
        _sum: { amount: true },
      })
      for (const g of grouped) paidByStudent.set(g.studentId, g._sum.amount ?? 0)
    }

    const rows = students.map((s) => {
      const paid = paidByStudent.get(s.id) ?? 0
      return {
        studentId: s.id,
        name: s.name,
        studentIdCode: s.studentId,
        paid,
        balance: Math.max(0, feeAmount - paid),
        status: feeStatus(feeAmount, paid),
      }
    })

    res.json({ session, classLevel, feeAmount, students: rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/fees/payments/bulk — record one dated payment for each non-empty
 * row of the per-class grid. Each entry carries its own date + note:
 * Body: { entries:[{studentId, amount, paidOn?, note?}], paidOn?, note? }.
 * Top-level paidOn/note act as fallbacks when an entry omits them.
 */
export const addBulkPayments = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { paidOn, note } = req.body
    const entries = Array.isArray(req.body.entries) ? req.body.entries : []

    const session = (req.body.session as string) || (await currentSession(schoolId))
    if (!session) {
      res.status(400).json({ message: 'No current term/session is set. Set a current term first.' })
      return
    }

    const fallbackWhen = paidOn ? new Date(paidOn) : new Date()
    const validWhen = (d?: string): Date => {
      if (d) { const dt = new Date(d); if (!isNaN(dt.getTime())) return dt }
      return isNaN(fallbackWhen.getTime()) ? new Date() : fallbackWhen
    }

    // Keep only valid positive amounts for students that belong to this school.
    const cleaned = entries
      .map((e: any) => ({
        studentId: String(e.studentId),
        amount: Math.round(Number(e.amount)),
        paidOn: validWhen(e.paidOn),
        note: ((e.note ?? note)?.trim() || null) as string | null,
      }))
      .filter((e: any) => e.studentId && Number.isFinite(e.amount) && e.amount > 0)

    if (cleaned.length === 0) {
      res.status(400).json({ message: 'Enter at least one payment amount greater than zero' })
      return
    }

    const validIds = new Set(
      (await prisma.student.findMany({
        where: { schoolId, id: { in: cleaned.map((e: any) => e.studentId) } },
        select: { id: true },
      })).map((s) => s.id),
    )

    const data = cleaned
      .filter((e: any) => validIds.has(e.studentId))
      .map((e: any) => ({
        schoolId, studentId: e.studentId, session,
        amount: e.amount, paidOn: e.paidOn, note: e.note, recordedBy: req.user!.id,
      }))

    if (data.length === 0) {
      res.status(400).json({ message: 'No valid students to record payments for' })
      return
    }

    await prisma.feePayment.createMany({ data })
    res.status(201).json({ message: 'Payments recorded', recorded: data.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/fees/overview — per-student balance for the current session, used to
 * badge the student list. One pass: class fees + grouped payment sums.
 */
export const getFeesOverview = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const session = await currentSession(schoolId)

    const [students, classes] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId, isActive: true },
        select: { id: true, classLevel: true },
      }),
      loadClassFees(schoolId),
    ])

    const feeFor = makeFeeResolver(classes)

    const paidByStudent = new Map<string, number>()
    if (session) {
      const grouped = await prisma.feePayment.groupBy({
        by: ['studentId'],
        where: { schoolId, session },
        _sum: { amount: true },
      })
      for (const g of grouped) paidByStudent.set(g.studentId, g._sum.amount ?? 0)
    }

    const result = students.map((s) => {
      const due = feeFor(s.classLevel)
      const paid = paidByStudent.get(s.id) ?? 0
      return { studentId: s.id, due, paid, balance: Math.max(0, due - paid), status: feeStatus(due, paid) }
    })

    res.json({ session, students: result })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
