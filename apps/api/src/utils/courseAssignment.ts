import prisma from '../config/prisma'
import { NotificationLink } from './notificationLink'
import { emitToUser } from '../config/socket'

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
  /** The date the handover takes effect. The previous teacher's hours are counted up to it
   *  and the new teacher's from it, so an admin recording a departure five days late still
   *  credits those five days to the right person. Defaults to now. */
  effectiveAt?: Date
}): Promise<string[]> {
  const { schoolId, subjectIds, newTeacherId } = params
  const effectiveAt = params.effectiveAt ?? new Date()
  if (subjectIds.length === 0) return []

  const existing = await prisma.teacherSubject.findMany({
    // Only ACTIVE assignments: an already-ended row is history and must not be touched again.
    where: { subjectId: { in: subjectIds }, userId: { not: newTeacherId }, endedAt: null },
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

  // Archived AS OF THE HANDOVER, not "now". The archive date is what bounds the slot's
  // lifetime in the hours maths, so stamping it with the current time would end the outgoing
  // teacher's timetable today regardless of when they actually left — their hours for the
  // period they did teach would vanish.
  const archivedAt = effectiveAt
  const summaries: string[] = []

  for (const [previousTeacherId, info] of byTeacher) {
    const courseList = info.courses.join(', ')
    // Opens the teacher's own timetable, which is where the consequence is visible. The
    // slots are archived in this same transaction, so the grid shows the AFTER state with
    // nothing where those periods used to be — the banner is what accounts for the gap.
    const link: NotificationLink = {
      teacherId: previousTeacherId,
      teacherName: info.name,
      reassignedCourses: courseList,
      reassignedTo: newTeacherName,
    }
    await prisma.$transaction([
      // ENDED, not deleted. Deleting was the old behaviour and it erased the only record
      // that this teacher ever held the course — along with every hour they are owed for it.
      prisma.teacherSubject.updateMany({
        where: { userId: previousTeacherId, subjectId: { in: info.subjectIds }, endedAt: null },
        data: { endedAt: effectiveAt },
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
          data: link as any,
        },
      }),
    ])
    // Outside the $transaction on purpose. Emitting inside the array is not even possible
    // here (it takes queries, not callbacks), and emitting before the commit would tell the
    // client to refetch a notification that isn't visible yet.
    emitToUser(previousTeacherId, 'notifications:changed')
    summaries.push(`"${courseList}" was reassigned from ${info.name} to ${newTeacherName}`)
  }

  return summaries
}
