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

// ── HND 2-year program fee helpers ──────────────────────────────────────────

/** True for HND Level 1 and Level 2 classes. Level 3 (Degree) is a separate program. */
function isHndClass(classLevel: string): boolean {
  return / - Level [12]$/i.test(classLevel)
}

/** Given any HND class name, returns the Level 1 version (where the program fee lives). */
function toLevel1ClassName(classLevel: string): string {
  return classLevel.replace(/ - Level \d+$/i, ' - Level 1')
}

/**
 * Builds a map from each HND class name → the fee that student owes in total.
 *
 * Level 1: full 2-year program fee (set on the Level 1 class by admin).
 * Level 2: half that fee — covers students who join the program directly at Level 2.
 *   Students who started at Level 1 already paid (or part-paid) toward 650 000;
 *   their all-session payment sum is still compared against 325 000 here, so any
 *   overpayment from Level 1 simply leaves a zero balance in Level 2.
 */
function buildHndFeeMap(classes: ClassFeeInfo[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of classes) {
    if (!isHndClass(c.name)) continue
    const l1Name = toLevel1ClassName(c.name)
    const l1Fee = classes.find((x) => x.name === l1Name)?.feeAmount ?? 0
    if (/ - Level 1$/i.test(c.name)) {
      // Level 1: show the full program fee (falls back to own feeAmount if set)
      map.set(c.name, l1Fee || c.feeAmount)
    } else {
      // Level 2: half the Level 1 program fee
      map.set(c.name, l1Fee > 0 ? Math.round(l1Fee / 2) : c.feeAmount)
    }
  }
  return map
}

/** GET /api/fees/student/:studentId — ledger + balance. HND students see the full 2-year program fee across all sessions. */
export const getStudentFees = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentId = String(req.params.studentId)

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const [session, classes] = await Promise.all([
      currentSession(schoolId),
      loadClassFees(schoolId),
    ])

    const hndFeeMap = buildHndFeeMap(classes)
    const hnd = isHndClass(student.classLevel)
    const due = hnd ? (hndFeeMap.get(student.classLevel) ?? 0) : makeFeeResolver(classes)(student.classLevel)

    // HND: sum all payments ever made (both Level 1 and Level 2 sessions).
    // Others: scope to current session only.
    const payments = hnd
      ? await prisma.feePayment.findMany({
          where: { studentId },
          orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
        })
      : session
        ? await prisma.feePayment.findMany({
            where: { studentId, session },
            orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
          })
        : []

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    const balance = Math.max(0, due - totalPaid)

    res.json({
      session,
      isHndProgram: hnd,
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
 * paid/balance/status. HND Level 1/2 classes show the 2-year program fee
 * and sum payments across all sessions.
 */
export const getClassFees = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const classLevel = decodeURIComponent(String(req.params.classLevel))
    const [session, classes] = await Promise.all([
      currentSession(schoolId),
      loadClassFees(schoolId),
    ])

    const hnd = isHndClass(classLevel)
    const hndFeeMap = hnd ? buildHndFeeMap(classes) : null
    const cls = classes.find((c) => c.name === classLevel)
    const feeAmount = hnd
      ? (hndFeeMap!.get(classLevel) ?? 0)
      : cls ? cls.feeAmount : makeFeeResolver(classes)(classLevel)

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
    if (students.length) {
      const studentIds = students.map((s) => s.id)
      const grouped = await prisma.feePayment.groupBy({
        by: ['studentId'],
        // HND: sum all sessions; others: current session only
        where: hnd
          ? { schoolId, studentId: { in: studentIds } }
          : { schoolId, session: session ?? '__none__', studentId: { in: studentIds } },
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

    res.json({ session, isHndProgram: hnd, classLevel, feeAmount, students: rows })
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
 * GET /api/fees/overview — per-student balance used to badge the student list.
 * HND Level 1/2 students: 2-year program fee + all-session payment sum.
 * Everyone else: current-session fee + current-session payments.
 */
export const getFeesOverview = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const [session, students, classes] = await Promise.all([
      currentSession(schoolId),
      prisma.student.findMany({
        where: { schoolId, isActive: true },
        select: { id: true, classLevel: true },
      }),
      loadClassFees(schoolId),
    ])

    const feeFor = makeFeeResolver(classes)
    const hndFeeMap = buildHndFeeMap(classes)

    const hndIds = students.filter((s) => isHndClass(s.classLevel)).map((s) => s.id)
    const stdIds = students.filter((s) => !isHndClass(s.classLevel)).map((s) => s.id)

    const paidByStudent = new Map<string, number>()

    // HND students: sum across ALL sessions
    if (hndIds.length) {
      const grouped = await prisma.feePayment.groupBy({
        by: ['studentId'],
        where: { schoolId, studentId: { in: hndIds } },
        _sum: { amount: true },
      })
      for (const g of grouped) paidByStudent.set(g.studentId, g._sum.amount ?? 0)
    }

    // Non-HND students: current session only
    if (session && stdIds.length) {
      const grouped = await prisma.feePayment.groupBy({
        by: ['studentId'],
        where: { schoolId, session, studentId: { in: stdIds } },
        _sum: { amount: true },
      })
      for (const g of grouped) paidByStudent.set(g.studentId, g._sum.amount ?? 0)
    }

    const result = students.map((s) => {
      const due = isHndClass(s.classLevel) ? (hndFeeMap.get(s.classLevel) ?? 0) : feeFor(s.classLevel)
      const paid = paidByStudent.get(s.id) ?? 0
      return { studentId: s.id, due, paid, balance: Math.max(0, due - paid), status: feeStatus(due, paid) }
    })

    res.json({ session, students: result })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
