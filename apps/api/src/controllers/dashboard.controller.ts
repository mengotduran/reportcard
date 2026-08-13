import { Response } from 'express'
import { UserRole } from '@prisma/client'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

const WEEKS = 8

/**
 * masterClassLevel is never in the JWT (see utils/jwt.ts — id/role/schoolId only), so
 * `req.user.masterClassLevel` is always undefined; every read of it below used to fall
 * straight through to "no master class", silently dropping a class master's own class
 * the moment they had zero active TeacherSubject rows on it (a brand new class, staffed
 * before it has subjects — a completely normal order for primary). Always read fresh.
 *
 * `departments` is included too: for a PRIMARY school it's the class-team roster (see
 * classTeamRoster in classlevel.controller.ts) — a non-master team member has no
 * masterClassLevel and, on a subject-less class, no TeacherSubject rows either, so it's
 * the only record of their membership. Secondary/university use the same field for real
 * department placement, not class names, so it's only trusted here for PRIMARY schools.
 */
async function resolveTeacherClassLevels(userId: string, schoolId: string): Promise<{ masterClassLevel: string | null; primaryTeamClasses: string[] }> {
  const [me, school] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { masterClassLevel: true, departments: true } }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } }),
  ])
  const primaryTeamClasses = school?.type === 'PRIMARY' && Array.isArray(me?.departments) ? me!.departments as string[] : []
  return { masterClassLevel: me?.masterClassLevel ?? null, primaryTeamClasses }
}

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

/** The academic year a stats endpoint should report on: the one asked for, else the current
 *  term's. Null when the school has no terms at all, which callers read as "unscoped". */
async function resolveStatsSession(schoolId: string, requested: string | null): Promise<string | null> {
  if (requested) return requested
  const cur = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
  return cur?.session ?? null
}

