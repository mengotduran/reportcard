import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

// Departments group a SECONDARY school's classes into streams (Grammar /
// Technical / Commercial). Universities have their own department-in-name
// convention and primaries have none, so this only really matters for secondary.

export const getDepartments = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })

    let departments = await prisma.department.findMany({
      where: { schoolId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    // Self-heal: a secondary school should always have at least the default
    // "Grammar" department, with every existing (untagged) class assigned to it.
    // Covers schools created after the backfill migration ran.
    if (school?.type === 'SECONDARY' && departments.length === 0) {
      const grammar = await prisma.department.create({
        data: { schoolId, name: 'Grammar', order: 0, isDefault: true },
      })
      await prisma.classLevel.updateMany({
        where: { schoolId, departmentId: null },
        data: { departmentId: grammar.id },
      })
      departments = [grammar]
    }

    res.json({ departments })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name } = req.body

    if (!name?.trim()) {
      res.status(400).json({ message: 'Department name is required' })
      return
    }

    const existing = await prisma.department.findUnique({
      where: { schoolId_name: { schoolId, name: name.trim() } },
    })
    if (existing) {
      res.status(400).json({ message: 'A department with this name already exists' })
      return
    }

    const count = await prisma.department.count({ where: { schoolId } })
    const department = await prisma.department.create({
      data: { schoolId, name: name.trim(), order: count, isDefault: count === 0 },
    })
    res.status(201).json({ message: 'Department created', department })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { name, order } = req.body

    const dept = await prisma.department.findFirst({ where: { id, schoolId } })
    if (!dept) {
      res.status(404).json({ message: 'Department not found' })
      return
    }

    if (name?.trim() && name.trim() !== dept.name) {
      const conflict = await prisma.department.findUnique({
        where: { schoolId_name: { schoolId, name: name.trim() } },
      })
      if (conflict) {
        res.status(400).json({ message: 'A department with this name already exists' })
        return
      }
    }

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(order !== undefined ? { order: Number(order) } : {}),
      },
    })
    res.json({ message: 'Department updated', department })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const dept = await prisma.department.findFirst({ where: { id, schoolId } })
    if (!dept) {
      res.status(404).json({ message: 'Department not found' })
      return
    }
    if (dept.isDefault) {
      res.status(400).json({ message: 'The default department cannot be deleted' })
      return
    }

    const classCount = await prisma.classLevel.count({ where: { schoolId, departmentId: id } })
    if (classCount > 0) {
      res.status(400).json({ message: 'Move or delete this department\'s classes before deleting it' })
      return
    }

    await prisma.department.delete({ where: { id } })
    res.json({ message: 'Department deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
