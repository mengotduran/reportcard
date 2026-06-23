import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { demoLimitBlock } from '../config/demo'

export const getClassLevels = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const levels = await prisma.student.findMany({
      where: { schoolId, isActive: true },
      select: { classLevel: true },
      distinct: ['classLevel'],
      orderBy: { classLevel: 'asc' },
    })
    res.json({ classLevels: levels.map((l) => l.classLevel) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getStudents = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { classLevel, search } = req.query
    const session = req.query.session ? String(req.query.session) : null

    // Year-aware roster: for the live academic year (or no session) show the active
    // roster; for a past year show the students who have report cards that session.
    let liveSession: string | null = null
    if (session) {
      const cur = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
      liveSession = cur?.session ?? null
    }
    const yearScope =
      !session || session === liveSession
        ? { isActive: true }
        : { reportCards: { some: { term: { session } } } }

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        ...yearScope,
        ...(classLevel ? { classLevel: String(classLevel) } : {}),
        ...(search ? { name: { contains: String(search), mode: 'insensitive' } } : {})
      },
      orderBy: { name: 'asc' }
    })

    res.json({ students, total: students.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getStudent = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const student = await prisma.student.findFirst({
      where: { id, schoolId },
      include: {
        reportCards: {
          include: { term: true, entries: { include: { subject: true } } }
        }
      }
    })

    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    res.json(student)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

async function generateStudentId(schoolId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `${year}-`

  // Find the highest existing sequential number for this school/year
  const last = await prisma.student.findFirst({
    where: { schoolId, studentId: { startsWith: prefix } },
    orderBy: { studentId: 'desc' },
    select: { studentId: true },
  })

  let nextNum = 1
  if (last) {
    const parts = last.studentId.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }

  // Collision-safe loop (handles concurrent inserts)
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${prefix}${String(nextNum).padStart(4, '0')}`
    const collision = await prisma.student.findUnique({
      where: { schoolId_studentId: { schoolId, studentId: candidate } },
    })
    if (!collision) return candidate
    nextNum++
  }

  // Fallback: append timestamp segment to guarantee uniqueness
  return `${prefix}${Date.now().toString(36).toUpperCase()}`
}

export const createStudent = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, classLevel, gender, guardianName, guardianPhone, guardianEmail } = req.body

    if (gender !== 'Male' && gender !== 'Female') {
      res.status(400).json({ message: 'Gender (Male or Female) is required' })
      return
    }

    const limit = await demoLimitBlock(schoolId, 'students')
    if (limit) { res.status(403).json({ message: limit }); return }

    const studentId = await generateStudentId(schoolId)

    const student = await prisma.student.create({
      data: { schoolId, name, studentId, classLevel, gender, guardianName, guardianPhone, guardianEmail }
    })

    res.status(201).json({ message: 'Student created', student })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateStudent = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { name, classLevel, gender, guardianName, guardianPhone, guardianEmail } = req.body

    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const updated = await prisma.student.update({
      where: { id },
      data: { name, classLevel, ...(gender !== undefined ? { gender } : {}), guardianName, guardianPhone, guardianEmail }
    })

    res.json({ message: 'Student updated', student: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteStudent = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    await prisma.student.update({ where: { id }, data: { isActive: false } })
    res.json({ message: 'Student deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
