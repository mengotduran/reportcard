import { Response } from 'express'
import prisma from '../config/prisma'
import bcrypt from 'bcryptjs'
import { AuthRequest } from '../middleware/auth'

export const getTeachers = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const teachers = await prisma.user.findMany({
      where: {
        schoolId,
        isActive: true,
        role: { in: ['CLASS_TEACHER', 'CLASS_MASTER', 'VICE_PRINCIPAL'] }
      },
      select: { id: true, name: true, email: true, role: true, masterClassLevel: true, createdAt: true },
      orderBy: { name: 'asc' }
    })
    res.json({ teachers, total: teachers.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createTeacher = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, email, password, role, masterClassLevel } = req.body

    if (role === 'CLASS_MASTER' && !masterClassLevel) {
      res.status(400).json({ message: 'masterClassLevel is required for Class Master' })
      return
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(400).json({ message: 'Email already exists' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const teacher = await prisma.user.create({
      data: { name, email, password: hashedPassword, role, schoolId, masterClassLevel: masterClassLevel ?? null },
      select: { id: true, name: true, email: true, role: true, masterClassLevel: true, createdAt: true }
    })

    res.status(201).json({ message: 'Teacher created', teacher })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateTeacher = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { role, masterClassLevel } = req.body

    const teacher = await prisma.user.findFirst({ where: { id, schoolId } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    let displacedName: string | null = null

    // If promoting to CLASS_MASTER, demote the current master of that class
    if (role === 'CLASS_MASTER' && masterClassLevel) {
      const currentMaster = await prisma.user.findFirst({
        where: { schoolId, role: 'CLASS_MASTER', masterClassLevel, id: { not: id } }
      })
      if (currentMaster) {
        await prisma.user.update({
          where: { id: currentMaster.id },
          data: { role: 'CLASS_TEACHER', masterClassLevel: null }
        })
        displacedName = currentMaster.name
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role,
        masterClassLevel: role === 'CLASS_MASTER' ? (masterClassLevel ?? null) : null
      },
      select: { id: true, name: true, email: true, role: true, masterClassLevel: true, createdAt: true }
    })

    res.json({
      message: 'Teacher updated',
      teacher: updated,
      displaced: displacedName
        ? `${displacedName} was removed as Class Master and is now a Class Teacher`
        : undefined
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteTeacher = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const teacher = await prisma.user.findFirst({ where: { id, schoolId } })
    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found' })
      return
    }

    await prisma.user.update({ where: { id }, data: { isActive: false } })
    res.json({ message: 'Teacher removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getTeacherSubjects = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const assigned = await prisma.teacherSubject.findMany({
      where: { userId: id },
      include: { subject: true },
    })
    res.json({ subjects: assigned.map((a) => a.subject) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const assignTeacherSubjects = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const { subjectIds }: { subjectIds: string[] } = req.body
    const reassigned: string[] = []

    // For each subject, if another teacher already has it → take it from them
    for (const subjectId of subjectIds) {
      const existing = await prisma.teacherSubject.findFirst({
        where: { subjectId, userId: { not: id } },
        include: { user: true, subject: true },
      })
      if (existing) {
        await prisma.teacherSubject.delete({ where: { id: existing.id } })
        reassigned.push(
          `"${existing.subject.name} (${existing.subject.classLevel})" was reassigned from ${existing.user.name}`
        )
      }
    }

    // Replace all assignments for this teacher
    await prisma.teacherSubject.deleteMany({ where: { userId: id } })
    if (subjectIds.length > 0) {
      await prisma.teacherSubject.createMany({
        data: subjectIds.map((sid) => ({ userId: id, subjectId: sid })),
        skipDuplicates: true,
      })
    }

    res.json({
      message: 'Subjects assigned successfully',
      reassigned: reassigned.length > 0 ? reassigned : undefined,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
