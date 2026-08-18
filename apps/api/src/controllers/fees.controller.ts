import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { stripProgramme, withProgrammeOf } from '../utils/programme'

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

interface ClassFeeInfo { name: string; feeAmount: number; registrationFee: number; hasStream: boolean }

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
  return prisma.classLevel.findMany({
    where: { schoolId },
    select: { name: true, feeAmount: true, registrationFee: true, hasStream: true },
  })
}

/**
 * The yearly enrolment registration owed by a student, from their own class.
 *
 * Deliberately NOT following the HND two-year rule that resolveStudentFee applies to
 * tuition: registration is charged again each academic year (that is what makes it
 * registration), so a Level 2 student owes their own class's registration for this year,
 * not Level 1's. Same streamed-class fallback as the tuition resolver.
 */
function resolveStudentRegistration(student: { classLevel: string }, classes: ClassFeeInfo[]): number {
  const exact = classes.find((c) => c.name === student.classLevel)
  if (exact) return exact.registrationFee
  const streamed = classes.find((c) => c.hasStream && student.classLevel.startsWith(`${c.name} `))
  return streamed ? streamed.registrationFee : 0
}

// ── HND 2-year program fee helpers ──────────────────────────────────────────

/** True for HND Level 1 and Level 2 classes. Level 3 (Degree) is a separate program.
 *  Normalised first: the pattern anchors at the end, where the Day/Evening marker sits. */
function isHndClass(classLevel: string): boolean {
  return / - Level [12]$/i.test(stripProgramme(classLevel))
}

/** Given any HND class name, returns the Level 1 version (where the program fee lives) —
 *  IN THE SAME SECTION. An evening Level 2 carries over from evening Level 1, so resolving
 *  it to the day Level 1 would charge the student against the wrong programme's fee. */
function toLevel1ClassName(classLevel: string): string {
  return withProgrammeOf(classLevel, stripProgramme(classLevel).replace(/ - Level \d+$/i, ' - Level 1'))
}

/**
 * Resolve the total fee owed by a single student.
 *
 * HND Level 1 → full 2-year program fee stored on the Level 1 class.
 * HND Level 2, carry-over student (directLevel2Entry = false) → same Level 1 fee;
 *   payments made across both Level 1 and Level 2 sessions all count.
 * HND Level 2, direct entrant (directLevel2Entry = true) → the Level 2 class's
 *   own feeAmount (set independently by admin; NOT forced to half of Level 1).
 * Everything else → use the class's own feeAmount (session-scoped payments).
 */
function resolveStudentFee(
  student: { classLevel: string; directLevel2Entry: boolean },
  classes: ClassFeeInfo[],
): number {
  const bareClass = stripProgramme(student.classLevel)
  if (/ - Level 1$/i.test(bareClass)) {
    return classes.find((c) => c.name === student.classLevel)?.feeAmount ?? 0
  }
  if (/ - Level 2$/i.test(bareClass)) {
    if (student.directLevel2Entry) {
      // Direct Level 2 entrant: pay the Level 2 class fee (admin-configured)
      return classes.find((c) => c.name === student.classLevel)?.feeAmount ?? 0
    }
    // Carry-over from Level 1: pay the full program fee stored on Level 1
    const l1Name = toLevel1ClassName(student.classLevel)
    return classes.find((c) => c.name === l1Name)?.feeAmount ?? 0
  }
  return makeFeeResolver(classes)(student.classLevel)
}

interface FeeStudent { id: string; classLevel: string; directLevel2Entry: boolean; isRepeatingLevel: boolean }

/**
 * Which payments count towards this student's fee, as a Prisma `where`.
 *
 * An HND student mid-programme has every session's payments counted against one 2-year fee;
 * everyone else is scoped to a single session. Returns null when there is no session to
 * scope to, meaning nothing counts yet.
 *
 * Extracted because both the ledger (getStudentFees) and the overpayment guard on the write
 * path have to agree on it. A cap measured against a different total than the one the admin
 * is reading on screen would be worse than no cap at all.
 */
function paymentScope(
  student: { id: string; classLevel: string; isRepeatingLevel: boolean },
  session: string | null,
): { studentId: string; session?: string } | null {
  const hnd = isHndClass(student.classLevel)
  const isRepeatingYear = hnd && student.isRepeatingLevel
  if (hnd && !isRepeatingYear) return { studentId: student.id }
  return session ? { studentId: student.id, session } : null
}

