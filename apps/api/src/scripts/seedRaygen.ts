/**
 * Seeds realistic multi-year data into the existing "Raygen International
 * Academy — Secondary" school (created by the user; school/admin/grading
 * scale are kept as-is): Form 1 → Upper Sixth, two academic years
 * (2024/2025 and 2025/2026), 3 terms each, randomly-named students with
 * gender, marks (/20) with computed averages + class positions, and fee
 * payments against each class's fee amount.
 * Re-run to reset (wipes & rebuilds this school's classes/subjects/
 * teachers/terms/students/report cards/fees only).
 */
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'

const SUBDOMAIN = 'school secondary'

interface SubjectDef { name: string; coeff: number; optional?: boolean }
interface ClassDef { name: string; fee: number; girls: number; boys: number; subjects: SubjectDef[] }

const c = (name: string, coeff: number): SubjectDef => ({ name, coeff })
const o = (name: string, coeff: number): SubjectDef => ({ name, coeff, optional: true })

const CLASSES: ClassDef[] = [
  { name: 'Form 1', fee: 70000, girls: 22, boys: 18, subjects: [
    c('Chemistry',3),c('Biology',3),c('Physics',3),c('English',5),c('French',5),c('Mathematics',5),c('Citizenship',3),c('History',3),c('Geography',3),c('Religious Studies',2),c('Sports',1),c('Literature',3),c('Computer Science',3) ] },
  { name: 'Form 2', fee: 70000, girls: 20, boys: 16, subjects: [
    c('Chemistry',3),c('Biology',3),c('Physics',3),c('English',5),c('French',5),c('Mathematics',5),c('Citizenship',3),c('History',3),c('Geography',3),c('Religious Studies',2),c('Sports',1),c('Literature',3),c('Computer Science',3) ] },
  { name: 'Form 3', fee: 70000, girls: 18, boys: 16, subjects: [
    c('Chemistry',3),c('Biology',3),c('Physics',3),c('English',5),c('French',5),c('Mathematics',5),c('Citizenship',3),c('History',3),c('Geography',3),c('Religious Studies',2),c('Sports',1),c('Economics',3),c('Literature',3),c('Computer Science',3) ] },
  { name: 'Form 4 Science', fee: 80000, girls: 16, boys: 15, subjects: [
    c('Chemistry',3),c('Biology',3),c('Physics',3),c('English',5),c('French',5),c('Mathematics',5),c('Citizenship',3),c('Geography',3),c('Sports',1),c('Economics',3),o('Computer Science',3),o('Religious Studies',2) ] },
  { name: 'Form 4 Arts', fee: 80000, girls: 22, boys: 18, subjects: [
    c('English',5),c('French',5),c('Mathematics',5),c('Citizenship',3),c('History',3),c('Geography',3),c('Sports',1),c('Economics',3),o('Computer Science',3),o('Religious Studies',2),o('Literature',3) ] },
  { name: 'Form 5 Science', fee: 80000, girls: 15, boys: 14, subjects: [
    c('Chemistry',3),c('Biology',3),c('Physics',3),c('English',5),c('French',5),c('Mathematics',5),c('Citizenship',3),c('Geography',3),c('Economics',3),o('Computer Science',3),o('Religious Studies',2) ] },
  { name: 'Form 5 Arts', fee: 80000, girls: 15, boys: 14, subjects: [
    c('English',5),c('French',5),c('Mathematics',5),c('Citizenship',3),c('History',3),c('Geography',3),c('Economics',3),o('Computer Science',3),o('Religious Studies',2),o('Literature',3) ] },
  { name: 'Lower Sixth Science', fee: 95000, girls: 18, boys: 12, subjects: [
    c('Chemistry',5),c('Biology',5),c('Physics',5),c('Mathematics',5),c('Sports',1),o('Further Mathematics',5) ] },
  { name: 'Lower Sixth Arts', fee: 95000, girls: 14, boys: 12, subjects: [
    c('History',5),c('Geography',5),c('Literature',5),c('Economics',5),c('Sports',1),o('Mathematics',5) ] },
  { name: 'Upper Sixth Science', fee: 95000, girls: 16, boys: 11, subjects: [
    c('Chemistry',5),c('Biology',5),c('Physics',5),c('Mathematics',5),o('Further Mathematics',5) ] },
  { name: 'Upper Sixth Arts', fee: 95000, girls: 13, boys: 11, subjects: [
    c('History',5),c('Geography',5),c('Literature',5),c('Economics',5),o('Mathematics',5) ] },
]