export const getWeeklyStats = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId
    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - WEEKS * 7)

    const teacherRoleFilter = { role: { in: [UserRole.CLASS_TEACHER, UserRole.CLASS_MASTER, UserRole.SUBJECT_TEACHER] } }

    // SCOPED TO THE ACADEMIC YEAR, exactly like the number printed above the chart.
    // Counting school-wide made the two disagree loudly: one secondary school here holds
    // 3,448 report cards across every year it has run, of which 1,750 belong to the current
    // one — so the card read "1,750" while its own sparkline peaked at 3,448. A trend line
    // under a figure has to be a history OF that figure.
    //
    // Same definitions getDashboardStats uses: a year is the classes that actually ran it,
    // and students are those with a report card in it. Teachers and subjects only looked
    // right before because neither is recreated per year.
    const session = await resolveStatsSession(schoolId, req.query.session ? String(req.query.session) : null)
    const yearStudents = session
      ? await prisma.student.findMany({ where: { schoolId, reportCards: { some: { term: { session } } } }, select: { id: true, classLevel: true, createdAt: true } })
      : []
    const classLevels = [...new Set(yearStudents.map((s) => s.classLevel))]
    const studentScope = { schoolId, ...(session ? { reportCards: { some: { term: { session } } } } : {}) }
    const cardScope = { schoolId, ...(session ? { term: { session } } : {}) }
    const subjectScope = { schoolId, ...(session ? { classLevel: { in: classLevels } } : {}) }
    const teacherScope = {
      schoolId, ...teacherRoleFilter,
      ...(session ? { teacherSubjects: { some: { subject: { classLevel: { in: classLevels } } } } } : {}),
    }

    const [
      students, reportCards, teachers, subjects,
      studentsBase, reportCardsBase, teachersBase, subjectsBase,
    ] = await Promise.all([
      prisma.student.findMany({ where: { ...studentScope, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.reportCard.findMany({ where: { ...cardScope, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.user.findMany({ where: { ...teacherScope, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.subject.findMany({ where: { ...subjectScope, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.student.count({ where: { ...studentScope, createdAt: { lt: cutoff } } }),
      prisma.reportCard.count({ where: { ...cardScope, createdAt: { lt: cutoff } } }),
      prisma.user.count({ where: { ...teacherScope, createdAt: { lt: cutoff } } }),
      prisma.subject.count({ where: { ...subjectScope, createdAt: { lt: cutoff } } }),
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

    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const { masterClassLevel, primaryTeamClasses } = await resolveTeacherClassLevels(userId, schoolId)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - WEEKS * 7)

    const teacherSubjects = await prisma.teacherSubject.findMany({
      // Current courses only — the dashboard shows what they teach now, not what they used to.
      where: { userId, endedAt: null },
      include: { subject: { select: { classLevel: true, name: true } } },
    })

    // A union, not an either/or — a class master (or primary team member) can also teach
    // subjects in a different class, and that class shouldn't disappear from their charts.
    const classLevels = [...new Set([
      ...teacherSubjects.map(ts => ts.subject.classLevel),
      ...(masterClassLevel ? [masterClassLevel] : []),
      ...primaryTeamClasses,
    ])]

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

    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const { masterClassLevel, primaryTeamClasses } = await resolveTeacherClassLevels(userId, schoolId)

    const teacherSubjects = await prisma.teacherSubject.findMany({
      where: { userId },
      include: { subject: { select: { id: true, name: true, classLevel: true, term: true } } },
    })

    // A course row names a specific semester via `subject.term` for universities
    // (primary/secondary leave it null — one row spans the whole academic year, so it
    // always counts). This lists everything taught across the WHOLE current session
    // (both semesters / all terms) — "what am I currently teaching right now" is a
    // separate, narrower question already answered by "Enter My Classes".
    const currentTerm = await prisma.term.findFirst({ where: { schoolId, isCurrent: true } })
    let sessionTermNames: Set<string> | null = null
    if (currentTerm) {
      const sessionTerms = await prisma.term.findMany({
        where: { schoolId, session: currentTerm.session },
        select: { name: true },
      })
      sessionTermNames = new Set(sessionTerms.map((t) => t.name))
    }
    const relevantTeacherSubjects = sessionTermNames
      ? teacherSubjects.filter((ts) => !ts.subject.term || sessionTermNames!.has(ts.subject.term))
      : teacherSubjects

    const classLevelNames = [...new Set([
      ...relevantTeacherSubjects.map(ts => ts.subject.classLevel),
      ...(masterClassLevel ? [masterClassLevel] : []),
      // A primary team member with no subject assigned yet (a brand new class, staffed
      // before it has any) has no TeacherSubject row and, unless they're also the master,
      // nothing else naming their class either — departments is the only record of it.
      ...primaryTeamClasses,
    ])]

    const [classLevels, studentCountRows] = await Promise.all([
      classLevelNames.length > 0
        ? prisma.classLevel.findMany({
            where: { schoolId, name: { in: classLevelNames } },
            include: { department: { select: { name: true } } },
          })
        : Promise.resolve([]),
      // Batched once per distinct class, reused by every row for that class below — not
      // one query per subject. Lets the app grey out "enter marks" before the teacher
      // taps into an empty class, rather than only finding out once inside it.
      Promise.all(classLevelNames.map(cl =>
        prisma.student.count({ where: { schoolId, classLevel: cl, isActive: true } }).then(count => [cl, count] as const)
      )),
    ])
    const classLevelByName = new Map(classLevels.map(cl => [cl.name, cl]))
    const studentCountByClass = new Map(studentCountRows)

    interface ClassRow {
      id: string
      subjectId: string | null
      subjectName: string | null
      classLevelName: string
      departmentName: string | null
      isMasterClass: boolean
      term: string | null
      studentCount: number
    }

    const classes: ClassRow[] = relevantTeacherSubjects.map(ts => ({
      id: ts.id,
      subjectId: ts.subject.id,
      subjectName: ts.subject.name,
      classLevelName: ts.subject.classLevel,
      departmentName: classLevelByName.get(ts.subject.classLevel)?.department?.name ?? null,
      isMasterClass: ts.subject.classLevel === masterClassLevel,
      term: ts.subject.term,
      studentCount: studentCountByClass.get(ts.subject.classLevel) ?? 0,
    }))

    // A class master's own class stays visible even if they teach no subject there —
    // likewise a primary team member (master or not) on a class with no subjects yet.
    const namedClasses = new Set(classes.map(c => c.classLevelName))
    const fallbackClasses = [...new Set([...(masterClassLevel ? [masterClassLevel] : []), ...primaryTeamClasses])]
    for (const cl of fallbackClasses) {
      if (namedClasses.has(cl)) continue
      namedClasses.add(cl)
      classes.push({
        id: `team-${cl}`,
        subjectId: null,
        subjectName: null,
        classLevelName: cl,
        departmentName: classLevelByName.get(cl)?.department?.name ?? null,
        isMasterClass: cl === masterClassLevel,
        term: null,
        studentCount: studentCountByClass.get(cl) ?? 0,
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
    const session = await resolveStatsSession(schoolId, req.query.session ? String(req.query.session) : null)

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