/**
 * Where registration payments count. Always the current session, never the HND two-year
 * window that tuition uses: registration is charged again each academic year, so last
 * year's registration must not pay for this year's.
 */
function registrationScope(studentId: string, session: string | null) {
  return session ? { studentId, session, kind: 'REGISTRATION' as const } : null
}

/** Is registration collected and reported apart from the class fee at this school? */
async function registrationSeparate(schoolId: string): Promise<boolean> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { registrationSeparate: true } })
  return school?.registrationSeparate ?? false
}

export interface FeeSide { due: number; paid: number; balance: number }
export interface FeePosition {
  tuition: FeeSide
  registration: FeeSide
  /** Both sides added. This is what every caller that predates registration still reads. */
  due: number
  totalPaid: number
  balance: number
}

/**
 * What a student owes, has paid, and still has left to pay, split by kind.
 *
 * The combined figures are kept alongside the split, and mean exactly what they always did,
 * so every existing caller (report card gates, the fees badge on the roster, the parent
 * portal) keeps reading a total that now simply includes registration.
 */
async function feePosition(
  student: FeeStudent,
  classes: ClassFeeInfo[],
  session: string | null,
): Promise<FeePosition> {
  const tuitionDue = resolveStudentFee(student, classes)
  const registrationDue = resolveStudentRegistration(student, classes)

  const scope = paymentScope(student, session)
  const regScope = registrationScope(student.id, session)
  const [tuitionRows, registrationRows] = await Promise.all([
    scope ? prisma.feePayment.findMany({ where: { ...scope, kind: 'TUITION' }, select: { amount: true } }) : [],
    regScope ? prisma.feePayment.findMany({ where: regScope, select: { amount: true } }) : [],
  ])

  const sum = (rows: { amount: number }[]) => rows.reduce((total, p) => total + p.amount, 0)
  const tuitionPaid = sum(tuitionRows)
  const registrationPaid = sum(registrationRows)

  return {
    tuition: { due: tuitionDue, paid: tuitionPaid, balance: Math.max(0, tuitionDue - tuitionPaid) },
    registration: { due: registrationDue, paid: registrationPaid, balance: Math.max(0, registrationDue - registrationPaid) },
    due: tuitionDue + registrationDue,
    totalPaid: tuitionPaid + registrationPaid,
    balance: Math.max(0, (tuitionDue + registrationDue) - (tuitionPaid + registrationPaid)),
  }
}

/**
 * A payment may not exceed what is still owed. Returns an error message, or null to allow.
 *
 * Skipped entirely when `due` is 0: a school that has not set a class fee yet still needs to
 * be able to record what parents hand over, and there is no expected amount to exceed. See
 * the onboarding rule that fees are never prefilled with a stock figure.
 */
function overpaymentError(
  amount: number,
  due: number,
  balance: number,
  // Names the pot when the two are collected separately, so "already paid" is never
  // ambiguous between registration and school fees. Null means there is only one pot.
  kind: 'TUITION' | 'REGISTRATION' | null = null,
): string | null {
  if (due <= 0) return null
  if (amount <= balance) return null
  const what = kind === 'REGISTRATION' ? 'registration' : kind === 'TUITION' ? 'school fees' : 'fee'
  if (balance <= 0) return `This student has already paid the full ${what}. There is nothing left to record.`
  return `That is more than this student still owes in ${what}. The most you can record is ${balance.toLocaleString()}.`
}

/**
 * Which balance a payment of this kind must fit inside.
 *
 * When registration is collected separately the two pots are guarded independently, so
 * paying registration cannot eat into the tuition allowance or vice versa. When it is not,
 * there is one pot and one cap: the school shows parents a single figure, so refusing a
 * payment for exceeding a split they never see would be nonsense.
 */
function potFor(position: FeePosition, kind: 'TUITION' | 'REGISTRATION', separate: boolean): FeeSide {
  if (!separate) return { due: position.due, paid: position.totalPaid, balance: position.balance }
  return kind === 'REGISTRATION' ? position.registration : position.tuition
}

