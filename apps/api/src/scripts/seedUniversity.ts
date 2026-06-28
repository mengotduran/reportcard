/**
 * Seeds a realistic UNIVERSITY school: "CITEC Higher Institute".
 *  - Departments × HND Level 1 / Level 2 + a 1-year Degree program, as classes.
 *  - Courses (with credit hours) per department & level (I → L1, II → L2).
 *  - Academic years × First/Second Semester. Marks /100 (CA /30 + Exam /70).
 *  - Students per department/level with marks; HND 650k/2yr, Degree 600k/1yr fees.
 * Re-run to reset (wipes & rebuilds the CITEC school only).
 */
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'

const SUBDOMAIN    = 'citec-university'
const ADMIN_EMAIL  = 'admin@citec.cm'
const ADMIN_PASSWORD = 'citec1234'
const SCHOOL_ACRONYM = 'CITECHITM'
const SCHOOL_BATCH   = 16

interface Course { name: string; credit: number }
// Credit hours by course type when not given explicitly (heuristic, /4.0 GPA).
const creditFor = (name: string): number => {
  const n = name.toLowerCase()
  if (/research project|internship|case study|practice of pc/.test(n)) return 6
  if (/mathematics|programming|electronics|machines|analysis/.test(n)) return 4
  if (/english|french|digital literacy|entrepreneur|law and citizenship|hygiene|family planning/.test(n)) return 2
  return 3
}
const c = (name: string, credit?: number): Course => ({ name, credit: credit ?? creditFor(name) })

interface Dept { name: string; l1: Course[]; l2: Course[]; degree?: Course[] }

