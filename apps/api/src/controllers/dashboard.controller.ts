import { Response } from 'express'
import { UserRole } from '@prisma/client'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

const WEEKS = 8

function getWeekLabels(): string[] {
  const now = new Date()
  return Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - (WEEKS - 1 - i) * 7)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
}

function bucketByWeek(dates: Date[]): number[] {
  const now = new Date()
  const counts = new Array(WEEKS).fill(0)
  for (const date of dates) {
    const daysAgo = Math.floor((now.getTime() - date.getTime()) / 86400000)
    const idx = WEEKS - 1 - Math.floor(daysAgo / 7)
    if (idx >= 0 && idx < WEEKS) counts[idx]++
  }
  return counts
}

// Running total as of the end of each week, not "how many were newly created that
// week" — bulk seeding/import creates hundreds of rows on a single day, which turns
// a per-week-new-count chart into one giant spike against seven flat zero weeks. Recharts
// renders that near-degenerate series as nothing at all for line/bar charts. A cumulative
// total is always a smooth non-decreasing curve regardless of how the data was created,
// which is also what a "trend" chart should show in the first place.
function cumulativeByWeek(baseCount: number, recentDates: Date[]): number[] {
  const weeklyNew = bucketByWeek(recentDates)
  const cumulative = new Array(WEEKS).fill(0)
  let running = baseCount
  for (let i = 0; i < WEEKS; i++) {
    running += weeklyNew[i]
    cumulative[i] = running
  }
  return cumulative
}

