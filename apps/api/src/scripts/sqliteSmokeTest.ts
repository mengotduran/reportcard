// Quick correctness check for the SQLite offline schema/client — not a
// permanent automated test, just a fast way to re-verify after schema
// changes. Run with: npx ts-node src/scripts/sqliteSmokeTest.ts
import prisma from '../config/prisma.sqlite'

async function main() {
  await prisma.school.deleteMany({ where: { subdomain: 'sqlite-smoke-test' } })

  const school = await prisma.school.create({
    data: {
      name: 'Smoke Test School',
      type: 'SECONDARY',
      email: 'smoke-test@example.com',
      subdomain: 'sqlite-smoke-test',
      coverImages: ['/uploads/a.png', '/uploads/b.png'],
    },
  })
  console.log('created school:', school.id, 'coverImages:', school.coverImages, typeof school.coverImages)

  const updated = await prisma.school.update({
    where: { id: school.id },
    data: { coverImages: [...(school.coverImages as string[]), '/uploads/c.png'] },
  })
  console.log('after push, coverImages:', updated.coverImages)

  const user = await prisma.user.create({
    data: { name: 'Smoke Admin', email: 'smoke-admin@example.com', password: 'x', role: 'SCHOOL_ADMIN', schoolId: school.id },
  })

  const term = await prisma.term.create({
    data: { schoolId: school.id, name: 'First Term', session: '2026/2027', startDate: new Date(), endDate: new Date(), isCurrent: true },
  })

  const student = await prisma.student.create({
    data: { schoolId: school.id, name: 'Smoke Student', studentId: '2026-0001', classLevel: 'Form 1' },
  })

  const reportCard = await prisma.reportCard.create({
    data: { studentId: student.id, schoolId: school.id, termId: term.id, createdById: user.id },
  })
  console.log('report card score (should be null, not a constraint error):', reportCard.totalScore)

  const subject = await prisma.subject.create({
    data: { schoolId: school.id, name: 'Maths', classLevel: 'Form 1' },
  })
  const entry = await prisma.reportEntry.create({
    data: { reportCardId: reportCard.id, subjectId: subject.id, score: null },
  })
  console.log('entry with null score created fine:', entry.id, entry.score)

  const gradingScale = await prisma.gradingScale.create({
    data: { schoolId: school.id, ranges: [{ minScore: 16, maxScore: 20, grade: 'A' }] },
  })
  console.log('gradingScale ranges (json):', gradingScale.ranges)

  console.log('\nALL SQLITE SMOKE CHECKS PASSED')
}

main()
  .catch((e) => {
    console.error('SMOKE TEST FAILED:', e)
    process.exit(1)
  })
  .finally(() => process.exit(0))