// Course lists per department. Courses suffixed I → Level 1, II → Level 2.
const DEPTS: Dept[] = [
  { name: 'Hardware Maintenance',
    l1: [c('English', 2), c('Algorithm', 2), c('General Accounting', 2), c('Analog Electronics', 2), c('Circuit Theory', 2), c('Computer Architecture', 2), c('Concept of Maintenance Methodology Practicals', 2), c('Concept of Maintenance Methodology', 2), c('Linear Algebra', 2), c('Computer Network', 2), c('Analysis', 2)],
    l2: [c('Case Study (Hardware Maintenance)', 14), c('Circuit Theory', 4), c('Computer Architecture', 6), c('Digital Literacy', 1), c('Electronics', 6), c('English', 2), c('Enterprise Creation and Entrepreneurship', 1), c('French', 2), c('Law and Citizenship', 2), c('Machines & Power Electronics', 4), c('Maths for Engineering', 4), c('Practice of PC (Hardware Maintenance)', 8), c('Programming', 6)] },
  { name: 'Software Engineering',
    l1: [c('Operating System I'), c('English I'), c('Information System I'), c('Database and Merise I'), c('Basic Environment I'), c('Engineering Mathematics I'), c('Programming I'), c('French I')],
    l2: [c('Operating System II'), c('English II'), c('Information System II'), c('Database and Merise II'), c('Maintenance and Legal Regulations'), c('Basic Environment II'), c('Engineering Mathematics II'), c('Programming II'), c('French II')] },
  { name: 'Accountancy',
    l1: [c('Costs and Management Accounting I'), c('English I'), c('General Accounting I'), c('Introduction to Financial Accounting'), c('Accounting to the Computer I'), c('Quantitative Techniques of Management I'), c('Computer Science I'), c('Methodology and Taxation I')],
    l2: [c('Costs and Management Accounting II'), c('English II'), c('General Accounting II'), c('Accounting to the Computer II'), c('Quantitative Techniques of Management II'), c('Computer Science II'), c('Methodology and Taxation II')] },
  { name: 'Civil Engineering',
    l1: [c('Computer Aided Design'), c('English I'), c('Engineering Mathematics I'), c('Computer Science I'), c('French I'), c('Design Structure Elements')],
    l2: [c('English II'), c('Hydrology and Hydrogeology'), c('Construction Technology'), c('Engineering Mathematics II'), c('Computer Science II'), c('French II')] },
  { name: 'Transport and Logistics',
    l1: [c('English I', 2), c('French I', 2), c('Logistics Management I', 4), c('Transport Economics I', 3), c('Supply Chain Management I', 4), c('Computer Science I', 3)],
    l2: [c('English II', 2), c('French II', 2), c('Logistics Management II', 4), c('Transport Economics II', 3), c('Supply Chain Management II', 4), c('Computer Science II', 3)] },
  { name: 'Nursing',
    l1: [c('Clinical Haematology I'), c('Public Health I'), c('Clinical Pharmacy I'), c('Medical Pathology I', 4), c('Family Planning'), c('Health Economics')],
    l2: [c('Clinical Haematology II'), c('Public Health II'), c('Clinical Pharmacy II'), c('Medical Pathology II', 4), c('Paediatrics/Neonatology Pathology'), c('OB/GYN Pathologies'), c('Analgesic in Obstetrics'), c('PTME AID/IST'), c('Emergencies Operative Block Anaesthesiology'), c('Communication for Behaviour Change'), c('Technique of Medical Lab Analysis'), c('Epidemiology & Prophylaxis Vaccination')] },
  { name: 'MLS',
    l1: [c('Clinical Bacteriology I'), c('Clinical Haematology I'), c('Clinical Biochemistry I'), c('Clinical Parasitology I'), c('Public Health I'), c('Medical Pathology I', 4)],
    l2: [c('Clinical Bacteriology II'), c('Clinical Haematology II'), c('Clinical Biochemistry II'), c('Clinical Parasitology II'), c('Mycology Immunology/Serology'), c('Public Health II'), c('Economics of Health'), c('Epidemiology & Prophylaxis Vaccination'), c('Medical Pathology II', 4)] },
  { name: 'Midwifery',
    l1: [c('Clinical Haematology I'), c('Public Health I'), c('Medical Pathology I', 4), c('Family Planning'), c('Health Economics')],
    l2: [c('Clinical Haematology II'), c('Public Health II'), c('Medical Pathology II', 4), c('Paediatrics/Neonatology Pathology'), c('OB/GYN Pathologies'), c('Analgesic in Obstetrics'), c('PTME AID/IST'), c('Communication for Behaviour Change'), c('Technique of Medical Lab Analysis/Medical Imaging'), c('Epidemiology & Prophylaxis Vaccination')] },
  { name: 'MBS',
    l1: [c('Microbiology I'), c('Anatomy and Physiology I', 4), c('Foundation of Nursing Science I'), c('Functional English', 2), c('General Hygiene', 2), c('Applied Maths Biostatistics')],
    l2: [c('Microbiology II'), c('Anatomy and Physiology II', 4), c('Foundation of Nursing Science II'), c('Nursing Care and Medicine'), c('Public Health'), c('Infectious and Parasitic Disease')] },
]

// Degree program = the Level 2 course set + a final-year project, unless overridden.
function degreeCourses(d: Dept): Course[] {
  return d.degree ?? [...d.l2, c('Research Project', 6), c('Professional Internship', 4)]
}

const SESSIONS = [
  { session: '2024/2025', current: false, dates: [['2024-10-07', '2025-02-28'], ['2025-03-10', '2025-07-25']] },
  { session: '2025/2026', current: true,  dates: [['2025-10-06', '2026-02-27'], ['2026-03-09', '2026-07-24']] },
]
const SEMESTERS = ['First Semester', 'Second Semester']

// Real departments teach different courses each semester of a level — split
// each level's course list in half (first half → Semester 1, the rest →
// Semester 2) and tag each Subject with Subject.term so it actually only
// shows up in that one semester (see Subject.term comment in schema.prisma).
// There's no source data on which exact courses belong to which semester,
// so this is a deterministic, plausible split rather than real curriculum data.
const splitBySemester = (courses: Course[]): Record<string, Course[]> => {
  const mid = Math.ceil(courses.length / 2)
  return { [SEMESTERS[0]]: courses.slice(0, mid), [SEMESTERS[1]]: courses.slice(mid) }
}