const LOWER = ['Form 1', 'Form 2', 'Form 3']
const MID = ['Form 4 Science', 'Form 4 Arts', 'Form 5 Science', 'Form 5 Arts']
const SIXTH_SCI = ['Lower Sixth Science', 'Upper Sixth Science']
const SIXTH_ARTS = ['Lower Sixth Arts', 'Upper Sixth Arts']

interface TeacherDef { subjects: string[]; classes: string[]; master?: string }
const TEACHERS: TeacherDef[] = [
  { subjects: ['Mathematics', 'Physics'], classes: LOWER, master: 'Form 1' },
  { subjects: ['Mathematics', 'Physics'], classes: ['Form 4 Science', 'Form 5 Science'] },
  { subjects: ['Mathematics'], classes: ['Form 4 Arts', 'Form 5 Arts', ...SIXTH_ARTS] },
  { subjects: ['Mathematics', 'Physics'], classes: SIXTH_SCI },
  { subjects: ['Further Mathematics'], classes: ['Lower Sixth Science', 'Upper Sixth Science'] },
  { subjects: ['Chemistry', 'Biology'], classes: LOWER, master: 'Form 2' },
  { subjects: ['Chemistry', 'Biology'], classes: ['Form 4 Science', 'Form 5 Science'], master: 'Form 4 Science' },
  { subjects: ['Chemistry', 'Biology'], classes: SIXTH_SCI },
  { subjects: ['English'], classes: LOWER, master: 'Form 3' },
  { subjects: ['English'], classes: MID },
  { subjects: ['French'], classes: [...LOWER, ...SIXTH_ARTS] },
  { subjects: ['French'], classes: MID },
  { subjects: ['History', 'Geography'], classes: LOWER },
  { subjects: ['History'], classes: ['Form 4 Arts', 'Form 5 Arts', ...SIXTH_ARTS], master: 'Form 4 Arts' },
  { subjects: ['Geography'], classes: ['Form 4 Science', 'Form 4 Arts', 'Form 5 Science', 'Form 5 Arts', ...SIXTH_ARTS] },
  { subjects: ['Economics'], classes: ['Form 3', ...MID, ...SIXTH_ARTS] },
  { subjects: ['Literature'], classes: [...LOWER, 'Form 4 Arts', 'Form 5 Arts', ...SIXTH_ARTS] },
  { subjects: ['Computer Science'], classes: [...LOWER, ...MID] },
  { subjects: ['Religious Studies'], classes: [...LOWER, ...MID] },
  { subjects: ['Citizenship'], classes: [...LOWER, ...MID] },
  { subjects: ['Sports'], classes: [...LOWER, ...MID, ...SIXTH_SCI] },
]

const SESSIONS = [
  { session: '2024/2025', current: false, dates: [['2024-09-09','2024-12-20'],['2025-01-06','2025-04-04'],['2025-04-21','2025-07-11']] },
  { session: '2025/2026', current: true,  dates: [['2025-09-08','2025-12-19'],['2026-01-05','2026-04-03'],['2026-04-20','2026-07-10']] },
]
const TERM_NAMES = ['First Term', 'Second Term', 'Third Term']