/** Body values are user input; anything that is not the registration marker is tuition. */
function readKind(value: unknown): 'TUITION' | 'REGISTRATION' {
  return String(value ?? '').toUpperCase() === 'REGISTRATION' ? 'REGISTRATION' : 'TUITION'
}

/** GET /api/fees/student/:studentId — ledger + balance. HND students see the full 2-year program fee across all sessions. */
export const getStudentFees = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentId = String(req.params.studentId)

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, name: true, studentId: true, classLevel: true, directLevel2Entry: true, isRepeatingLevel: true },
    })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const [session, classes] = await Promise.all([
      currentSession(schoolId),
      loadClassFees(schoolId),
    ])

    const hnd = isHndClass(student.classLevel)
    // Repeating Level 1 students pay a fresh annual fee scoped to the current session.
    const isRepeatingYear = hnd && student.isRepeatingLevel

    const [position, separate] = await Promise.all([
      feePosition(student, classes, session),
      registrationSeparate(schoolId),
    ])

    // The visible ledger: tuition on the HND-aware scope, registration on this session only.
    // Both in one query so the list reads in date order across the two kinds, which is how a
    // receipt book reads.
    const scope = paymentScope(student, session)
    const regScope = registrationScope(student.id, session)
    // An empty OR matches EVERY row in Prisma, so with nothing in scope the query is skipped
    // outright rather than handing this student the whole school's ledger.
    const scopes = [
      ...(scope ? [{ ...scope, kind: 'TUITION' as const }] : []),
      ...(regScope ? [regScope] : []),
    ]
    const payments = scopes.length
      ? await prisma.feePayment.findMany({ where: { OR: scopes }, orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }] })
      : []

    res.json({
      session,
      isHndProgram: hnd && !isRepeatingYear,
      isRepeatingYear,
      student: { id: student.id, name: student.name, studentId: student.studentId, classLevel: student.classLevel, directLevel2Entry: student.directLevel2Entry },
      // Combined, and unchanged in meaning: what the student owes in total this year.
      due: position.due,
      totalPaid: position.totalPaid,
      balance: position.balance,
      status: feeStatus(position.due, position.totalPaid),
      // The split. `registrationSeparate` tells the client whether to show it as two figures
      // and two receipts, or add them into one.
      registrationSeparate: separate,
      tuition: position.tuition,
      registration: position.registration,
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
    const kind = readKind(req.body.kind)

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

    // A payment may never exceed what is still owed. Checked here rather than only in the
    // form because the ledger is financial record: a typed extra zero would otherwise show
    // the student as overpaid with no way to tell it from a real credit.
    const [classes, separate] = await Promise.all([loadClassFees(schoolId), registrationSeparate(schoolId)])
    const position = await feePosition(student, classes, session)
    const pot = potFor(position, kind, separate)
    const overpayment = overpaymentError(amt, pot.due, pot.balance, separate ? kind : null)
    if (overpayment) {
      res.status(400).json({ message: overpayment })
      return
    }

    await prisma.feePayment.create({
      data: {
        schoolId,
        studentId,
        session,
        amount: amt,
        kind,
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
    const [session, classes, separate] = await Promise.all([
      currentSession(schoolId),
      loadClassFees(schoolId),
      registrationSeparate(schoolId),
    ])

    // This grid is the SCHOOL FEE sheet. Where registration is collected apart it is left
    // out of both the amounts and the payments here, and lives on the student's own fee
    // card instead; where it is not, the two are one figure and both count.
    const kindFilter = separate ? { kind: 'TUITION' as const } : {}
    const hnd = isHndClass(classLevel)
    const cls = classes.find((c) => c.name === classLevel)
    // For the class header we show the Level 1 program fee (carry-over students' total).
    // Per-student rows may differ if some are direct Level 2 entrants.
    const registration = separate ? 0 : resolveStudentRegistration({ classLevel }, classes)
    const feeAmount = (hnd
      ? resolveStudentFee({ classLevel, directLevel2Entry: false }, classes)
      : cls ? cls.feeAmount : makeFeeResolver(classes)(classLevel)) + registration

    // For a streamed class ("Form 4") the students are "Form 4 Arts"/"Form 4 Science".
    const studentWhere = cls?.hasStream
      ? { schoolId, isActive: true, OR: [{ classLevel }, { classLevel: { startsWith: `${classLevel} ` } }] }
      : { schoolId, isActive: true, classLevel }

    const students = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true, name: true, studentId: true, directLevel2Entry: true, isRepeatingLevel: true },
      orderBy: { name: 'asc' },
    })

    const paidByStudent = new Map<string, number>()
    if (students.length) {
      const studentIds = students.map((s) => s.id)
      if (hnd) {
        // HND: non-repeating students sum all sessions; repeating students scope to current session.
        const nonRepeatIds = students.filter((s) => !s.isRepeatingLevel).map((s) => s.id)
        const repeatIds = students.filter((s) => s.isRepeatingLevel).map((s) => s.id)
        if (nonRepeatIds.length) {
          const g = await prisma.feePayment.groupBy({
            by: ['studentId'],
            where: { schoolId, ...kindFilter, studentId: { in: nonRepeatIds } },
            _sum: { amount: true },
          })
          for (const r of g) paidByStudent.set(r.studentId, r._sum.amount ?? 0)
        }
        if (repeatIds.length && session) {
          const g = await prisma.feePayment.groupBy({
            by: ['studentId'],
            where: { schoolId, session, ...kindFilter, studentId: { in: repeatIds } },
            _sum: { amount: true },
          })
          for (const r of g) paidByStudent.set(r.studentId, r._sum.amount ?? 0)
        }
      } else {
        const grouped = await prisma.feePayment.groupBy({
          by: ['studentId'],
          where: { schoolId, session: session ?? '__none__', ...kindFilter, studentId: { in: studentIds } },
          _sum: { amount: true },
        })
        for (const g of grouped) paidByStudent.set(g.studentId, g._sum.amount ?? 0)
      }
    }

    const rows = students.map((s) => {
      const studentFee = hnd
        ? resolveStudentFee({ classLevel, directLevel2Entry: s.directLevel2Entry }, classes) + registration
        : feeAmount
      const paid = paidByStudent.get(s.id) ?? 0
      return {
        studentId: s.id,
        name: s.name,
        studentIdCode: s.studentId,
        isRepeatingYear: hnd && s.isRepeatingLevel,
        directLevel2Entry: s.directLevel2Entry,
        fee: studentFee,
        paid,
        balance: Math.max(0, studentFee - paid),
        status: feeStatus(studentFee, paid),
      }
    })

    res.json({ session, isHndProgram: hnd, classLevel, feeAmount, registrationSeparate: separate, students: rows })
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

    const ids = cleaned.map((e: any) => e.studentId)
    const [students, classes, priorPayments, separate] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId, id: { in: ids } },
        select: { id: true, name: true, classLevel: true, directLevel2Entry: true, isRepeatingLevel: true },
      }),
      loadClassFees(schoolId),
      // Every payment for every student in the batch, unscoped, in ONE query. Scoping is
      // applied per student below because an HND student mid-programme counts all sessions
      // while everyone else counts only this one.
      prisma.feePayment.findMany({
        where: { studentId: { in: ids } },
        select: { studentId: true, session: true, amount: true, kind: true },
      }),
      registrationSeparate(schoolId),
    ])
    const byId = new Map(students.map((s) => [s.id, s]))

    // Same rule as the single-payment path: nothing may exceed what is still owed. The whole
    // batch is refused rather than silently dropping the offending rows, because quietly not
    // recording money someone handed over is the worst outcome here.
    const rejected: string[] = []
    // Counts what earlier rows in THIS batch already allocated to a student, so two rows for
    // the same person are judged against the balance left after the first, not the original.
    const allocated = new Map<string, number>()
    for (const e of cleaned as any[]) {
      const student = byId.get(e.studentId)
      if (!student) continue
      const scope = paymentScope(student, session)
      // Tuition follows the HND-aware scope; registration is this session only. When the two
      // are not collected separately they are one pot, so both count towards one cap.
      const mine = priorPayments.filter((p) => p.studentId === student.id)
      const tuitionPaid = scope
        ? mine.filter((p) => p.kind === 'TUITION' && (scope.session === undefined || p.session === scope.session))
            .reduce((sum, p) => sum + p.amount, 0)
        : 0
      const registrationPaid = mine
        .filter((p) => p.kind === 'REGISTRATION' && p.session === session)
        .reduce((sum, p) => sum + p.amount, 0)
      const tuitionDue = resolveStudentFee(student, classes)
      const registrationDue = resolveStudentRegistration(student, classes)
      // The grid records school fees; registration has its own flow, so a bulk row is
      // always tuition when the two are kept apart, and the whole pot when they are not.
      const totalPaid = separate ? tuitionPaid : tuitionPaid + registrationPaid
      const due = separate ? tuitionDue : tuitionDue + registrationDue
      const already = totalPaid + (allocated.get(student.id) ?? 0)
      const message = overpaymentError(e.amount, due, Math.max(0, due - already), separate ? 'TUITION' : null)
      if (message) rejected.push(`${student.name}: ${message}`)
      else allocated.set(student.id, (allocated.get(student.id) ?? 0) + e.amount)
    }
    if (rejected.length > 0) {
      res.status(400).json({
        message: `No payments were recorded. Fix these first.\n${rejected.join('\n')}`,
        rejected,
      })
      return
    }

    const data = cleaned
      .filter((e: any) => byId.has(e.studentId))
      .map((e: any) => ({
        schoolId, studentId: e.studentId, session,
        // The per-class grid collects school fees. Registration is recorded on the student's
        // own fee card, where the bursar picks which of the two the money is for.
        amount: e.amount, kind: 'TUITION' as const, paidOn: e.paidOn, note: e.note, recordedBy: req.user!.id,
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
        select: { id: true, classLevel: true, directLevel2Entry: true, isRepeatingLevel: true },
      }),
      loadClassFees(schoolId),
    ])

    // HND non-repeating: sum all sessions. HND repeating + non-HND: current session only.
    const hndNonRepeatIds = students.filter((s) => isHndClass(s.classLevel) && !s.isRepeatingLevel).map((s) => s.id)
    const sessionScopedIds = students.filter((s) => !isHndClass(s.classLevel) || s.isRepeatingLevel).map((s) => s.id)

    const paidByStudent = new Map<string, number>()
    const add = (studentId: string, amount: number) =>
      paidByStudent.set(studentId, (paidByStudent.get(studentId) ?? 0) + amount)

    // TUITION only on the all-sessions HND scope: registration is charged per year, so
    // last year's must never count towards this year's badge.
    if (hndNonRepeatIds.length) {
      const grouped = await prisma.feePayment.groupBy({
        by: ['studentId'],
        where: { schoolId, kind: 'TUITION', studentId: { in: hndNonRepeatIds } },
        _sum: { amount: true },
      })
      for (const g of grouped) add(g.studentId, g._sum.amount ?? 0)
    }

    if (session) {
      // Everyone else's tuition, plus EVERY student's registration, both scoped to this
      // session. The HND students appear in this second group for their registration only.
      const grouped = await prisma.feePayment.groupBy({
        by: ['studentId'],
        where: {
          schoolId, session,
          OR: [
            { kind: 'TUITION', studentId: { in: sessionScopedIds } },
            { kind: 'REGISTRATION', studentId: { in: students.map((s) => s.id) } },
          ],
        },
        _sum: { amount: true },
      })
      for (const g of grouped) add(g.studentId, g._sum.amount ?? 0)
    }

    const result = students.map((s) => {
      // The badge speaks for the whole year, so it counts registration too whether or not
      // the school reports the two apart.
      const due = resolveStudentFee(s, classes) + resolveStudentRegistration(s, classes)
      const paid = paidByStudent.get(s.id) ?? 0
      return { studentId: s.id, due, paid, balance: Math.max(0, due - paid), status: feeStatus(due, paid) }
    })

    res.json({ session, students: result })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// ── Revenue ─────────────────────────────────────────────────────────────────
