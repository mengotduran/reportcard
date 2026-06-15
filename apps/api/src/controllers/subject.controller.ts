import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { demoLimitBlock } from '../config/demo'

export const getSubjects = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const isTeacher = ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER'].includes(req.user!.role)

    let subjectIdFilter: string[] | undefined

    if (isTeacher) {
      const assigned = await prisma.teacherSubject.findMany({
        where: { userId: req.user!.id },
        select: { subjectId: true },
      })
      subjectIdFilter = assigned.map((a) => a.subjectId)
    }

    const subjects = await prisma.subject.findMany({
      where: {
        schoolId,
        ...(subjectIdFilter !== undefined ? { id: { in: subjectIdFilter } } : {}),
      },
      orderBy: { name: 'asc' },
    })
    res.json({ subjects, total: subjects.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createSubject = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, classLevel, coefficient } = req.body

    const limit = await demoLimitBlock(schoolId, 'subjects')
    if (limit) { res.status(403).json({ message: limit }); return }

    const existing = await prisma.subject.findFirst({
      where: { schoolId, name, classLevel }
    })
    if (existing) {
      res.status(400).json({ message: 'Subject already exists for this class level' })
      return
    }

    // Inherit maxScore from the class definition
    const classLevel_ = await prisma.classLevel.findUnique({
      where: { schoolId_name: { schoolId, name: classLevel } }
    })
    const maxScore = classLevel_?.maxScore ?? 20

    const subject = await prisma.subject.create({
      data: { schoolId, name, classLevel, maxScore, coefficient: coefficient ? Number(coefficient) : 1 }
    })
    res.status(201).json({ message: 'Subject created', subject })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateSubject = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { name, classLevel, coefficient } = req.body

    const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!subject) {
      res.status(404).json({ message: 'Subject not found' })
      return
    }

    const updated = await prisma.subject.update({
      where: { id },
      data: {
        name, classLevel,
        ...(coefficient !== undefined ? { coefficient: Number(coefficient) } : {}),
      }
    })
    res.json({ message: 'Subject updated', subject: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteSubject = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!subject) {
      res.status(404).json({ message: 'Subject not found' })
      return
    }

    await prisma.reportEntry.deleteMany({ where: { subjectId: id } })
    await prisma.subject.delete({ where: { id } })
    res.json({ message: 'Subject deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
