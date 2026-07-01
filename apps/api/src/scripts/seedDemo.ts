import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'
import { DEMO_SUBDOMAIN } from '../config/demo'

// ---------------------------------------------------------------------------
// Demo tenant — a self-contained, disposable school for recruiters to explore.
//
// Everything here lives under ONE school (identified by DEMO_SUBDOMAIN). The
// app is multi-tenant (all queries scoped by schoolId), so a demo SCHOOL_ADMIN
// can never see or touch any real school's data. The only thing a recruiter can
// damage is this demo school itself — which `resetDemoSchool()` rebuilds from
// scratch, so it can be run on a schedule to keep the demo clean.
//
// IMPORTANT: never create a SUPERADMIN here — that role crosses tenants.
// ---------------------------------------------------------------------------

const DEMO_SCHOOL_EMAIL = 'demo-school@reportcard.demo'
const DEMO_PASSWORD = 'demo1234'

export const DEMO_LOGINS = {
  admin: { email: 'recruiter@demo.com', password: DEMO_PASSWORD },
  classMaster: { email: 'teacher@demo.com', password: DEMO_PASSWORD },
}

// Mirror of the app's own grading (reportcard.controller.ts) so seeded report
// cards look identical to ones created through the UI.
function calculateGrade(pct: number): string {
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B'
  if (pct >= 60) return 'C'
  if (pct >= 50) return 'D'
  return 'F'
}
function autoRemark(pct: number): string {
  if (pct >= 80) return 'Excellent'
  if (pct >= 70) return 'Very Good'
  if (pct >= 60) return 'Good'
  if (pct >= 50) return 'Average'
  if (pct >= 40) return 'Needs Improvement'
  return 'Poor'
}

/**
 * Deletes ALL data belonging to the demo school (FK-safe order) and rebuilds it.
 * Only ever touches the demo tenant. Returns a small summary for logging.
 */