export const getWeeklyStats = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId
    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - WEEKS * 7)

    const teacherRoleFilter = { role: { in: [UserRole.CLASS_TEACHER, UserRole.CLASS_MASTER, UserRole.SUBJECT_TEACHER] } }

    const [
      students, reportCards, teachers, subjects,
      studentsBase, reportCardsBase, teachersBase, subjectsBase,
    ] = await Promise.all([
      prisma.student.findMany({ where: { schoolId, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.reportCard.findMany({ where: { schoolId, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.user.findMany({ where: { schoolId, ...teacherRoleFilter, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.subject.findMany({ where: { schoolId, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.student.count({ where: { schoolId, createdAt: { lt: cutoff } } }),
      prisma.reportCard.count({ where: { schoolId, createdAt: { lt: cutoff } } }),
      prisma.user.count({ where: { schoolId, ...teacherRoleFilter, createdAt: { lt: cutoff } } }),
      prisma.subject.count({ where: { schoolId, createdAt: { lt: cutoff } } }),
    ])

    res.json({
      labels: getWeekLabels(),
      students: cumulativeByWeek(studentsBase, students.map(s => s.createdAt)),
      reportCards: cumulativeByWeek(reportCardsBase, reportCards.map(r => r.createdAt)),
      teachers: cumulativeByWeek(teachersBase, teachers.map(t => t.createdAt)),
      subjects: cumulativeByWeek(subjectsBase, subjects.map(s => s.createdAt)),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getTeacherChartStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const schoolId = req.user!.schoolId
    const masterClassLevel = (req.user as any).masterClassLevel as string | null

    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - WEEKS * 7)

    const teacherSubjects = await prisma.teacherSubject.findMany({
      where: { userId },
      include: { subject: { select: { classLevel: true, name: true } } },
    })

    const classLevels = [...new Set(
      masterClassLevel
        ? [masterClassLevel]
        : teacherSubjects.map(ts => ts.subject.classLevel)
    )]

    const [studentCountRows, recentStudents, studentsBase] = await Promise.all([
      Promise.all(classLevels.map(cl =>
        prisma.student.count({ where: { schoolId, classLevel: cl } })
          .then(count => ({ classLevel: cl, count }))
      )),
      prisma.student.findMany({
        where: { schoolId, classLevel: { in: classLevels }, createdAt: { gte: cutoff } },
        select: { createdAt: true },
      }),
      prisma.student.count({ where: { schoolId, classLevel: { in: classLevels }, createdAt: { lt: cutoff } } }),
    ])

    const subjectCounts = classLevels.map(cl => ({
      classLevel: cl,
      count: teacherSubjects.filter(ts => ts.subject.classLevel === cl).length,
    }))

    res.json({
      labels: getWeekLabels(),
      studentCounts: studentCountRows,
      subjectCounts,
      weeklyStudents: cumulativeByWeek(studentsBase, recentStudents.map(s => s.createdAt)),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// A teacher's assigned classes, tagged with department where one applies —
// secondary classes have a real Department (Grammar/Technical/Commercial),
// university classes have a program-as-department (NURSING/MIDWIFERY/...),
// primary classes never do. Subject.classLevel is a plain name, not a FK, so
// this resolves it against ClassLevel to pick up the department relation.
export const getTeacherClasses = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const schoolId = req.user!.schoolId
    const masterClassLevel = (req.user as any).masterClassLevel as string | null

    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const teacherSubjects = await prisma.teacherSubject.findMany({
      where: { userId },
      include: { subject: { select: { id: true, name: true, classLevel: true } } },
    })

    const classLevelNames = [...new Set([
      ...teacherSubjects.map(ts => ts.subject.classLevel),
      ...(masterClassLevel ? [masterClassLevel] : []),
    ])]

    const classLevels = classLevelNames.length > 0
      ? await prisma.classLevel.findMany({
          where: { schoolId, name: { in: classLevelNames } },
          include: { department: { select: { name: true } } },
        })
      : []
    const classLevelByName = new Map(classLevels.map(cl => [cl.name, cl]))

    interface ClassRow {
      id: string
      subjectId: string | null
      subjectName: string | null
      classLevelName: string
      departmentName: string | null
      isMasterClass: boolean
    }

    const classes: ClassRow[] = teacherSubjects.map(ts => ({
      id: ts.id,
      subjectId: ts.subject.id,
      subjectName: ts.subject.name,
      classLevelName: ts.subject.classLevel,
      departmentName: classLevelByName.get(ts.subject.classLevel)?.department?.name ?? null,
      isMasterClass: ts.subject.classLevel === masterClassLevel,
    }))

    // A class master's own class stays visible even if they teach no subject there.
    if (masterClassLevel && !classes.some(c => c.classLevelName === masterClassLevel)) {
      classes.push({
        id: `master-${masterClassLevel}`,
        subjectId: null,
        subjectName: null,
        classLevelName: masterClassLevel,
        departmentName: classLevelByName.get(masterClassLevel)?.department?.name ?? null,
        isMasterClass: true,
      })
    }

    res.json({ classes })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** Distinct academic years (term sessions) for the school, newest first. */
export const getAcademicYears = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId
    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const terms = await prisma.term.findMany({ where: { schoolId }, select: { session: true, isCurrent: true } })
    const map = new Map<string, boolean>()
    for (const t of terms) {
      if (!map.has(t.session)) map.set(t.session, false)
      if (t.isCurrent) map.set(t.session, true)
    }
    const academicYears = Array.from(map, ([session, current]) => ({ session, current }))
      .sort((a, b) => b.session.localeCompare(a.session))
    res.json({ academicYears })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId

    if (!schoolId) {
      res.status(400).json({ message: 'No school associated with this account' })
      return
    }

    // Academic year (session) to report on — defaults to the current term's session.
    let session = req.query.session ? String(req.query.session) : null
    if (!session) {
      const cur = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
      session = cur?.session ?? null
    }

    if (!session) {
      // No terms yet — fall back to the live roster + school-wide counts.
      const [students, teachers, subjects] = await Promise.all([
        prisma.student.count({ where: { schoolId, isActive: true } }),
        prisma.user.count({ where: { schoolId, isActive: true, role: { in: ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL'] } } }),
        prisma.subject.count({ where: { schoolId } }),
      ])
      res.json({ students, teachers, reportCards: 0, subjects, session: null })
      return
    }

    // Everything is scoped to the chosen academic year. A "year" is defined by the
    // classes that actually ran it (the classes of students who have report cards
    // that session); subjects + teachers are limited to those classes.
    const yearStudents = await prisma.student.findMany({
      where: { schoolId, reportCards: { some: { term: { session } } } },
      select: { classLevel: true },
    })
    const classLevels = [...new Set(yearStudents.map((s) => s.classLevel))]

    const [reportCards, subjects, teachers] = await Promise.all([
      prisma.reportCard.count({ where: { schoolId, term: { session } } }),
      prisma.subject.count({ where: { schoolId, classLevel: { in: classLevels } } }),
      prisma.user.count({
        where: {
          schoolId, isActive: true, role: { in: ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL'] },
          teacherSubjects: { some: { subject: { classLevel: { in: classLevels } } } },
        },
      }),
    ])

    res.json({ students: yearStudents.length, teachers, reportCards, subjects, session })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