const FIRST_M = ['Junior','Eric','Emmanuel','Cedric','Brandon','Yannick','Arnold','Franck','Bertrand','Steve','Landry','Hervé','Maxwell','Roland','Boris','Patrick','Serge','Wilfried','Ngu','Tabi','Achille','Donald','Marvin','Kevin','Bruno','Gildas','Hilary','Joel','Samuel','Nathan','Daniel','Brian','Etienne','Christian','Valery','Aristide','Rodrigue','Ghislain','Loïc','Pascal']
const FIRST_F = ['Alice','Brenda','Carine','Diane','Edith','Flore','Grace','Huguette','Ivanna','Joelle','Karelle','Larissa','Mireille','Nadège','Odette','Prudence','Rachelle','Sandrine','Tatiana','Vanessa','Yolande','Zara','Bih','Manka','Ngozi','Audrey','Belinda','Clarisse','Doris','Estelle','Francine','Glwadys','Henriette','Irène','Josiane','Linda','Murielle','Naomi','Sylvie','Christelle']
const LAST = ['Nkeng','Tabi','Fokou','Mbarga','Etoa','Njoya','Achu','Tchatchoua','Eyong','Mbah','Ndip','Fonkou','Atangana','Mengue','Owona','Biya','Ngwa','Tamfu','Asaah','Mukete','Ndongo','Kamga','Fotso','Sop','Talla','Bekolo','Onana','Ekane','Mboma','Njie','Ayuk','Tanyi','Besong','Agbor','Mola','Kum','Anjeh','Suh','Forba','Wirba','Ndi','Che','Fru','Nfor','Tum','Akwen','Manyi','Epie','Ngu','Bama']

const rnd = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(a: T[]): T => a[rnd(a.length)]
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const shuffle = <T,>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const half = (v: number) => Math.round(v * 2) / 2
const round5k = (v: number) => Math.max(5000, Math.round(v / 5000) * 5000)

function gradeLetter(score20: number): string {
  const p = (score20 / 20) * 100
  if (p >= 80) return 'A'; if (p >= 70) return 'B'; if (p >= 60) return 'C'
  if (p >= 50) return 'D'; if (p >= 40) return 'E'; return 'F'
}
function bandRemark(s: number): string {
  if (s >= 16) return 'Excellent'; if (s >= 14) return 'Very Good'; if (s >= 12) return 'Good'
  if (s >= 10) return 'Fairly Good'; if (s >= 8) return 'Average'; return 'Weak'
}
function genRemark(avg: number | null): string | null {
  if (avg == null) return null
  if (avg >= 16) return 'An outstanding term — keep up the excellent work.'
  if (avg >= 14) return 'Very good results this term; well done.'
  if (avg >= 12) return 'A good performance; aim even higher next term.'
  if (avg >= 10) return 'A fair term; more consistency will lift these results.'
  if (avg >= 8) return 'Below the class average — more effort is needed.'
  return 'A difficult term; serious, sustained effort is required.'
}

/** Split a target amount into 1–3 dated installments across the school year. */
function installments(total: number, startMs: number, endMs: number): { amount: number; paidOn: Date }[] {
  if (total <= 0) return []
  const n = total <= 5000 ? 1 : [1, 2, 2, 3][rnd(4)]
  const dateAt = (i: number) => new Date(startMs + ((i + 0.5) / n) * (endMs - startMs) + rnd(20) * 86400000)
  if (n === 1) return [{ amount: total, paidOn: dateAt(0) }]
  const out: { amount: number; paidOn: Date }[] = []
  let remaining = total
  for (let i = 0; i < n - 1; i++) {
    const part = Math.min(remaining - 5000, round5k(total / n))
    out.push({ amount: part, paidOn: dateAt(i) })
    remaining -= part
  }
  out.push({ amount: remaining, paidOn: dateAt(n - 1) })
  return out.filter((p) => p.amount > 0)
}

async function chunked<T>(model: { createMany: (a: { data: T[] }) => Promise<unknown> }, rows: T[], size = 2000) {
  for (let i = 0; i < rows.length; i += size) await model.createMany({ data: rows.slice(i, i + size) })
}

