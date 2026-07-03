/**
 * Additive seed: gives the SECONDARY school (RAYGEN) a Technical and a Commercial
 * department alongside the existing Grammar one, each with its own classes,
 * subjects, students, report cards, and fees — mirroring the Grammar data.
 *
 * Non-default departments store class names with a " (Department)" suffix so the
 * same section can repeat across departments (Form 1 A vs Form 1 A (Technical)).
 * Re-runnable: it wipes only the Technical/Commercial data first.
 *
 *   npx ts-node src/scripts/seedSecondaryDepartments.ts
 */
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'

interface SubjectDef { name: string; coeff: number; optional?: boolean }
interface DeptDef { name: string; classes: string[]; subjects: SubjectDef[] }

// Base class names (sections). Each becomes its own class ("… A").
const CLASSES = ['Form 1 A', 'Form 2 A', 'Form 3 A', 'Form 4 A', 'Form 5 A', 'Lower Sixth A', 'Upper Sixth A']

const DEPARTMENTS: DeptDef[] = [
  {
    name: 'Technical',
    classes: CLASSES,
    subjects: [
      { name: 'Mathematics', coeff: 4 }, { name: 'English', coeff: 3 }, { name: 'French', coeff: 2 },
      { name: 'Physics', coeff: 3 }, { name: 'Engineering Science', coeff: 4 }, { name: 'Technical Drawing', coeff: 4 },
      { name: 'Workshop Practice', coeff: 3 }, { name: 'Electrical Engineering', coeff: 3 },
      { name: 'Computer Science', coeff: 2 }, { name: 'Citizenship', coeff: 1, optional: true },
    ],
  },
  {
    name: 'Commercial',
    classes: CLASSES,
    subjects: [
      { name: 'Mathematics', coeff: 3 }, { name: 'English', coeff: 3 }, { name: 'French', coeff: 2 },
      { name: 'Accounting', coeff: 4 }, { name: 'Commerce', coeff: 4 }, { name: 'Economics', coeff: 3 },
      { name: 'Office Practice', coeff: 3 }, { name: 'Business Management', coeff: 3 },
      { name: 'Commercial Law', coeff: 2 }, { name: 'Computer Science', coeff: 2, optional: true },
    ],
  },
]

const DEPT_FEE = 80000
const FIRST_M = ['Junior','Eric','Emmanuel','Cedric','Brandon','Yannick','Arnold','Franck','Bertrand','Steve','Landry','Roland','Boris','Patrick','Serge','Wilfried','Achille','Donald','Marvin','Kevin','Bruno','Joel','Samuel','Nathan','Daniel','Brian','Christian','Valery','Rodrigue','Pascal']
const FIRST_F = ['Alice','Brenda','Carine','Diane','Edith','Flore','Grace','Ivanna','Joelle','Karelle','Larissa','Mireille','Odette','Rachelle','Sandrine','Tatiana','Vanessa','Yolande','Audrey','Belinda','Clarisse','Doris','Estelle','Francine','Henriette','Josiane','Linda','Naomi','Sylvie','Christelle']
const LAST = ['Nkeng','Tabi','Fokou','Mbarga','Etoa','Njoya','Achu','Eyong','Mbah','Ndip','Atangana','Owona','Ngwa','Tamfu','Mukete','Kamga','Fotso','Talla','Onana','Njie','Ayuk','Tanyi','Besong','Agbor','Kum','Suh','Wirba','Che','Fru','Nfor']