export async function resetDemoSchool() {
  const existing = await prisma.school.findUnique({ where: { subdomain: DEMO_SUBDOMAIN } })

  if (existing) {
    const schoolId = existing.id
    // Children first — most relations are onDelete: Restrict.
    await prisma.feePayment.deleteMany({ where: { schoolId } })
    await prisma.reportEntry.deleteMany({ where: { reportCard: { schoolId } } })
    await prisma.reportCard.deleteMany({ where: { schoolId } })
    await prisma.teacherSubject.deleteMany({ where: { subject: { schoolId } } })
    await prisma.subject.deleteMany({ where: { schoolId } })
    await prisma.student.deleteMany({ where: { schoolId } })
    await prisma.term.deleteMany({ where: { schoolId } })
    await prisma.classLevel.deleteMany({ where: { schoolId } })
    await prisma.gradingScale.deleteMany({ where: { schoolId } })
    await prisma.reportCardTemplate.deleteMany({ where: { schoolId } })
    await prisma.classListTemplate.deleteMany({ where: { schoolId } })
    await prisma.user.deleteMany({ where: { schoolId } })
    await prisma.school.delete({ where: { id: schoolId } })
  }

  const hashed = await bcrypt.hash(DEMO_PASSWORD, 12)

  // --- School ---------------------------------------------------------------
  const school = await prisma.school.create({
    data: {
      name: 'Greenfield Demo Secondary',
      type: 'SECONDARY',
      email: DEMO_SCHOOL_EMAIL,
      phone: '+237 600 000 000',
      address: '123 Demo Avenue, Buea',
      subdomain: DEMO_SUBDOMAIN,
    },
  })
  const schoolId = school.id

  // --- Users ----------------------------------------------------------------
  const [admin, classMaster] = await Promise.all([
    prisma.user.create({
      data: {
        schoolId,
        name: 'Demo Administrator',
        email: DEMO_LOGINS.admin.email,
        password: hashed,
        role: 'SCHOOL_ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        schoolId,
        name: 'Mr. Tabe (Class Master)',
        email: DEMO_LOGINS.classMaster.email,
        password: hashed,
        role: 'CLASS_MASTER',
        masterClassLevel: 'Form 1',
      },
    }),
  ])

  // --- Class levels ---------------------------------------------------------
  const classNames = ['Form 1', 'Form 2', 'Form 3']
  // Junior classes pay a bit less — showcases per-class fees.
  const classFees = [150000, 165000, 180000]
  await Promise.all(
    classNames.map((name, i) =>
      prisma.classLevel.create({ data: { schoolId, name, order: i + 1, maxScore: 20, feeAmount: classFees[i] } })
    )
  )

  // --- Subjects (per class) -------------------------------------------------
  const subjectTemplate = [
    { name: 'Mathematics', coefficient: 4 },
    { name: 'English Language', coefficient: 3 },
    { name: 'Physics', coefficient: 3 },
    { name: 'Biology', coefficient: 2 },
    { name: 'History', coefficient: 2 },
  ]
  const subjectsByClass: Record<string, { id: string; coefficient: number }[]> = {}
  for (const className of classNames) {
    subjectsByClass[className] = []
    for (const s of subjectTemplate) {
      const created = await prisma.subject.create({
        data: { schoolId, name: s.name, classLevel: className, maxScore: 20, coefficient: s.coefficient },
      })
      subjectsByClass[className].push({ id: created.id, coefficient: s.coefficient })
    }
  }

  // Assign the class master to a couple of Form 1 subjects so they can fill marks.
  await Promise.all(
    subjectsByClass['Form 1'].slice(0, 2).map(s =>
      prisma.teacherSubject.create({ data: { userId: classMaster.id, subjectId: s.id } })
    )
  )

  // --- Terms ----------------------------------------------------------------
  const session = '2025/2026'
  const firstTerm = await prisma.term.create({
    data: { schoolId, name: 'First Term', session, startDate: new Date('2025-09-08'), endDate: new Date('2025-12-19'), isCurrent: true },
  })
  await prisma.term.create({
    data: { schoolId, name: 'Second Term', session, startDate: new Date('2026-01-05'), endDate: new Date('2026-04-03'), isCurrent: false },
  })
  await prisma.term.create({
    data: { schoolId, name: 'Third Term', session, startDate: new Date('2026-04-20'), endDate: new Date('2026-07-10'), isCurrent: false },
  })

  // --- Students + report cards for the current term -------------------------
  const firstNames = ['Ngwa', 'Achu', 'Bih', 'Tabi', 'Manka', 'Eyong', 'Fri', 'Asong', 'Limnyuy', 'Nformi']
  const lastNames = ['Tanyi', 'Mbah', 'Atem', 'Nkeng', 'Ako', 'Ndip', 'Fon', 'Tita']

  // Each class gets a different report-card state to showcase the workflow:
  //   Form 1 → all marks filled, already PUBLISHED
  //   Form 2 → some subjects missing a sequence → "missing seqs" in readiness
  //   Form 3 → all marks filled, still DRAFT → ready to bulk-publish
  const classStates: Record<string, 'published' | 'missing' | 'ready'> = {
    'Form 1': 'published',
    'Form 2': 'missing',
    'Form 3': 'ready',
  }
  // Seed well under the demo cap (20) so recruiters have room to test "add student".
  const studentsPerClass: Record<string, number> = { 'Form 1': 6, 'Form 2': 4, 'Form 3': 4 }

  let studentCount = 0
  let cardCount = 0
  let seq = 1
  for (const className of classNames) {
    const state = classStates[className]
    const n = studentsPerClass[className]
    const subjects = subjectsByClass[className]

    for (let i = 0; i < n; i++) {
      const name = `${firstNames[(i + seq) % firstNames.length]} ${lastNames[(i + seq * 2) % lastNames.length]}`
      seq++
      const studentId = `2025-${String(++studentCount).padStart(4, '0')}`
      const student = await prisma.student.create({
        data: { schoolId, name, studentId, classLevel: className, guardianName: 'Guardian ' + name.split(' ')[0], guardianPhone: '+237 670 000 0' + String(i) },
      })

      // Build entries with deterministic-but-varied marks.
      const entries = subjects.map((sub, si) => {
        const base = 8 + ((i * 3 + si * 5 + seq) % 11) // 8..18 out of 20
        const seq1 = Math.min(20, base)
        let seq2: number | null = Math.min(20, base + ((i + si) % 4) - 1)

        // For the "missing" class, leave the last subject's 2nd sequence empty
        // for the first half of students → demonstrates incomplete readiness.
        if (state === 'missing' && si === subjects.length - 1 && i % 2 === 0) {
          seq2 = null
        }
        const score = seq2 !== null ? (seq1 + seq2) / 2 : null
        const pct = score !== null ? (score / 20) * 100 : null
        return {
          subjectId: sub.id,
          coefficient: sub.coefficient,
          seq1Score: seq1,
          seq2Score: seq2,
          score,
          grade: pct !== null ? calculateGrade(pct) : null,
          remarks: pct !== null ? autoRemark(pct) : null,
        }
      })

      // Weighted average over filled subjects only (matches the controller).
      let totalWeighted = 0
      let totalCoeff = 0
      for (const e of entries) {
        if (e.score == null) continue
        totalWeighted += e.score * e.coefficient
        totalCoeff += e.coefficient
      }
      const average = totalCoeff > 0 ? totalWeighted / totalCoeff : null

      const requiresRemarks = className === 'Form 1' // has a class master
      await prisma.reportCard.create({
        data: {
          studentId: student.id,
          schoolId,
          termId: firstTerm.id,
          createdById: admin.id,
          status: state === 'published' ? 'PUBLISHED' : 'DRAFT',
          totalScore: totalWeighted,
          average,
          remarks: requiresRemarks ? 'A hardworking pupil with good potential.' : null,
          entries: {
            create: entries.map(e => ({
              subjectId: e.subjectId,
              seq1Score: e.seq1Score,
              seq2Score: e.seq2Score,
              score: e.score,
              grade: e.grade,
              remarks: e.remarks,
            })),
          },
        },
      })
      cardCount++
    }

    // Positions within each class by average (desc).
    const cards = await prisma.reportCard.findMany({
      where: { schoolId, termId: firstTerm.id, student: { classLevel: className } },
      orderBy: [{ average: 'desc' }, { id: 'asc' }],
    })
    await Promise.all(cards.map((c, idx) => prisma.reportCard.update({ where: { id: c.id }, data: { position: idx + 1 } })))
  }

  return { schoolId, students: studentCount, reportCards: cardCount, logins: DEMO_LOGINS }
}

// Allow running directly: `ts-node src/scripts/seedDemo.ts` or `node dist/scripts/seedDemo.js`
if (require.main === module) {
  resetDemoSchool()
    .then(r => {
      console.log('Demo school reset:', JSON.stringify(r, null, 2))
    })
    .catch(err => {
      console.error('Demo reset failed:', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
