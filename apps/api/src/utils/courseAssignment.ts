import prisma from '../config/prisma'

/**
 * Moving a course from one teacher to another.
 *
 * A course belongs to ONE teacher at a time: handing it to somebody else takes it off
 * whoever held it. That was already true of the Teachers page; it is now also true of the
 * timetable builder — but there, only for UNIVERSITIES (see saveTimetable), because a
 * university course for a given class has a single lecturer, while primary/secondary
 * follow their own flow.
 *
 * Three things have to happen together, or the data contradicts itself:
 *   1. the previous teacher's assignment is removed,
 *   2. their timetable slots for that course go with it — a slot is a statement that they
 *      teach it, so leaving it behind would keep counting taught hours for a course they
 *      no longer have. Slots are ARCHIVED, not deleted, so timetable history survives and
 *      (crucially) so do any TeacherAbsence rows already recorded against them, which a
 *      hard delete would cascade away.
 *   3. they are told, by name, who has it now — otherwise a lecturer's timetable simply
 *      changes underneath them with no explanation.
 */
export async function takeCoursesFromOtherTeachers(params: {
  schoolId: string
  subjectIds: string[]
  newTeacherId: string
}): Promise<string[]> {
  const { schoolId, subjectIds, newTeacherId } = params
  if (subjectIds.length === 0) return []

  const existing = await prisma.teacherSubject.findMany({
    where: { subjectId: { in: subjectIds }, userId: { not: newTeacherId } },
    include: { user: { select: { id: true, name: true } }, subject: { select: { id: true, name: true, classLevel: true } } },
  })
  if (existing.length === 0) return []

  const newTeacher = await prisma.user.findUnique({ where: { id: newTeacherId }, select: { name: true } })
  const newTeacherName = newTeacher?.name ?? 'another teacher'

  // One entry per previous teacher, so somebody losing three courses gets one clear
  // message rather than three separate ones.
  const byTeacher = new Map<string, { name: string; courses: string[]; subjectIds: string[] }>()
  for (const row of existing) {
    const cur = byTeacher.get(row.userId) ?? { name: row.user.name, courses: [], subjectIds: [] }
    cur.courses.push(`${row.subject.name} (${row.subject.classLevel})`)
    cur.subjectIds.push(row.subject.id)
    byTeacher.set(row.userId, cur)
  }

  const archivedAt = new Date()
  const summaries: string[] = []

  for (const [previousTeacherId, info] of byTeacher) {
    const courseList = info.courses.join(', ')
    await prisma.$transaction([
      prisma.teacherSubject.deleteMany({
        where: { userId: previousTeacherId, subjectId: { in: info.subjectIds } },
      }),
      prisma.timetableSlot.updateMany({
        where: { schoolId, teacherId: previousTeacherId, subjectId: { in: info.subjectIds }, archivedAt: null },
        data: { archivedAt },
      }),
      prisma.notification.create({
        data: {
          schoolId,
          recipientId: previousTeacherId,
          type: 'COURSE_REASSIGNED',
          title: 'A course was reassigned',
          body: `${courseList} ${info.courses.length === 1 ? 'has' : 'have'} been reassigned to ${newTeacherName}. ${info.courses.length === 1 ? 'It is' : 'They are'} no longer on your courses, and any timetable periods you had for ${info.courses.length === 1 ? 'it' : 'them'} have been removed.`,
        },
      }),
    ])
    summaries.push(`"${courseList}" was reassigned from ${info.name} to ${newTeacherName}`)
  }

  return summaries
}