const rnd = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(a: T[]): T => a[rnd(a.length)]
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const half = (v: number) => Math.round(v * 2) / 2
const round5k = (v: number) => Math.max(5000, Math.round(v / 5000) * 5000)
const gradeLetter = (s: number) => { const p = (s / 20) * 100; return p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : p >= 50 ? 'D' : p >= 40 ? 'E' : 'F' }
const bandRemark = (s: number) => s >= 16 ? 'Excellent' : s >= 14 ? 'Very Good' : s >= 12 ? 'Good' : s >= 10 ? 'Fairly Good' : s >= 8 ? 'Average' : 'Weak'
const genRemark = (a: number | null) => a == null ? null : a >= 16 ? 'An outstanding term — keep it up.' : a >= 14 ? 'Very good results; well done.' : a >= 12 ? 'A good performance.' : a >= 10 ? 'A fair term; be more consistent.' : a >= 8 ? 'Below average — more effort needed.' : 'A difficult term; sustained effort required.'
const composeName = (base: string, dept: string) => `${base} (${dept})`

async function chunked<T>(model: { createMany: (a: { data: T[] }) => Promise<unknown> }, rows: T[], size = 2000) {
  for (let i = 0; i < rows.length; i += size) await model.createMany({ data: rows.slice(i, i + size) })
}