const FEE_WINDOWS: Record<string, [number, number]> = {
  '2024/2025': [Date.parse('2024-09-15'), Date.parse('2025-06-15')],
  '2025/2026': [Date.parse('2025-09-15'), Date.parse('2026-06-20')],
}

async function main() {
  const school = await prisma.school.findFirst({ where: { subdomain: SUBDOMAIN } })
  if (!school) throw new Error(`Target school (subdomain "${SUBDOMAIN}") not found`)
  const schoolId = school.id
  const admin = await prisma.user.findFirst({ where: { schoolId, role: 'SCHOOL_ADMIN' } }) ?? await prisma.user.findFirst({ where: { schoolId } })
  if (!admin) throw new Error('No user for createdById on this school')
  const adminId = admin.id
  console.log(`Seeding into "${school.name}" (${schoolId})`)

  // ---- wipe (FK-safe) — classes/subjects/students/terms/teachers only; keep
  // School + admin + the school's existing GradingScale untouched. ----
  await prisma.feePayment.deleteMany({ where: { schoolId } })
  await prisma.reportEntry.deleteMany({ where: { reportCard: { schoolId } } })
  await prisma.reportCard.deleteMany({ where: { schoolId } })
  await prisma.teacherSubject.deleteMany({ where: { subject: { schoolId } } })
  await prisma.subject.deleteMany({ where: { schoolId } })
  await prisma.student.deleteMany({ where: { schoolId } })
  await prisma.term.deleteMany({ where: { schoolId } })
  await prisma.classLevel.deleteMany({ where: { schoolId } })
  await prisma.user.deleteMany({ where: { schoolId, role: { in: ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL'] } } })
  console.log('Wiped existing classes/subjects/students/terms/teachers/fees.')

  // ---- classes ----
  await chunked(prisma.classLevel, CLASSES.map((cl, i) => ({
    id: randomUUID(), schoolId, name: cl.name, hasStream: false, order: i, maxScore: 20, feeAmount: cl.fee,
  })))

  // ---- subjects (keep id map) ----
  const subjectRows: { id: string; schoolId: string; name: string; classLevel: string; maxScore: number; coefficient: number; compulsory: boolean }[] = []
  const subjectsOf: Record<string, { id: string; coeff: number; optional: boolean }[]> = {}
  for (const cl of CLASSES) {
    subjectsOf[cl.name] = cl.subjects.map((s) => {
      const id = randomUUID()
      subjectRows.push({ id, schoolId, name: s.name, classLevel: cl.name, maxScore: 20, coefficient: s.coeff, compulsory: !s.optional })
      return { id, coeff: s.coeff, optional: !!s.optional }
    })
  }
  await chunked(prisma.subject, subjectRows)
  console.log(`Created ${CLASSES.length} classes, ${subjectRows.length} subjects.`)

  // ---- teachers + their subject assignments ----
  const pwHash = await bcrypt.hash('teacher1234', 10)
  const teacherRows: { id: string; schoolId: string; name: string; email: string; password: string; role: 'CLASS_TEACHER' | 'CLASS_MASTER'; masterClassLevel: string | null }[] = []
  const teacherSubjectRows: { id: string; userId: string; subjectId: string }[] = []
  let tIdx = 0
  for (const def of TEACHERS) {
    tIdx++
    const male = Math.random() < 0.5
    const first = pick(male ? FIRST_M : FIRST_F), last = pick(LAST)
    const uid = randomUUID()
    teacherRows.push({
      id: uid, schoolId, name: `${male ? 'Mr.' : 'Mrs.'} ${first} ${last}`,
      email: `${first}.${last}.${tIdx}@raygen.cm`.toLowerCase(), password: pwHash,
      role: def.master ? 'CLASS_MASTER' : 'CLASS_TEACHER', masterClassLevel: def.master ?? null,
    })
    for (const s of subjectRows) {
      if (def.subjects.includes(s.name) && def.classes.includes(s.classLevel)) {
        teacherSubjectRows.push({ id: randomUUID(), userId: uid, subjectId: s.id })
      }
    }
  }
  await chunked(prisma.user, teacherRows)
  await chunked(prisma.teacherSubject, teacherSubjectRows)
  console.log(`Created ${teacherRows.length} teachers, ${teacherSubjectRows.length} subject assignments (login: <first>.<last>.<n>@raygen.cm / teacher1234).`)

  // ---- terms ----
  const termsBySession: Record<string, { id: string; index: number }[]> = {}
  const termRows: { id: string; schoolId: string; name: string; session: string; startDate: Date; endDate: Date; isCurrent: boolean }[] = []
  for (const sess of SESSIONS) {
    termsBySession[sess.session] = TERM_NAMES.map((tn, ti) => {
      const id = randomUUID()
      termRows.push({ id, schoolId, name: tn, session: sess.session, startDate: new Date(sess.dates[ti][0]), endDate: new Date(sess.dates[ti][1]), isCurrent: sess.current && ti === 2 })
      return { id, index: ti }
    })
  }
  await chunked(prisma.term, termRows)

  // ---- students + report cards + entries + fees ----
  const studentRows: any[] = []
  const cardRows: any[] = []
  const entryRows: any[] = []
  const feeRows: any[] = []
  let counter = 0

  for (const sess of SESSIONS) {
    const terms = termsBySession[sess.session]
    const [feeStart, feeEnd] = FEE_WINDOWS[sess.session]
    for (const cl of CLASSES) {
      const subs = subjectsOf[cl.name]
      const compulsory = subs.filter((s) => !s.optional)
      const optional = subs.filter((s) => s.optional)
      const girls = sess.current ? Math.max(4, cl.girls + rnd(9) - 2) : cl.girls
      const boys = sess.current ? Math.max(3, cl.boys + rnd(7) - 2) : cl.boys
      const genders = shuffle([...Array(girls).fill('Female'), ...Array(boys).fill('Male')])
      const cardsByTerm: Record<string, { card: any; average: number }[]> = {}

      for (const gender of genders) {
        counter++
        const sid = randomUUID()
        studentRows.push({
          id: sid, schoolId, name: `${pick(gender === 'Male' ? FIRST_M : FIRST_F)} ${pick(LAST)}`,
          gender, studentId: `RIA-${sess.session.slice(2, 4)}-${String(counter).padStart(4, '0')}`,
          classLevel: cl.name, isActive: sess.current,
        })
        const ability = 5 + Math.random() * 10
        const studentSubjects = [...compulsory, ...optional.filter(() => Math.random() < 0.65)]

        for (const term of terms) {
          const currentTerm = sess.current && term.index === 2
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

        // Fees against the class's fee amount, scoped to this academic session.
        const due = cl.fee
        const full = !sess.current || Math.random() < 0.72
        const target = full ? due : Math.min(due - 5000, round5k(due * (0.55 + Math.random() * 0.4)))
        for (const inst of installments(target, feeStart, feeEnd)) {
          feeRows.push({ id: randomUUID(), schoolId, studentId: sid, session: sess.session, amount: inst.amount, paidOn: inst.paidOn, note: 'Fee installment', recordedBy: null })
        }
      }

      for (const termId of Object.keys(cardsByTerm)) {
        const ranked = cardsByTerm[termId].filter((x) => x.average >= 0).sort((a, b) => b.average - a.average)
        let pos = 0, prev = Number.NaN
        ranked.forEach((x, idx) => { if (x.average !== prev) pos = idx + 1; prev = x.average; x.card.position = pos })
      }
    }
  }

  console.log(`Inserting ${studentRows.length} students, ${cardRows.length} report cards, ${entryRows.length} entries, ${feeRows.length} fee payments…`)
  await chunked(prisma.student, studentRows)
  await chunked(prisma.reportCard, cardRows)
  await chunked(prisma.reportEntry, entryRows, 5000)
  await chunked(prisma.feePayment, feeRows)
  console.log('Done.')
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
