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
//
// EVENING is a UNIVERSITY-only section: primary/secondary schools use "private classes"
// for extra/one-off teaching instead (a separate feature), so any non-university caller
// is forced to DAY regardless of what it sends — this is enforced here, not just hidden
// in the web UI, so a direct API call can't create one either.
const PROGRAMMES = ['DAY', 'EVENING'] as const
type ProgrammeValue = (typeof PROGRAMMES)[number]
const resolveProgramme = (value: unknown, schoolType?: string): ProgrammeValue => {
  if (schoolType !== 'UNIVERSITY') return 'DAY'
  return typeof value === 'string' && (PROGRAMMES as readonly string[]).includes(value.toUpperCase())
    ? (value.toUpperCase() as ProgrammeValue)
    : 'DAY'
}

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
        programme: resolveProgramme(programme, school?.type),
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

    // A programme is only ever taken one way, from the day section into a new evening intake,
    // and that happens at creation. Switching an existing evening department back to day
    // would move a whole cohort between sections behind the admin's back, so it is refused:
    // one created in the wrong section is deleted and made again in the right one. The web
    // form already shows the section as read-only here, this is the rule itself.
    if (
      school?.type === 'UNIVERSITY' &&
      level.programme === 'EVENING' &&
      programme !== undefined &&
      resolveProgramme(programme, school?.type) === 'DAY'
    ) {
      res.status(400).json({
        message: 'An evening department cannot be moved to the day section. Create the department in the Day section instead.',
      })
      return
    }

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
      ...(programme !== undefined ? { programme: resolveProgramme(programme, school?.type) } : {}),
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
        // Normalised first. This pattern anchors at the END of the name, which is exactly
        // where the "(Evening)" marker sits, so an evening department matched no level and
        // every matricule it rebuilt lost its level digit (ACC instead of ACC1). Built the
        // same way as `parseProgramAndDept` in student.controller.ts, which already strips.
        const baseName = stripProgramme(updated.name)
        const levelMatch = baseName.match(/- Level (\d+)$/i)
        const levelSuffix = levelMatch ? levelMatch[1] : ''
        const progMatch = baseName.match(/^(HND|Degree)\s/i)
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

/**
 * What deleting this class would destroy, counted BEFORE anything is touched.
 *
 * Exists so the confirmation the admin sees is the truth from the database rather than the
 * page's cached idea of it: the delete cascades through courses into marks, lecturer
 * assignments and timetable slots, none of which the Classes page has loaded.
 */
