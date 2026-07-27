import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { isRegistrationClass } from './hndRegistration.controller'
import { stripProgramme } from '../utils/programme'

// Validate a caller-supplied departmentId belongs to the school; for secondary
// schools with none supplied, fall back to the default department (creating it
// if the school somehow has none yet).
async function resolveDepartmentId(
  schoolId: string,
  schoolType: string | undefined,
  departmentId: unknown,
): Promise<string | null> {
  if (typeof departmentId === 'string' && departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: departmentId, schoolId }, select: { id: true } })
    if (dept) return dept.id
  }
  if (schoolType !== 'SECONDARY') return null
  const existing = await prisma.department.findFirst({
    where: { schoolId },
    orderBy: [{ isDefault: 'desc' }, { order: 'asc' }],
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.department.create({
    data: { schoolId, name: 'Grammar', order: 0, isDefault: true },
    select: { id: true },
  })
  return created.id
}

// Day or Evening sitting. Anything unrecognised falls back to DAY rather than 400ing:
// every school that has no evening programme never sends this field at all, and a class is
// far better off in the default sitting than rejected outright.
const PROGRAMMES = ['DAY', 'EVENING'] as const
type ProgrammeValue = (typeof PROGRAMMES)[number]
const resolveProgramme = (value: unknown): ProgrammeValue =>
  typeof value === 'string' && (PROGRAMMES as readonly string[]).includes(value.toUpperCase())
    ? (value.toUpperCase() as ProgrammeValue)
    : 'DAY'

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
    const { name, abbreviation, hasStream, order, maxScore, feeAmount, hndRegistrationFee, departmentId, programme } = req.body

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

    // Resolve which department this class belongs to. Secondary schools group
    // classes under departments (Grammar / Technical / …); fall back to the
    // school's default department when the caller didn't specify one.
    const resolvedDepartmentId = await resolveDepartmentId(schoolId, school?.type, departmentId)

    const level = await prisma.classLevel.create({
      data: {
        schoolId, name: name.trim(),
        abbreviation: abbreviation?.trim() || null,
        hasStream: hasStream ?? false,
        order: order ?? 0,
        maxScore: maxScore ? Number(maxScore) : 20,
        feeAmount: Math.max(0, Math.round(Number(feeAmount)) || 0),
        hndRegistrationFee: regFee,
        departmentId: resolvedDepartmentId,
        programme: resolveProgramme(programme),
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
    const { name, abbreviation, hasStream, order, maxScore, feeAmount, hndRegistrationFee, departmentId, programme } = req.body

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

    // A class is referenced BY NAME everywhere in this app (`Student.classLevel`,
    // `Subject.classLevel`, `User.masterClassLevel` and `ExcelTemplate.classLevels` are all
    // plain strings, not foreign keys). Renaming the ClassLevel row on its own therefore
    // stranded every one of them: the students kept pointing at a class name that no longer
    // existed, so they vanished from their class, their courses lost their marks sheet, and
    // the class master lost the class they write remarks for. Nothing warned about it.
    //
    // So a rename now carries its references with it, in ONE transaction — a half-applied
    // rename would be worse than the bug it replaces.
    const oldName = level.name
    const newName = name?.trim() && name.trim() !== oldName ? name.trim() : null

    // Excel templates store a LIST of class names, and that column is String[] on Postgres
    // but Json on SQLite, so it is read and rewritten in JS rather than filtered in SQL.
    // There are at most a handful per school.
    const templateRewrites: { id: string; classLevels: string[] }[] = []
    if (newName) {
      const templates = await prisma.excelTemplate.findMany({ where: { schoolId }, select: { id: true, classLevels: true } })
      for (const tpl of templates) {
        const list: string[] = Array.isArray(tpl.classLevels) ? (tpl.classLevels as unknown as string[]) : []
        if (list.includes(oldName)) {
          templateRewrites.push({ id: tpl.id, classLevels: list.map((n) => (n === oldName ? newName : n)) })
        }
      }
    }

    const resolvedDepartmentId = departmentId !== undefined
      ? await resolveDepartmentId(schoolId, school?.type, departmentId)
      : undefined

    const data = {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(abbreviation !== undefined ? { abbreviation: abbreviation?.trim() || null } : {}),
      ...(hasStream !== undefined ? { hasStream } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(maxScore !== undefined ? { maxScore: Number(maxScore) } : {}),
      ...(feeAmount !== undefined ? { feeAmount: Math.max(0, Math.round(Number(feeAmount)) || 0) } : {}),
      ...(hndRegistrationFee !== undefined
        ? { hndRegistrationFee: !regEligible || hndRegistrationFee === null || hndRegistrationFee === '' ? null : Math.max(0, Math.round(Number(hndRegistrationFee)) || 0) }
        : {}),
      ...(resolvedDepartmentId !== undefined ? { departmentId: resolvedDepartmentId } : {}),
      ...(programme !== undefined ? { programme: resolveProgramme(programme) } : {}),
    }

    const moved = { students: 0, subjects: 0, classMasters: 0, templates: templateRewrites.length }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.classLevel.update({ where: { id }, data })
      if (newName) {
        moved.students = (await tx.student.updateMany({
          where: { schoolId, classLevel: oldName }, data: { classLevel: newName },
        })).count
        moved.subjects = (await tx.subject.updateMany({
          where: { schoolId, classLevel: oldName }, data: { classLevel: newName },
        })).count
        moved.classMasters = (await tx.user.updateMany({
          where: { schoolId, masterClassLevel: oldName }, data: { masterClassLevel: newName },
        })).count
        for (const tpl of templateRewrites) {
          await tx.excelTemplate.update({ where: { id: tpl.id }, data: { classLevels: tpl.classLevels } })
        }
      }
      return row
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

    const carried = [
      moved.students && `${moved.students} student${moved.students === 1 ? '' : 's'}`,
      moved.subjects && `${moved.subjects} ${moved.subjects === 1 ? 'subject/course' : 'subjects/courses'}`,
      moved.classMasters && `${moved.classMasters} class master${moved.classMasters === 1 ? '' : 's'}`,
      moved.templates && `${moved.templates} Excel template${moved.templates === 1 ? '' : 's'}`,
    ].filter(Boolean).join(', ')
    res.json({
      message: carried ? `Class updated. Moved with it: ${carried}.` : 'Class updated',
      classLevel: updated,
      moved,
    })
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

    // Same exposure as renaming: classes are referenced BY NAME, so deleting one used to
    // leave every reference pointing at something that no longer exists — and unlike a
    // rename there is nothing to point them back at. Students would still hold the class
    // name while disappearing from every class list, and their courses (and the marks on
    // them) would become unreachable.
    //
    // Real content blocks the delete rather than being cascaded away: removing a class must
    // never be a way to silently destroy a roster or a term's marks. Weak references (the
    // class master's class, an Excel template's class list) are cleaned up instead, since
    // they hold no data of their own and would otherwise block a legitimately empty class.
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    const courseWord = school?.type === 'UNIVERSITY' ? 'course' : 'subject'

    const [studentCount, subjectCount] = await Promise.all([
      prisma.student.count({ where: { schoolId, classLevel: level.name } }),
      prisma.subject.count({ where: { schoolId, classLevel: level.name } }),
    ])

    if (studentCount > 0 || subjectCount > 0) {
      const parts = [
        studentCount && `${studentCount} student${studentCount === 1 ? '' : 's'}`,
        subjectCount && `${subjectCount} ${courseWord}${subjectCount === 1 ? '' : 's'}`,
      ].filter(Boolean).join(' and ')
      res.status(400).json({
        message: `"${stripProgramme(level.name)}" still has ${parts}. Move or remove them first, then delete the class.`,
        blockedBy: { students: studentCount, subjects: subjectCount },
      })
      return
    }

    const templates = await prisma.excelTemplate.findMany({ where: { schoolId }, select: { id: true, classLevels: true } })
    const templateRewrites = templates
      .map((tpl) => ({ id: tpl.id, list: (Array.isArray(tpl.classLevels) ? tpl.classLevels : []) as unknown as string[] }))
      .filter((tpl) => tpl.list.includes(level.name))
      .map((tpl) => ({ id: tpl.id, classLevels: tpl.list.filter((n) => n !== level.name) }))

    const cleared = await prisma.$transaction(async (tx) => {
      const masters = await tx.user.updateMany({
        where: { schoolId, masterClassLevel: level.name }, data: { masterClassLevel: null },
      })
      for (const tpl of templateRewrites) {
        await tx.excelTemplate.update({ where: { id: tpl.id }, data: { classLevels: tpl.classLevels } })
      }
      await tx.classLevel.delete({ where: { id } })
      return { classMasters: masters.count, templates: templateRewrites.length }
    })

    const alsoCleared = [
      cleared.classMasters && `${cleared.classMasters} class master${cleared.classMasters === 1 ? '' : 's'} no longer assigned to it`,
      cleared.templates && `removed from ${cleared.templates} Excel template${cleared.templates === 1 ? '' : 's'}`,
    ].filter(Boolean).join(', ')
    res.json({ message: alsoCleared ? `Class deleted. Also: ${alsoCleared}.` : 'Class deleted', cleared })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