//
// What the school has actually taken in, against what it expected to. Everything else in
// this file answers "what does this student owe"; this answers the founder's question, which
// is a different one and was never asked before now.

interface RevenueLine { expected: number; collected: number; outstanding: number }

/**
 * How many students sit behind a figure, split by how far through paying they are.
 *
 * An amount alone does not answer the question a head teacher actually asks about a class:
 * 800,000 outstanding reads very differently when it is two families who have paid nothing
 * than when it is thirty who are each an installment short.
 *
 * `noFee` is students whose class has no fee set at all. They are neither paid nor owing,
 * and folding them into either would make a school that has not finished onboarding look
 * like one whose parents are in arrears.
 */
interface Headcount { complete: number; partial: number; unpaid: number; noFee: number }

const emptyHeadcount = (): Headcount => ({ complete: 0, partial: 0, unpaid: 0, noFee: 0 })

function addHead(target: Headcount, status: FeeStatus) {
  if (status === 'COMPLETE') target.complete += 1
  else if (status === 'PARTIAL') target.partial += 1
  else if (status === 'UNPAID') target.unpaid += 1
  else target.noFee += 1
}

function addHeadcount(target: Headcount, source: Headcount) {
  target.complete += source.complete
  target.partial += source.partial
  target.unpaid += source.unpaid
  target.noFee += source.noFee
}