async function main() {
  const school = await prisma.school.findFirst({ where: { type: 'SECONDARY' } })
  if (!school) throw new Error('No SECONDARY school found')
  const schoolId = school.id
  const admin = await prisma.user.findFirst({ where: { schoolId, role: 'SCHOOL_ADMIN' } }) ?? await prisma.user.findFirst({ where: { schoolId } })
  if (!admin) throw new Error('No admin user for createdById')
  const adminId = admin.id
  console.log(`Seeding departments into "${school.name}"`)

  const deptNames = DEPARTMENTS.map((d) => d.name)

  // ---- wipe only the Technical/Commercial data (re-runnable) ----
  const existingDepts = await prisma.department.findMany({ where: { schoolId, name: { in: deptNames } } })
  if (existingDepts.length) {
    const deptIds = existingDepts.map((d) => d.id)
    const cls = await prisma.classLevel.findMany({ where: { schoolId, departmentId: { in: deptIds } }, select: { name: true } })
    const names = cls.map((c) => c.name)
    const studs = await prisma.student.findMany({ where: { schoolId, classLevel: { in: names } }, select: { id: true } })
    const sIds = studs.map((s) => s.id)
    const subs = await prisma.subject.findMany({ where: { schoolId, classLevel: { in: names } }, select: { id: true } })
    await prisma.feePayment.deleteMany({ where: { studentId: { in: sIds } } })
    await prisma.reportEntry.deleteMany({ where: { reportCard: { studentId: { in: sIds } } } })
    await prisma.reportCard.deleteMany({ where: { studentId: { in: sIds } } })
    await prisma.teacherSubject.deleteMany({ where: { subjectId: { in: subs.map((s) => s.id) } } })
    await prisma.subject.deleteMany({ where: { schoolId, classLevel: { in: names } } })
    await prisma.student.deleteMany({ where: { id: { in: sIds } } })
    await prisma.classLevel.deleteMany({ where: { schoolId, departmentId: { in: deptIds } } })
    await prisma.user.deleteMany({ where: { schoolId, email: { endsWith: '@raygentech.cm' } } })
    await prisma.department.deleteMany({ where: { id: { in: deptIds } } })
    console.log('Wiped existing Technical/Commercial data.')
  }

  // Existing terms grouped by session (reuse — Grammar already created them).
  const terms = await prisma.term.findMany({ where: { schoolId }, orderBy: { startDate: 'asc' } })
  if (!terms.length) throw new Error('No terms found — run the Grammar seed first.')
  const feeWindow = (session: string): [number, number] => {
    const st = terms.filter((t) => t.session === session)
    return [Math.min(...st.map((t) => +t.startDate)), Math.max(...st.map((t) => +t.endDate))]
  }
  const sessions = [...new Set(terms.map((t) => t.session))]

  const classRows: any[] = []
  const subjectRows: any[] = []
  const subjectsOf: Record<string, { id: string; coeff: number; optional: boolean }[]> = {}
  let order = 100

  // ---- departments + classes + subjects ----
  for (const dept of DEPARTMENTS) {
    const deptId = randomUUID()
    await prisma.department.create({ data: { id: deptId, schoolId, name: dept.name, order: order++, isDefault: false } })
    for (const base of dept.classes) {
      const name = composeName(base, dept.name)
      classRows.push({ id: randomUUID(), schoolId, name, hasStream: false, order: order++, maxScore: 20, feeAmount: DEPT_FEE, departmentId: deptId })
      subjectsOf[name] = dept.subjects.map((s) => {
        const id = randomUUID()
        subjectRows.push({ id, schoolId, name: s.name, classLevel: name, maxScore: 20, coefficient: s.coeff, compulsory: !s.optional })
        return { id, coeff: s.coeff, optional: !!s.optional }
      })
    }
  }
  await chunked(prisma.classLevel, classRows)
  await chunked(prisma.subject, subjectRows)
  console.log(`Created ${DEPARTMENTS.length} departments, ${classRows.length} classes, ${subjectRows.length} subjects.`)

  // ---- students + report cards + entries + fees ----
  const studentRows: any[] = []
  const cardRows: any[] = []
  const entryRows: any[] = []
  const feeRows: any[] = []
  let counter = 0

  for (const session of sessions) {
    const sessTerms = terms.filter((t) => t.session === session)
    const isCurrentSession = sessTerms.some((t) => t.isCurrent)
    const [feeStart, feeEnd] = feeWindow(session)
    for (const name of classRows.map((c) => c.name)) {
      const subs = subjectsOf[name]
      const compulsory = subs.filter((s) => !s.optional)
      const optional = subs.filter((s) => s.optional)
      const n = 12 + rnd(8)
      const genders = [...Array(Math.round(n / 2)).fill('Female'), ...Array(n - Math.round(n / 2)).fill('Male')]
      const cardsByTerm: Record<string, { card: any; average: number }[]> = {}

      for (const gender of genders) {
        counter++
        const sid = randomUUID()
        studentRows.push({
          id: sid, schoolId, name: `${pick(gender === 'Male' ? FIRST_M : FIRST_F)} ${pick(LAST)}`,
          gender, studentId: `RIA-${session.slice(2, 4)}-D${String(counter).padStart(4, '0')}`,
          classLevel: name, isActive: isCurrentSession,
        })
        const ability = 5 + Math.random() * 10
        const studentSubjects = [...compulsory, ...optional.filter(() => Math.random() < 0.6)]

        for (const term of sessTerms) {
          const currentTerm = term.isCurrent
          if (currentTerm && Math.random() < 0.25) continue
          const cardId = randomUUID()
          let totalWeighted = 0, totalCoeff = 0, anyFilled = false
          for (const s of studentSubjects) {
            const filled = !currentTerm || Math.random() < 0.55
            let seq1: number | null = null, seq2: number | null = null, score: number | null = null, grade: string | null = null
            if (filled) {
              seq1 = clamp(half(ability + (Math.random() * 8 - 4)), 1, 20)
              seq2 = clamp(half(ability + (Math.random() * 8 - 4)), 1, 20)
              score = (seq1 + seq2) / 2
              grade = gradeLetter(score)
              totalWeighted += score * s.coeff; totalCoeff += s.coeff; anyFilled = true
            }
            entryRows.push({ id: randomUUID(), reportCardId: cardId, subjectId: s.id, seq1Score: seq1, seq2Score: seq2, score, grade, remarks: score != null ? bandRemark(score) : '' })
          }
          const average = totalCoeff > 0 ? totalWeighted / totalCoeff : null
          const card = {
            id: cardId, studentId: sid, schoolId, termId: term.id, createdById: adminId,
            status: currentTerm ? 'DRAFT' : 'PUBLISHED', totalScore: totalWeighted, average, position: null as number | null,
            remarks: currentTerm ? (anyFilled && Math.random() < 0.4 ? genRemark(average) : null) : genRemark(average),
          }
          cardRows.push(card)
          ;(cardsByTerm[term.id] ??= []).push({ card, average: average ?? -1 })
        }

        const full = !isCurrentSession || Math.random() < 0.72
        const target = full ? DEPT_FEE : Math.min(DEPT_FEE - 5000, round5k(DEPT_FEE * (0.55 + Math.random() * 0.4)))
        if (target > 0) {
          const parts = target <= 5000 ? 1 : [1, 2, 2][rnd(3)]
          let remaining = target
          for (let i = 0; i < parts; i++) {
            const amt = i === parts - 1 ? remaining : Math.min(remaining - 5000, round5k(target / parts))
            const paidOn = new Date(feeStart + ((i + 0.5) / parts) * (feeEnd - feeStart))
            feeRows.push({ id: randomUUID(), schoolId, studentId: sid, session, amount: amt, paidOn, note: 'Fee installment', recordedBy: null })
            remaining -= amt
          }
        }
      }

      for (const termId of Object.keys(cardsByTerm)) {
        const ranked = cardsByTerm[termId].filter((x) => x.average >= 0).sort((a, b) => b.average - a.average)
        let pos = 0, prev = Number.NaN
        ranked.forEach((x, idx) => { if (x.average !== prev) pos = idx + 1; prev = x.average; x.card.position = pos })
      }
    }
  }

  console.log(`Inserting ${studentRows.length} students, ${cardRows.length} report cards, ${entryRows.length} entries, ${feeRows.length} fees…`)
  await chunked(prisma.student, studentRows)
  await chunked(prisma.reportCard, cardRows)
  await chunked(prisma.reportEntry, entryRows, 5000)
  await chunked(prisma.feePayment, feeRows)

  // ---- teachers ----
  // A few teachers owned by the new departments…
  const pwHash = await bcrypt.hash('teacher1234', 10)
  const deptTeacherRows: any[] = []
  const teacherSubjectRows: any[] = []
  const TEACHER_PLAN = [
    { subjects: ['Engineering Science', 'Technical Drawing'], dept: 'Technical' },
    { subjects: ['Workshop Practice', 'Electrical Engineering'], dept: 'Technical' },
    { subjects: ['Accounting', 'Commerce'], dept: 'Commercial' },
    { subjects: ['Economics', 'Business Management'], dept: 'Commercial' },
  ]
  let ti = 0
  for (const plan of TEACHER_PLAN) {
    ti++
    const male = Math.random() < 0.5
    const first = pick(male ? FIRST_M : FIRST_F), last = pick(LAST)
    const uid = randomUUID()
    deptTeacherRows.push({ id: uid, schoolId, name: `${male ? 'Mr.' : 'Mrs.'} ${first} ${last}`,
      email: `${first}.${last}.${ti}@raygentech.cm`.toLowerCase(), password: pwHash, role: 'CLASS_TEACHER', masterClassLevel: null })
    for (const s of subjectRows) {
      if (plan.subjects.includes(s.name) && s.classLevel.includes(`(${plan.dept})`)) {
        teacherSubjectRows.push({ id: randomUUID(), userId: uid, subjectId: s.id })
      }
    }
  }
  await chunked(prisma.user, deptTeacherRows)

  // …and some EXISTING Grammar teachers also teach across departments.
  const sharedNames = ['Mathematics', 'English', 'French', 'Computer Science']
  for (const subjName of sharedNames) {
    const grammarTeacher = await prisma.user.findFirst({
      where: { schoolId, role: { in: ['CLASS_TEACHER', 'CLASS_MASTER'] }, teacherSubjects: { some: { subject: { name: subjName } } } },
      select: { id: true },
    })
    if (!grammarTeacher) continue
    for (const s of subjectRows.filter((r) => r.name === subjName)) {
      teacherSubjectRows.push({ id: randomUUID(), userId: grammarTeacher.id, subjectId: s.id })
    }
  }
  await chunked(prisma.teacherSubject, teacherSubjectRows)
  console.log(`Created ${deptTeacherRows.length} department teachers + cross-department assignments (${teacherSubjectRows.length} links).`)
  console.log('Done.')
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