const FIRST_M = ['Junior', 'Eric', 'Emmanuel', 'Cedric', 'Brandon', 'Yannick', 'Arnold', 'Franck', 'Bertrand', 'Steve', 'Landry', 'Hervé', 'Maxwell', 'Roland', 'Boris', 'Patrick', 'Serge', 'Wilfried', 'Achille', 'Donald', 'Marvin', 'Kevin', 'Bruno', 'Gildas', 'Joel', 'Samuel', 'Nathan', 'Brian', 'Christian', 'Aristide']
const FIRST_F = ['Alice', 'Brenda', 'Carine', 'Diane', 'Edith', 'Flore', 'Grace', 'Huguette', 'Joelle', 'Karelle', 'Larissa', 'Mireille', 'Odette', 'Prudence', 'Rachelle', 'Sandrine', 'Tatiana', 'Vanessa', 'Yolande', 'Audrey', 'Belinda', 'Clarisse', 'Doris', 'Estelle', 'Francine', 'Naomi', 'Sylvie', 'Christelle', 'Manka', 'Ngozi']
const LAST = ['Nkeng', 'Tabi', 'Fokou', 'Mbarga', 'Etoa', 'Njoya', 'Achu', 'Eyong', 'Mbah', 'Ndip', 'Atangana', 'Mengue', 'Owona', 'Ngwa', 'Asaah', 'Mukete', 'Ndongo', 'Kamga', 'Fotso', 'Talla', 'Bekolo', 'Onana', 'Njie', 'Ayuk', 'Tanyi', 'Besong', 'Agbor', 'Kum', 'Suh', 'Fru', 'Nfor', 'Che', 'Mola', 'Epie']

const rnd = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(a: T[]): T => a[rnd(a.length)]
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const half = (v: number) => Math.round(v * 2) / 2
const shuffle = <T,>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]] } return a }

// Derive a short department abbreviation from the department name.
// Single word → first 3 chars; multi-word → first letter of each significant word.
const STOP = new Set(['and', 'of', 'the', 'in', 'for', 'to'])
function deptAbbr(dept: string): string {
  const words = dept.trim().split(/\s+/).filter(w => !STOP.has(w.toLowerCase()))
  if (!words.length) return 'X'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  // If first word is longer than 5 chars, take its first 2 letters; else take 1.
  const take = (w: string) => (w.length > 5 ? w.slice(0, 2) : w[0]).toUpperCase()
  return words.map(take).join('')
}

// Extract program type, department name, and level suffix from a class level string.
function parseProgramAndDept(classLevel: string): { prog: string; dept: string; levelSuffix: string } {
  if (classLevel.startsWith('HND ')) {
    const m = classLevel.match(/ - Level (\d+)$/)
    const dept = classLevel.replace(/^HND /, '').replace(/ - Level \d+$/, '')
    return { prog: 'HND', dept, levelSuffix: m ? m[1] : '' }
  }
  if (classLevel.startsWith('Degree ')) {
    return { prog: 'DEGREE', dept: classLevel.replace(/^Degree /, ''), levelSuffix: '' }
  }
  return { prog: '', dept: classLevel, levelSuffix: '' }
}

// Build a university matricule: ACRONYM/YEAR/PROG/BATCH/DEPT+LEVEL/SEQ
// Level suffix appended to dept abbr keeps Level 1 and Level 2 IDs distinct.
function buildMatricule(acronym: string, batch: number, session: string, classLevel: string, seq: number): string {
  const year = session.slice(0, 4)
  const { prog, dept, levelSuffix } = parseProgramAndDept(classLevel)
  const abbr = deptAbbr(dept) + levelSuffix  // e.g. "SOEN1" for Level 1, "SOEN2" for Level 2
  const parts = [acronym, year, ...(prog ? [prog] : []), String(batch), abbr, String(seq)]
  return parts.join('/')
}

async function chunked<T>(model: { createMany: (a: { data: T[] }) => Promise<unknown> }, rows: T[], size = 2000) {
  for (let i = 0; i < rows.length; i += size) await model.createMany({ data: rows.slice(i, i + size) })
}

// Each (department × level) is a class.
interface ClassDef { name: string; fee: number; courses: Course[] }
function buildClasses(): ClassDef[] {
  const out: ClassDef[] = []
  for (const d of DEPTS) {
    out.push({ name: `HND ${d.name} - Level 1`, fee: 325000, courses: d.l1 })
    out.push({ name: `HND ${d.name} - Level 2`, fee: 325000, courses: d.l2 })
    out.push({ name: `Degree ${d.name}`, fee: 600000, courses: degreeCourses(d) })
  }
  return out
}

