import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { currentSession } from './fees.controller'

export const HND_REGISTRATION_FEE = 65_000

type RegStatus = 'COMPLETE' | 'PARTIAL' | 'UNPAID'

function regStatus(paid: number, fee: number): RegStatus {
  if (paid >= fee) return 'COMPLETE'
  if (paid > 0) return 'PARTIAL'
  return 'UNPAID'
}

function deptFromLevel2Class(classLevel: string): string {
  return classLevel.replace(/^HND /, '').replace(/ - Level 2$/, '')
}

async function assertUniversity(schoolId: string, res: Response): Promise<boolean> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
  if (school?.type !== 'UNIVERSITY') {
    res.status(403).json({ message: 'HND registration is only available for university schools.' })
    return false
  }
  return true
}

/**
 * GET /api/hnd-registration
 * All Level 2 students with their registration fee payment status.
 */
export const getHndRegistrationList = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!(await assertUniversity(schoolId, res))) return

    const session = await currentSession(schoolId)

    const [students, level2Classes] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId, isActive: true, classLevel: { contains: '- Level 2' } },
        select: { id: true, name: true, studentId: true, classLevel: true },
        orderBy: [{ classLevel: 'asc' }, { name: 'asc' }],
      }),
      prisma.classLevel.findMany({
        where: { schoolId, name: { contains: '- Level 2' } },
        select: { name: true, hndRegistrationFee: true },
      }),
    ])

    // Fee per class level (fall back to default if admin hasn't set one yet)
    const classFeeMap = new Map<string, number>()
    for (const cl of level2Classes) classFeeMap.set(cl.name, cl.hndRegistrationFee ?? HND_REGISTRATION_FEE)

    const paidByStudent = new Map<string, number>()
    if (session && students.length) {
      const grouped = await prisma.hndRegistrationPayment.groupBy({
        by: ['studentId'],
        where: { schoolId, session, studentId: { in: students.map((s) => s.id) } },
        _sum: { amount: true },
      })
      for (const g of grouped) paidByStudent.set(g.studentId, g._sum.amount ?? 0)
    }

    const rows = students.map((s) => {
      const fee = classFeeMap.get(s.classLevel) ?? HND_REGISTRATION_FEE
      const paid = paidByStudent.get(s.id) ?? 0
      return {
        studentId: s.id,
        name: s.name,
        studentIdCode: s.studentId,
        classLevel: s.classLevel,
        department: deptFromLevel2Class(s.classLevel),
        fee,
        paid,
        balance: Math.max(0, fee - paid),
        status: regStatus(paid, fee),
      }
    })

    const departments = level2Classes
      .map((cl) => ({
        department: deptFromLevel2Class(cl.name),
        classLevel: cl.name,
        fee: cl.hndRegistrationFee ?? HND_REGISTRATION_FEE,
        isDefault: cl.hndRegistrationFee == null,
      }))
      .sort((a, b) => a.department.localeCompare(b.department))

    res.json({ session, defaultFee: HND_REGISTRATION_FEE, departments, students: rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/hnd-registration/student/:studentId
 * Single student's registration ledger + balance.
 */
export const getStudentHndRegistration = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!(await assertUniversity(schoolId, res))) return

    const studentId = String(req.params.studentId)
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) { res.status(404).json({ message: 'Student not found' }); return }

    const [session, cls] = await Promise.all([
      currentSession(schoolId),
      prisma.classLevel.findFirst({ where: { schoolId, name: student.classLevel }, select: { hndRegistrationFee: true } }),
    ])
    const fee = cls?.hndRegistrationFee ?? HND_REGISTRATION_FEE

    const payments = session
      ? await prisma.hndRegistrationPayment.findMany({
          where: { studentId, session },
          orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
        })
      : []

    const totalPaid = payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)

    res.json({
      session,
      fee,
      student: { id: student.id, name: student.name, studentId: student.studentId, classLevel: student.classLevel },
      totalPaid,
      balance: Math.max(0, fee - totalPaid),
      status: regStatus(totalPaid, fee),
      payments,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/hnd-registration/student/:studentId/payments
 * Record one installment toward the HND registration fee.
 */
export const addHndRegistrationPayment = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!(await assertUniversity(schoolId, res))) return

    const studentId = String(req.params.studentId)
    const { amount, paidOn, note } = req.body

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    if (!student) { res.status(404).json({ message: 'Student not found' }); return }

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
    if (isNaN(when.getTime())) { res.status(400).json({ message: 'Invalid payment date' }); return }

    await prisma.hndRegistrationPayment.create({
      data: { schoolId, studentId, session, amount: amt, paidOn: when, note: note?.trim() || null, recordedBy: req.user!.id },
    })

    req.params.studentId = studentId
    return getStudentHndRegistration(req, res)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * DELETE /api/hnd-registration/payments/:paymentId
 * Remove a mistaken registration payment entry.
 */
export const deleteHndRegistrationPayment = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const paymentId = String(req.params.paymentId)
    const payment = await prisma.hndRegistrationPayment.findFirst({ where: { id: paymentId, schoolId } })
    if (!payment) { res.status(404).json({ message: 'Payment not found' }); return }
    await prisma.hndRegistrationPayment.delete({ where: { id: paymentId } })
    res.json({ message: 'Payment removed', studentId: payment.studentId })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * PATCH /api/hnd-registration/department-fee
 * Set or update the HND registration fee for a Level 2 class/department.
 * Body: { classLevel: string, fee: number | null }
 * fee = null → resets to the school default (65,000 XAF).
 */
export const updateDepartmentFee = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    if (!(await assertUniversity(schoolId, res))) return

    const { classLevel, fee } = req.body
    if (!classLevel || typeof classLevel !== 'string') {
      res.status(400).json({ message: 'classLevel is required' })
      return
    }

    const feeVal =
      fee === null || fee === '' || fee === undefined
        ? null
        : Math.max(0, Math.round(Number(fee)))

    if (feeVal !== null && !Number.isFinite(feeVal)) {
      res.status(400).json({ message: 'Invalid fee value' })
      return
    }

    const cls = await prisma.classLevel.findFirst({ where: { schoolId, name: classLevel } })
    if (!cls) {
      res.status(404).json({ message: 'Class not found' })
      return
    }

    await prisma.classLevel.update({ where: { id: cls.id }, data: { hndRegistrationFee: feeVal } })
    res.json({
      message: 'Registration fee updated',
      department: deptFromLevel2Class(classLevel),
      classLevel,
      fee: feeVal ?? HND_REGISTRATION_FEE,
      isDefault: feeVal == null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