const emptyLine = (): RevenueLine => ({ expected: 0, collected: 0, outstanding: 0 })

function addLine(target: RevenueLine, expected: number, collected: number) {
  target.expected += expected
  target.collected += collected
  // Floored PER STUDENT before it is added, never on the total: one parent who overpaid
  // would otherwise cancel out another's debt and the school would read the year as settled.
  target.outstanding += Math.max(0, expected - collected)
}

/**
 * GET /api/fees/revenue?session=YYYY/YYYY
 *
 * Expected, collected and outstanding for registration and school fees, per class, per
 * department and school-wide.
 *
 * Expected counts ACTIVE students only — a dismissed student is not owed money for the rest
 * of the year — while collected counts everyone, because money that came in came in. That
 * asymmetry is deliberate and is why outstanding is floored per student.
 *
 * Government exam registration (FSLC / GCE / HND) is reported on its own, outside every
 * total: the school collects it on behalf of an exam board and pays it out again, so adding
 * it to revenue would overstate what the school actually made.
 */
export const getRevenue = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const requested = String(req.query.session ?? '').trim()
    const session = requested || (await currentSession(schoolId))

    if (!session) {
      res.status(400).json({ message: 'No current term/session is set. Set a current term first.' })
      return
    }

    const [separate, classes, departments, students] = await Promise.all([
      registrationSeparate(schoolId),
      prisma.classLevel.findMany({
        where: { schoolId },
        select: { name: true, feeAmount: true, registrationFee: true, hasStream: true, departmentId: true, order: true },
        orderBy: { order: 'asc' },
      }),
      prisma.department.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      // Every student, not only the active ones: an inactive student who paid still
      // contributed money, and leaving them out would lose it from the collected figure.
      prisma.student.findMany({
        where: { schoolId },
        select: { id: true, classLevel: true, isActive: true, status: true, directLevel2Entry: true, isRepeatingLevel: true },
      }),
    ])

    const classFees: ClassFeeInfo[] = classes.map((c) => ({
      name: c.name, feeAmount: c.feeAmount, registrationFee: c.registrationFee, hasStream: c.hasStream,
    }))

    // Payments for this session, per student and kind, in one query. Tuition from OTHER
    // sessions is deliberately not counted: this screen is "what came in this year", so an
    // HND student's Level 1 payments belong to the year they were made.
    const grouped = await prisma.feePayment.groupBy({
      by: ['studentId', 'kind'],
      where: { schoolId, session },
      _sum: { amount: true },
    })
    const paid = new Map<string, { tuition: number; registration: number }>()
    for (const g of grouped) {
      const row = paid.get(g.studentId) ?? { tuition: 0, registration: 0 }
      if (g.kind === 'REGISTRATION') row.registration += g._sum.amount ?? 0
      else row.tuition += g._sum.amount ?? 0
      paid.set(g.studentId, row)
    }

    // Which defined class a student belongs to, so a streamed roster ("Form 4 Arts") is
    // counted under the class that actually carries the fee ("Form 4").
    const classOf = (classLevel: string) =>
      classes.find((c) => c.name === classLevel)
      ?? classes.find((c) => c.hasStream && classLevel.startsWith(`${c.name} `))
      ?? null

    interface Bucket {
      key: string; name: string; departmentId: string | null
      students: number; headcount: Headcount
      tuition: RevenueLine; registration: RevenueLine
    }
    const byClass = new Map<string, Bucket>()
    const totals = { tuition: emptyLine(), registration: emptyLine() }
    const totalHeads = emptyHeadcount()

    for (const student of students) {
      const counts = student.isActive && student.status === 'ACTIVE'
      const money = paid.get(student.id) ?? { tuition: 0, registration: 0 }
      // Nothing owed and nothing paid: an inactive student with no payments this session is
      // not part of this year's story at all.
      if (!counts && money.tuition === 0 && money.registration === 0) continue

      const cls = classOf(student.classLevel)
      const key = cls?.name ?? student.classLevel
      const bucket = byClass.get(key) ?? {
        key,
        name: key,
        departmentId: cls?.departmentId ?? null,
        students: 0,
        headcount: emptyHeadcount(),
        tuition: emptyLine(),
        registration: emptyLine(),
      }
      if (counts) bucket.students += 1

      const tuitionExpected = counts ? resolveStudentFee(student, classFees) : 0
      const registrationExpected = counts ? resolveStudentRegistration(student, classFees) : 0

      addLine(bucket.tuition, tuitionExpected, money.tuition)
      addLine(bucket.registration, registrationExpected, money.registration)
      addLine(totals.tuition, tuitionExpected, money.tuition)
      addLine(totals.registration, registrationExpected, money.registration)

      // Who has finished paying, judged on the WHOLE year (registration and class fee
      // together) whether or not the school reports them apart: "has this child paid" is one
      // question to a bursar, and a student settled on one side but not the other has not.
      // Only active students are counted, so the heads always add up to the class roster.
      if (counts) {
        const status = feeStatus(tuitionExpected + registrationExpected, money.tuition + money.registration)
        addHead(bucket.headcount, status)
        addHead(totalHeads, status)
      }

      byClass.set(key, bucket)
    }

    const combine = (a: RevenueLine, b: RevenueLine): RevenueLine => ({
      expected: a.expected + b.expected,
      collected: a.collected + b.collected,
      outstanding: a.outstanding + b.outstanding,
    })

    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const classRows = [...byClass.values()]
      .sort((a, b) => {
        const ai = classes.findIndex((c) => c.name === a.key)
        const bi = classes.findIndex((c) => c.name === b.key)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
      .map((b) => ({
        classLevel: b.name,
        departmentId: b.departmentId,
        departmentName: b.departmentId ? deptName.get(b.departmentId) ?? null : null,
        students: b.students,
        headcount: b.headcount,
        tuition: b.tuition,
        registration: b.registration,
        total: combine(b.tuition, b.registration),
      }))

    const byDepartment = new Map<string, { departmentId: string | null; name: string; students: number; headcount: Headcount; tuition: RevenueLine; registration: RevenueLine }>()
    for (const row of classRows) {
      const key = row.departmentId ?? '__none__'
      const bucket = byDepartment.get(key) ?? {
        departmentId: row.departmentId,
        name: row.departmentName ?? 'No department',
        students: 0,
        headcount: emptyHeadcount(),
        tuition: emptyLine(),
        registration: emptyLine(),
      }
      bucket.students += row.students
      addHeadcount(bucket.headcount, row.headcount)
      bucket.tuition = combine(bucket.tuition, row.tuition)
      bucket.registration = combine(bucket.registration, row.registration)
      byDepartment.set(key, bucket)
    }

    // Collected on behalf of an exam board, so it is reported beside the school's own money
    // and never inside it.
    const examRegistration = await prisma.hndRegistrationPayment.aggregate({
      where: { schoolId, session },
      _sum: { amount: true },
    })

    res.json({
      session,
      registrationSeparate: separate,
      totals: {
        tuition: totals.tuition,
        registration: totals.registration,
        total: combine(totals.tuition, totals.registration),
      },
      headcount: totalHeads,
      byClass: classRows,
      byDepartment: [...byDepartment.values()].map((d) => ({
        departmentId: d.departmentId,
        name: d.name,
        students: d.students,
        headcount: d.headcount,
        tuition: d.tuition,
        registration: d.registration,
        total: combine(d.tuition, d.registration),
      })),
      examRegistration: { collected: examRegistration._sum.amount ?? 0 },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
