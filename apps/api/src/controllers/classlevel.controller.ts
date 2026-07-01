import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { isRegistrationClass } from './hndRegistration.controller'

export const getClassLevels = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const levels = await prisma.classLevel.findMany({
      where: { schoolId },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })
    res.json({ classLevels: levels })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createClassLevel = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, abbreviation, hasStream, order, maxScore, feeAmount, hndRegistrationFee } = req.body

    if (!name?.trim()) {
      res.status(400).json({ message: 'Class name is required' })
      return
    }

    if (feeAmount === undefined || feeAmount === null || feeAmount === '' || !Number.isFinite(Number(feeAmount)) || Number(feeAmount) < 0) {
      res.status(400).json({ message: 'A fee amount is required for the class (use 0 if there is none)' })
      return
    }

    const existing = await prisma.classLevel.findUnique({
      where: { schoolId_name: { schoolId, name: name.trim() } },
    })
    if (existing) {
      res.status(400).json({ message: 'A class with this name already exists' })
      return
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    const regEligible = isRegistrationClass(school?.type, name.trim())
    const regFee = regEligible && hndRegistrationFee !== undefined && hndRegistrationFee !== null && hndRegistrationFee !== ''
      ? Math.max(0, Math.round(Number(hndRegistrationFee)) || 0)
      : null

    const level = await prisma.classLevel.create({
      data: {
        schoolId, name: name.trim(),
        abbreviation: abbreviation?.trim() || null,
        hasStream: hasStream ?? false,
        order: order ?? 0,
        maxScore: maxScore ? Number(maxScore) : 20,
        feeAmount: Math.max(0, Math.round(Number(feeAmount)) || 0),
        hndRegistrationFee: regFee,
      },
    })
    res.status(201).json({ message: 'Class created', classLevel: level })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateClassLevel = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { name, abbreviation, hasStream, order, maxScore, feeAmount, hndRegistrationFee } = req.body

    const level = await prisma.classLevel.findFirst({ where: { id, schoolId } })
    if (!level) {
      res.status(404).json({ message: 'Class not found' })
      return
    }

    if (name?.trim() && name.trim() !== level.name) {
      const conflict = await prisma.classLevel.findUnique({
        where: { schoolId_name: { schoolId, name: name.trim() } },
      })
      if (conflict) {
        res.status(400).json({ message: 'A class with this name already exists' })
        return
      }
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true, acronym: true } })
    const regEligible = isRegistrationClass(school?.type, name?.trim() || level.name)

    const updated = await prisma.classLevel.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(abbreviation !== undefined ? { abbreviation: abbreviation?.trim() || null } : {}),
        ...(hasStream !== undefined ? { hasStream } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(maxScore !== undefined ? { maxScore: Number(maxScore) } : {}),
        ...(feeAmount !== undefined ? { feeAmount: Math.max(0, Math.round(Number(feeAmount)) || 0) } : {}),
        ...(hndRegistrationFee !== undefined
          ? { hndRegistrationFee: !regEligible || hndRegistrationFee === null || hndRegistrationFee === '' ? null : Math.max(0, Math.round(Number(hndRegistrationFee)) || 0) }
          : {}),
      },
    })

    // Whenever a non-empty abbreviation is explicitly sent, regenerate all student
    // IDs in this class so the matricule always reflects the current abbreviation.
    if (abbreviation?.trim() && updated.abbreviation) {
      if (school?.type === 'UNIVERSITY' && school.acronym) {
        const levelMatch = updated.name.match(/- Level (\d+)$/i)
        const levelSuffix = levelMatch ? levelMatch[1] : ''
        const progMatch = updated.name.match(/^(HND|Degree)\s/i)
        const prog = progMatch ? progMatch[1].toUpperCase() : ''
        const newAbbr = updated.abbreviation + levelSuffix

        const students = await prisma.student.findMany({
          where: { schoolId, classLevel: updated.name },
          select: { id: true, studentId: true },
        })

        for (const s of students) {
          const parts = s.studentId.split('/')
          // Expected format: ACRONYM/YEAR[/PROG]/BATCH/OLDABBR/SEQ
          if (parts[0] !== school.acronym || parts.length < 4) continue
          const year  = parts[1]
          // Batch is right after YEAR (index 2) unless PROG is present (index 2 is HND/DEGREE)
          const hasProg = prog && parts[2]?.toUpperCase() === prog
          const batchIdx = hasProg ? 3 : 2
          const batch = parts[batchIdx]
          const seq   = parts[parts.length - 1]
          if (!batch || !seq) continue
          const newParts = [school.acronym, year, ...(prog ? [prog] : []), batch, newAbbr, seq]
          const newStudentId = newParts.join('/')
          await prisma.student.update({ where: { id: s.id }, data: { studentId: newStudentId } })
        }
      }
    }

    res.json({ message: 'Class updated', classLevel: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteClassLevel = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const level = await prisma.classLevel.findFirst({ where: { id, schoolId } })
    if (!level) {
      res.status(404).json({ message: 'Class not found' })
      return
    }

    await prisma.classLevel.delete({ where: { id } })
    res.json({ message: 'Class deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
