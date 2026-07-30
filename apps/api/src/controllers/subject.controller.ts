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
        // Current courses only: a teacher should stop seeing one they handed over.
        where: { userId: req.user!.id, endedAt: null },
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

/**
 * What deleting this course would destroy, counted before anything is touched.
 *
 * Same shape as the class-level one: the page cannot see marks, lecturer assignments or
 * timetable slots, and those are exactly what makes the delete irreversible.
 */
export const getSubjectDeleteImpact = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!subject) {
      res.status(404).json({ message: 'Subject not found' })
      return
    }

    const [marks, students, assignments, slots] = await Promise.all([
      prisma.reportEntry.count({ where: { subjectId: id } }),
      // How many students would actually lose a mark, which is the number that means
      // something to an admin. A count of entries alone reads as an abstraction.
      prisma.reportEntry.findMany({
        where: { subjectId: id }, select: { reportCard: { select: { studentId: true } } },
      }).then((rows) => new Set(rows.map((r) => r.reportCard.studentId)).size),
      prisma.teacherSubject.count({ where: { subjectId: id, endedAt: null } }),
      prisma.timetableSlot.count({ where: { subjectId: id } }),
    ])

    res.json({
      name: subject.name,
      classLevel: subject.classLevel,
      term: subject.term,
      marks,
      students,
      assignments,
      slots,
      // A course nobody has been marked on yet is setup, and deleting it loses nothing that
      // cannot be retyped. Once there are marks, the name has to be typed.
      requiresTypedName: marks > 0,
    })
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

    // Marks make this irreversible, so the name has to be typed. Enforced here and not only
    // in the modal: a day and an evening department hold same-named courses, and this is the
    // last thing standing between deleting the one you meant and the one you did not.
    const markCount = await prisma.reportEntry.count({ where: { subjectId: id } })
    if (markCount > 0 && String(req.body?.confirmName ?? '').trim() !== subject.name.trim()) {
      res.status(400).json({
        message: `"${subject.name}" has ${markCount} mark${markCount === 1 ? '' : 's'} entered on it, in ${subject.classLevel}. Confirm by typing the exact course name.`,
        requiresTypedName: true,
      })
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

    // Optional subset. An evening class is created from a day department but need not take
    // every one of its courses, so the caller may name exactly which to bring over. Omitted
    // means all of them, which is what the secondary section-copy flow does.
    const rawIds = req.body.subjectIds
    const subjectIds: string[] | undefined = Array.isArray(rawIds) ? rawIds.map((v: unknown) => String(v)) : undefined
    if (subjectIds && subjectIds.length === 0) { res.json({ copied: 0 }); return }

    const source = await prisma.subject.findMany({
      where: { schoolId, classLevel: fromClassLevel, ...(subjectIds ? { id: { in: subjectIds } } : {}) },
    })
    // Keyed on name AND term, not name alone. A university course belongs to one semester and
    // the same course can run in both, so deduping on the name would silently refuse to copy
    // a Second Semester course because a First Semester one shares its name. Primary and
    // secondary subjects all carry a null term, so this stays a plain name match for them.
    const key = (s: { name: string; term: string | null }) => `${s.name.trim().toLowerCase()}|${s.term ?? ''}`
    const existing = new Set(
      (await prisma.subject.findMany({ where: { schoolId, classLevel: toClassLevel }, select: { name: true, term: true } }))
        .map(key),
    )
    const toCreate = source.filter((s) => !existing.has(key(s)))
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
