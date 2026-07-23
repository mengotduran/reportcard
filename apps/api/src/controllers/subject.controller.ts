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
    const { name, classLevel, code, coefficient, credit, term, requiredHours } = req.body
    const termValue = term != null && term !== '' ? String(term) : null

    const limit = await demoLimitBlock(schoolId, 'subjects')
    if (limit) { res.status(403).json({ message: limit }); return }

    const existing = await prisma.subject.findFirst({
      where: { schoolId, name, classLevel, term: termValue }
    })
    if (existing) {
      res.status(400).json({ message: termValue ? 'Subject already exists for this class level and term' : 'Subject already exists for this class level' })
      return
    }

    // Inherit maxScore from the class definition
    const classLevel_ = await prisma.classLevel.findUnique({
      where: { schoolId_name: { schoolId, name: classLevel } }
    })
    const maxScore = classLevel_?.maxScore ?? 20

    const subject = await prisma.subject.create({
      data: { schoolId, name, classLevel, maxScore, coefficient: coefficient ? Number(coefficient) : 1,
        code: code?.trim() || null,
        credit: credit != null && credit !== '' ? Number(credit) : null, term: termValue,
        requiredHours: requiredHours != null && requiredHours !== '' ? Number(requiredHours) : null }
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
    const { name, classLevel, code, coefficient, credit, term, requiredHours } = req.body

    const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!subject) {
      res.status(404).json({ message: 'Subject not found' })
      return
    }

    const updated = await prisma.subject.update({
      where: { id },
      data: {
        name, classLevel,
        ...(code !== undefined ? { code: code?.trim() || null } : {}),
        ...(coefficient !== undefined ? { coefficient: Number(coefficient) } : {}),
        ...(credit !== undefined ? { credit: credit != null && credit !== '' ? Number(credit) : null } : {}),
        ...(term !== undefined ? { term: term != null && term !== '' ? String(term) : null } : {}),
        ...(requiredHours !== undefined ? { requiredHours: requiredHours != null && requiredHours !== '' ? Number(requiredHours) : null } : {}),
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

// Copy every subject from one class to another (same school). Used when creating
// a new section (e.g. Form 1 B) so the admin doesn't re-enter the subject list.
// Skips subjects whose name already exists on the target class.
export const copySubjects = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const fromClassLevel = String(req.body.fromClassLevel ?? '').trim()
    const toClassLevel = String(req.body.toClassLevel ?? '').trim()
    if (!fromClassLevel || !toClassLevel || fromClassLevel === toClassLevel) {
      res.status(400).json({ message: 'A valid source and target class are required' })
      return
    }

    const source = await prisma.subject.findMany({ where: { schoolId, classLevel: fromClassLevel } })
    const existing = new Set(
      (await prisma.subject.findMany({ where: { schoolId, classLevel: toClassLevel }, select: { name: true } }))
        .map((s) => s.name.toLowerCase()),
    )
    const toCreate = source.filter((s) => !existing.has(s.name.toLowerCase()))
    if (toCreate.length) {
      await prisma.subject.createMany({
        data: toCreate.map((s) => ({
          schoolId, name: s.name, code: s.code, classLevel: toClassLevel,
          maxScore: s.maxScore, coefficient: s.coefficient, compulsory: s.compulsory,
          credit: s.credit, term: s.term, requiredHours: s.requiredHours,
        })),
      })
    }
    res.json({ copied: toCreate.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