export const getClassLevelDeleteImpact = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const level = await prisma.classLevel.findFirst({ where: { id, schoolId } })
    if (!level) {
      res.status(404).json({ message: 'Class not found' })
      return
    }

    const subjects = await prisma.subject.findMany({
      where: { schoolId, classLevel: level.name }, select: { id: true },
    })
    const subjectIds = subjects.map((s) => s.id)

    const [students, marks, assignments, slots, classMasters] = await Promise.all([
      prisma.student.count({ where: { schoolId, classLevel: level.name } }),
      subjectIds.length ? prisma.reportEntry.count({ where: { subjectId: { in: subjectIds } } }) : 0,
      subjectIds.length ? prisma.teacherSubject.count({ where: { subjectId: { in: subjectIds }, endedAt: null } }) : 0,
      subjectIds.length ? prisma.timetableSlot.count({ where: { subjectId: { in: subjectIds } } }) : 0,
      prisma.user.count({ where: { schoolId, masterClassLevel: level.name } }),
    ])

    res.json({
      name: level.name,
      programme: level.programme,
      students,
      subjects: subjects.length,
      marks,
      assignments,
      slots,
      classMasters,
      // Students are a hard block, never deleted with the class.
      blocked: students > 0,
      // Always. Even an empty department is worth one deliberate act, because the thing most
      // likely to go wrong here is deleting the right-looking wrong one.
      requiresTypedName: true,
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

    // Students BLOCK, they are never deleted with the class. A student is a person, with a
    // matricule issued, fees paid and marks earned across terms this class never saw, and
    // none of that is the class's to destroy. Moving them to another class first is something
    // the admin can actually do; undoing a deleted roster is not.
    //
    // Named IN FULL, marker and all. Stripping the section (as printing does) made this
    // refusal read as if it were about the day class of the same name.
    const studentCount = await prisma.student.count({ where: { schoolId, classLevel: level.name } })
    if (studentCount > 0) {
      res.status(400).json({
        message: `"${level.name}" still has ${studentCount} student${studentCount === 1 ? '' : 's'}. Move or remove them first, then delete the class.`,
        blockedBy: { students: studentCount },
      })
      return
    }

    // Everything the courses carry goes with them. Prisma cascades TeacherSubject (the
    // lecturers who take them), TimetableSlot (and TeacherAbsence through it, so the slots
    // vanish off every teacher's timetable) and PastTermMarksGrant off `Subject`.
    // ReportEntry does NOT cascade — its relation has no onDelete — so the marks are deleted
    // by hand first, exactly as deleteSubject does, or the delete would fail on the FK.
    const doomedSubjects = await prisma.subject.findMany({
      where: { schoolId, classLevel: level.name }, select: { id: true },
    })
    const subjectIds = doomedSubjects.map((s) => s.id)

    // The name must be typed for EVERY delete, not only the ones carrying marks. A day and an
    // evening department differ by nothing but the marker at the end of the name, so "is this
    // the one I meant" is the question worth forcing, and it is worth forcing before the
    // department turns out to be the wrong one rather than after. Enforced here and not only
    // in the modal, so no other caller can drop a department with a bare DELETE.
    const markCount = subjectIds.length
      ? await prisma.reportEntry.count({ where: { subjectId: { in: subjectIds } } })
      : 0
    if (String(req.body?.confirmName ?? '').trim() !== level.name) {
      const holds = [
        subjectIds.length && `${subjectIds.length} ${courseWord}${subjectIds.length === 1 ? '' : 's'}`,
        markCount && `${markCount} mark${markCount === 1 ? '' : 's'}`,
      ].filter(Boolean).join(' and ')
      res.status(400).json({
        message: holds
          ? `Deleting "${level.name}" would delete its ${holds}. Confirm by typing the exact name.`
          : `Confirm by typing the exact name of "${level.name}".`,
        requiresTypedName: true,
      })
      return
    }

    const templates = await prisma.excelTemplate.findMany({ where: { schoolId }, select: { id: true, classLevels: true } })
    const templateRewrites = templates
      .map((tpl) => ({ id: tpl.id, list: (Array.isArray(tpl.classLevels) ? tpl.classLevels : []) as unknown as string[] }))
      .filter((tpl) => tpl.list.includes(level.name))
      .map((tpl) => ({ id: tpl.id, classLevels: tpl.list.filter((n) => n !== level.name) }))

    const cleared = await prisma.$transaction(async (tx) => {
      let marks = 0, slots = 0, assignments = 0
      if (subjectIds.length) {
        marks = (await tx.reportEntry.deleteMany({ where: { subjectId: { in: subjectIds } } })).count
        // Counted before the cascade takes them, so the message can say what went.
        slots = await tx.timetableSlot.count({ where: { subjectId: { in: subjectIds } } })
        assignments = await tx.teacherSubject.count({ where: { subjectId: { in: subjectIds }, endedAt: null } })
        await tx.subject.deleteMany({ where: { schoolId, classLevel: level.name } })
      }
      const masters = await tx.user.updateMany({
        where: { schoolId, masterClassLevel: level.name }, data: { masterClassLevel: null },
      })
      for (const tpl of templateRewrites) {
        await tx.excelTemplate.update({ where: { id: tpl.id }, data: { classLevels: tpl.classLevels } })
      }
      await tx.classLevel.delete({ where: { id } })
      return {
        subjects: subjectIds.length, marks, slots, assignments,
        classMasters: masters.count, templates: templateRewrites.length,
      }
    })

    const alsoCleared = [
      cleared.subjects && `${cleared.subjects} ${courseWord}${cleared.subjects === 1 ? '' : 's'} deleted`,
      cleared.marks && `${cleared.marks} mark${cleared.marks === 1 ? '' : 's'} deleted`,
      cleared.assignments && `unassigned from ${cleared.assignments} lecturer slot${cleared.assignments === 1 ? '' : 's'}`,
      cleared.slots && `${cleared.slots} timetable slot${cleared.slots === 1 ? '' : 's'} removed`,
      cleared.classMasters && `${cleared.classMasters} class master${cleared.classMasters === 1 ? '' : 's'} no longer assigned to it`,
      cleared.templates && `removed from ${cleared.templates} Excel template${cleared.templates === 1 ? '' : 's'}`,
    ].filter(Boolean).join(', ')
    res.json({ message: alsoCleared ? `Class deleted. Also: ${alsoCleared}.` : 'Class deleted', cleared })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