async function main() {
  // ---- school: wipe child data but KEEP the School + admin rows so their ids stay
  // stable across reseeds. Recreating them gives a new schoolId each run, which
  // breaks any active login (token carries a now-dead schoolId → FK errors). ----
  const existing = await prisma.school.findUnique({ where: { subdomain: SUBDOMAIN } })
  if (existing) {
    const schoolId = existing.id
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
    // remove lecturers/non-admins only; keep the SCHOOL_ADMIN so its login survives
    await prisma.user.deleteMany({ where: { schoolId, role: { not: 'SCHOOL_ADMIN' } } })
  }

  const school = await prisma.school.upsert({
    where: { subdomain: SUBDOMAIN },
    update: { name: 'CITEC Higher Institute', type: 'UNIVERSITY', language: 'EN', acronym: SCHOOL_ACRONYM, batch: SCHOOL_BATCH },
    create: { name: 'CITEC Higher Institute', type: 'UNIVERSITY', language: 'EN', email: ADMIN_EMAIL, phone: '+237 654 571 824', address: 'P.O. Box 8283, Yaoundé', subdomain: SUBDOMAIN, acronym: SCHOOL_ACRONYM, batch: SCHOOL_BATCH, coverImages: [] },
  })
  const schoolId = school.id
  const admin =
    (await prisma.user.findFirst({ where: { schoolId, role: 'SCHOOL_ADMIN' } })) ??
    (await prisma.user.create({
      data: { schoolId, name: 'CITEC Administrator', email: ADMIN_EMAIL, password: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'SCHOOL_ADMIN' },
    }))
  console.log(`School "${school.name}" ready (${schoolId}); admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)

  // ---- GPA grading scale (/100, with GP values per image-derived algorithm) ----
  const UNIV_SCALE_100 = [
    { id: 'u1', minScore: 80, maxScore: 100, grade: 'A',  remark: 'Excellent',   color: '#15803d', gradePoint: 4.0 },
    { id: 'u2', minScore: 70, maxScore: 79,  grade: 'B+', remark: 'Very Good',   color: '#2563eb', gradePoint: 3.5 },
    { id: 'u3', minScore: 60, maxScore: 69,  grade: 'B',  remark: 'Good',        color: '#3b82f6', gradePoint: 3.0 },
    { id: 'u4', minScore: 55, maxScore: 59,  grade: 'C+', remark: 'Fairly Good', color: '#0891b2', gradePoint: 2.5 },
    { id: 'u5', minScore: 50, maxScore: 54,  grade: 'C',  remark: 'Average',     color: '#ca8a04', gradePoint: 2.0 },
    { id: 'u6', minScore: 45, maxScore: 49,  grade: 'D',  remark: 'Poor',        color: '#ea580c', gradePoint: 1.0 },
    { id: 'u7', minScore: 0,  maxScore: 44,  grade: 'F',  remark: 'Fail',        color: '#dc2626', gradePoint: 0.0 },
  ]
  const gpForMark100 = (score: number) => {
    const sorted = [...UNIV_SCALE_100].sort((a, b) => b.minScore - a.minScore)
    return sorted.find((r) => score >= r.minScore && score <= r.maxScore) ?? sorted[sorted.length - 1]
  }
  await prisma.gradingScale.create({
    data: { schoolId, ranges: UNIV_SCALE_100 as any },
  })

  // ---- classes ----
  const classes = buildClasses()
  await chunked(prisma.classLevel, classes.map((cl, i) => ({
    id: randomUUID(), schoolId, name: cl.name, hasStream: false, order: i, maxScore: 100, feeAmount: cl.fee,
  })))

  // ---- courses (subjects), keep id map — split per semester (see splitBySemester) ----
  const subjectRows: any[] = []
  const coursesOf: Record<string, Record<string, { id: string; credit: number }[]>> = {}
  for (const cl of classes) {
    const bySemester = splitBySemester(cl.courses)
    coursesOf[cl.name] = {}
    for (const semesterName of SEMESTERS) {
      coursesOf[cl.name][semesterName] = bySemester[semesterName].map((co) => {
        const id = randomUUID()
        subjectRows.push({ id, schoolId, name: co.name, classLevel: cl.name, maxScore: 100, coefficient: co.credit, credit: co.credit, compulsory: true, term: semesterName })
        return { id, credit: co.credit }
      })
    }
  }
  await chunked(prisma.subject, subjectRows)
  console.log(`Created ${classes.length} programmes, ${subjectRows.length} courses.`)

  // ---- lecturers (one academic per ~4 courses, kept within a department) ----
  const TITLES = ['Dr.', 'Mr.', 'Mrs.', 'Prof.']
  const deptOf = (classLevel: string) =>
    classLevel.startsWith('Degree ')
      ? classLevel.slice('Degree '.length)
      : classLevel.replace(/^HND /, '').replace(/ - Level \d+$/, '')
  const lecturerPwHash = await bcrypt.hash('lecturer1234', 12)
  const lecturerRows: any[] = []
  const teacherSubjectRows: any[] = []
  const byDept: Record<string, any[]> = {}
  for (const s of subjectRows) (byDept[deptOf(s.classLevel)] ??= []).push(s)
  let lec = 0
  for (const dept of Object.keys(byDept)) {
    const subs = byDept[dept]
    const names = [...new Set(subs.map((s) => s.name as string))]
    for (let i = 0; i < names.length; i += 4) {
      const group = new Set(names.slice(i, i + 4))
      lec++
      const male = Math.random() < 0.6
      const first = pick(male ? FIRST_M : FIRST_F), last = pick(LAST)
      const uid = randomUUID()
      lecturerRows.push({
        id: uid, schoolId, name: `${pick(TITLES)} ${first} ${last}`,
        email: `${first}.${last}.${lec}@citec.cm`.toLowerCase(), password: lecturerPwHash,
        role: 'SUBJECT_TEACHER', masterClassLevel: null,
      })
      // The lecturer teaches every section (level/programme) of their grouped courses.
      for (const s of subs) if (group.has(s.name)) teacherSubjectRows.push({ id: randomUUID(), userId: uid, subjectId: s.id })
    }
  }
  await chunked(prisma.user, lecturerRows)
  await chunked(prisma.teacherSubject, teacherSubjectRows)
  console.log(`Created ${lecturerRows.length} lecturers, ${teacherSubjectRows.length} course assignments (login: <first>.<last>.<n>@citec.cm / lecturer1234).`)

  // ---- terms (semesters) ----
  const termsBySession: Record<string, { id: string; index: number }[]> = {}
  const termRows: any[] = []
  for (const sess of SESSIONS) {
    termsBySession[sess.session] = SEMESTERS.map((nm, i) => {
      const id = randomUUID()
      termRows.push({ id, schoolId, name: nm, session: sess.session, startDate: new Date(sess.dates[i][0]), endDate: new Date(sess.dates[i][1]), isCurrent: sess.current && i === 1 })
      return { id, index: i }
    })
  }
  await chunked(prisma.term, termRows)

  // ---- students + report cards + entries + fees ----
  const studentRows: any[] = []
  const cardRows: any[] = []
  const entryRows: any[] = []
  const feeRows: any[] = []
  let counter = 0
  // Per-class sequential counter so matricule seq numbers are scoped per programme.
  const seqByClass: Record<string, number> = {}

  for (const sess of SESSIONS) {
    const terms = termsBySession[sess.session]
    for (const cl of classes) {
      const coursesBySemester = coursesOf[cl.name]
      const size = 8 + rnd(9) // 8–16 students per programme
      const genders = shuffle([...Array(Math.round(size * 0.45)).fill('Female'), ...Array(size - Math.round(size * 0.45)).fill('Male')])
      const cardsByTerm: Record<string, { card: any; gpa: number }[]> = {}

      for (const gender of genders) {
        counter++
        seqByClass[cl.name] = (seqByClass[cl.name] ?? 0) + 1
        const sid = randomUUID()
        const matricule = buildMatricule(SCHOOL_ACRONYM, SCHOOL_BATCH, sess.session, cl.name, seqByClass[cl.name])
        studentRows.push({
          id: sid, schoolId, name: `${pick(gender === 'Male' ? FIRST_M : FIRST_F)} ${pick(LAST)}`,
          gender, studentId: matricule,
          classLevel: cl.name, isActive: sess.current,
        })
        const ability = 35 + Math.random() * 45 // 35–80 /100, keeps marks correlated

        for (const term of terms) {
          const currentTerm = sess.current && term.index === 1
          // Past/published semesters are fully marked. The live semester is fully
          // marked for most students; ~15% are left partially filled (in progress).
          const partialStudent = currentTerm && Math.random() < 0.15

          const cardId = randomUUID()
          const marked: { score100: number; credit: number }[] = []
          let anyFilled = false
          const courses = coursesBySemester[SEMESTERS[term.index]]
          for (const co of courses) {
            const filled = !partialStudent || Math.random() < 0.6
            let seq1: number | null = null, seq2: number | null = null
            let score: number | null = null, grade: string | null = null, remark = ''
            if (filled) {
              // CA (/30) + Exam (/70); total /100.
              const caMax = 30, examMax = 70
              seq1 = clamp(Math.round((ability / 100) * caMax + (Math.random() * 8 - 4)), 0, caMax)
              seq2 = clamp(Math.round((ability / 100) * examMax + (Math.random() * 14 - 7)), 0, examMax)
              score = seq1 + seq2
              const g = gpForMark100(score)
              grade = g.grade; remark = g.remark
              marked.push({ score100: score, credit: co.credit })
              anyFilled = true
            }
            entryRows.push({ id: randomUUID(), reportCardId: cardId, subjectId: co.id, seq1Score: seq1, seq2Score: seq2, score, grade, remarks: remark })
          }
          const gpa = marked.length > 0 ? marked.reduce((s, m) => s + gpForMark100(m.score100).gradePoint * m.credit, 0) / marked.reduce((s, m) => s + m.credit, 0) : 0
          const totalWeighted = marked.reduce((s, m) => s + gpForMark100(m.score100).gradePoint * m.credit, 0)
          const card = {
            id: cardId, studentId: sid, schoolId, termId: term.id, createdById: admin.id,
            status: currentTerm ? 'DRAFT' : 'PUBLISHED', totalScore: totalWeighted, average: gpa, position: null as number | null,
            remarks: null,
          }
          cardRows.push(card)
          ;(cardsByTerm[term.id] ??= []).push({ card, gpa: anyFilled ? gpa : -1 })
        }

        // Fees: HND charged per level/year (325k); Degree 600k. Pay 1–3 installments.
        if (sess.current || Math.random() < 1) {
          const due = cl.fee
          const full = !sess.current || Math.random() < 0.7
          const target = full ? due : Math.round(due * (0.5 + Math.random() * 0.4) / 5000) * 5000
          const n = 1 + rnd(3)
          let remaining = target
          const winStart = Date.parse(sess.dates[0][0]), winEnd = Date.parse(sess.dates[1][1])
          for (let i = 0; i < n; i++) {
            const amt = i === n - 1 ? remaining : Math.round(target / n / 5000) * 5000
            if (amt <= 0) break
            remaining -= amt
            feeRows.push({ id: randomUUID(), schoolId, studentId: sid, session: sess.session, amount: amt, paidOn: new Date(winStart + ((i + 0.5) / n) * (winEnd - winStart)), note: 'Tuition installment', recordedBy: null })
          }
        }
      }

      // Rank by GPA per semester.
      for (const termId of Object.keys(cardsByTerm)) {
        const ranked = cardsByTerm[termId].filter((x) => x.gpa >= 0).sort((a, b) => b.gpa - a.gpa)
        let pos = 0, prev = Number.NaN
        ranked.forEach((x, idx) => { if (x.gpa !== prev) pos = idx + 1; prev = x.gpa; x.card.position = pos })
      }
    }
  }

  console.log(`Inserting ${studentRows.length} students, ${cardRows.length} transcripts, ${entryRows.length} course marks, ${feeRows.length} payments…`)
  await chunked(prisma.student, studentRows)
  await chunked(prisma.reportCard, cardRows)
  await chunked(prisma.reportEntry, entryRows, 5000)
  await chunked(prisma.feePayment, feeRows)
  console.log('Done.')
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
