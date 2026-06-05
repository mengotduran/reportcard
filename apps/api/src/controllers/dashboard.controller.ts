import { Response } from 'express'
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

export const getWeeklyStats = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId
    if (!schoolId) { res.status(400).json({ message: 'No school' }); return }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - WEEKS * 7)

    const [students, reportCards, teachers, subjects] = await Promise.all([
      prisma.student.findMany({ where: { schoolId, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.reportCard.findMany({ where: { schoolId, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
      prisma.user.findMany({
        where: { schoolId, role: { in: ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER'] }, createdAt: { gte: cutoff } },
        select: { createdAt: true },
      }),
      prisma.subject.findMany({ where: { schoolId, createdAt: { gte: cutoff } }, select: { createdAt: true } }),
    ])

    res.json({
      labels: getWeekLabels(),
      students: bucketByWeek(students.map(s => s.createdAt)),
      reportCards: bucketByWeek(reportCards.map(r => r.createdAt)),
      teachers: bucketByWeek(teachers.map(t => t.createdAt)),
      subjects: bucketByWeek(subjects.map(s => s.createdAt)),
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

    const [studentCountRows, recentStudents] = await Promise.all([
      Promise.all(classLevels.map(cl =>
        prisma.student.count({ where: { schoolId, classLevel: cl } })
          .then(count => ({ classLevel: cl, count }))
      )),
      prisma.student.findMany({
        where: { schoolId, classLevel: { in: classLevels }, createdAt: { gte: cutoff } },
        select: { createdAt: true },
      }),
    ])

    const subjectCounts = classLevels.map(cl => ({
      classLevel: cl,
      count: teacherSubjects.filter(ts => ts.subject.classLevel === cl).length,
    }))

    res.json({
      labels: getWeekLabels(),
      studentCounts: studentCountRows,
      subjectCounts,
      weeklyStudents: bucketByWeek(recentStudents.map(s => s.createdAt)),
    })
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

    const [students, teachers, reportCards, subjects] = await Promise.all([
      prisma.student.count({ where: { schoolId, isActive: true } }),
      prisma.user.count({
        where: {
          schoolId,
          isActive: true,
          role: { in: ['CLASS_TEACHER', 'CLASS_MASTER', 'VICE_PRINCIPAL'] },
        },
      }),
      prisma.reportCard.count({ where: { schoolId } }),
      prisma.subject.count({ where: { schoolId } }),
    ])

    res.json({ students, teachers, reportCards, subjects })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
