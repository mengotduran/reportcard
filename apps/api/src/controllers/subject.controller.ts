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
      // How many students are ticked off each course, so the list can say so without a
      // request per row. Zero on every compulsory course by construction.
      include: { _count: { select: { exclusions: true } } },
    })
    res.json({
      subjects: subjects.map(({ _count, ...s }) => ({ ...s, excludedCount: _count.exclusions })),
      total: subjects.length,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createSubject = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, classLevel, code, coefficient, credit, term, requiredHours, compulsory } = req.body
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
        requiredHours: requiredHours != null && requiredHours !== '' ? Number(requiredHours) : null,
        // Compulsory unless explicitly told otherwise. A university department is a fixed
        // course list, so "everyone takes it" has to stay the default — see SubjectExclusion.
        compulsory: compulsory === undefined ? true : Boolean(compulsory) }
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
    const { name, classLevel, code, coefficient, credit, term, requiredHours, compulsory } = req.body

    const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!subject) {
      res.status(404).json({ message: 'Subject not found' })
      return
    }

    // A compulsory course cannot have anybody ticked off it, so switching one back clears
    // the list. Leaving the rows behind would be worse than untidy: the GPA and the report
    // card decide purely on "is there an exclusion", never on the compulsory flag, so a
    // stale row would go on quietly removing the course from that student while the course
    // itself claimed everyone takes it.
    const clearedExclusions =
      compulsory === true && subject.compulsory === false
        ? (await prisma.subjectExclusion.deleteMany({ where: { subjectId: id } })).count
        : 0

    const updated = await prisma.subject.update({
      where: { id },
      data: {
        name, classLevel,
        ...(code !== undefined ? { code: code?.trim() || null } : {}),
        ...(coefficient !== undefined ? { coefficient: Number(coefficient) } : {}),
        ...(credit !== undefined ? { credit: credit != null && credit !== '' ? Number(credit) : null } : {}),
        ...(term !== undefined ? { term: term != null && term !== '' ? String(term) : null } : {}),
        ...(requiredHours !== undefined ? { requiredHours: requiredHours != null && requiredHours !== '' ? Number(requiredHours) : null } : {}),
        ...(compulsory !== undefined ? { compulsory: Boolean(compulsory) } : {}),
      }
    })
    res.json({ message: 'Subject updated', subject: updated, clearedExclusions })
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

/**
 * Who in this course's class is NOT taking it.
 *
 * Returns the whole class alongside the exclusions, because the screen that uses this is a
 * checklist of the class: sending only the excluded ids would mean a second round trip to
 * find out who they could be.
 */
export const getSubjectExclusions = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!subject) { res.status(404).json({ message: 'Subject not found' }); return }

    // A Subject row is reused every session (it is keyed on class + term name, not on a
    // year), so its entries accumulate across years. Marks must therefore be scoped to the
    // CURRENT session: without it, Linear Algebra reported 26 marked students against a
    // class of 16, the extra 10 being last year's Level 1 who have since moved up. Those
    // stale ids would lock a repeating student out over a mark from a year they are no
    // longer being assessed on.
    const currentSession = (await prisma.term.findFirst({
      where: { schoolId, isCurrent: true }, select: { session: true },
    }))?.session ?? null

    const [students, exclusions, marked] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId, classLevel: subject.classLevel, isActive: true },
        select: { id: true, name: true, studentId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.subjectExclusion.findMany({ where: { subjectId: id }, select: { studentId: true } }),
      // Students who already have a mark for this course THIS session. They can still be
      // ticked off, but doing so deletes the mark, so the screen warns rather than blocks.
      prisma.reportEntry.findMany({
        where: {
          subjectId: id,
          score: { not: null },
          reportCard: { schoolId, ...(currentSession ? { term: { session: currentSession } } : {}) },
        },
        select: { reportCard: { select: { studentId: true } } },
      }),
    ])

    res.json({
      subject: { id: subject.id, name: subject.name, classLevel: subject.classLevel, compulsory: subject.compulsory },
      students,
      excludedStudentIds: exclusions.map((e) => e.studentId),
      markedStudentIds: [...new Set(marked.map((m) => m.reportCard.studentId))],
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** Replace the exclusion list for this course wholesale — the screen edits it as a set. */
export const setSubjectExclusions = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const studentIds: string[] = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : []

    const subject = await prisma.subject.findFirst({ where: { id, schoolId } })
    if (!subject) { res.status(404).json({ message: 'Subject not found' }); return }
    if (subject.compulsory) {
      res.status(400).json({ message: 'This course is compulsory, so every student in the class takes it. Make it optional first.' })
      return
    }

    // Only students of this course's class, and only active ones — anything else would be a
    // row that can never be acted on and would quietly skew the class's own counts.
    const valid = await prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId, classLevel: subject.classLevel, isActive: true },
      select: { id: true, name: true },
    })
    const validIds = new Set(valid.map((s) => s.id))

    // Ticking off a student who already has marks DELETES those marks. A course the student
    // does not take cannot hold a result for them, and leaving the row behind would hide a
    // mark that still exists in the database — the kind of thing that resurfaces a year
    // later as "where did this grade go". The client warns that it cannot be undone; this
    // is the point of no return.
    //
    // Scoped to the CURRENT session only. The Subject row is reused every year, so deleting
    // every entry would reach back into published cards from sessions the student has
    // already completed and been ranked in.
    const currentSession = (await prisma.term.findFirst({
      where: { schoolId, isCurrent: true }, select: { session: true },
    }))?.session ?? null

    const doomed = await prisma.reportEntry.findMany({
      where: {
        subjectId: id,
        reportCard: {
          schoolId,
          studentId: { in: [...validIds] },
          ...(currentSession ? { term: { session: currentSession } } : {}),
        },
      },
      select: { id: true, reportCardId: true },
    })

    await prisma.$transaction([
      ...(doomed.length > 0
        ? [prisma.reportEntry.deleteMany({ where: { id: { in: doomed.map((e) => e.id) } } })]
        : []),
      // Replace as a set: a half-applied change would leave the class partly on the old
      // list and partly on the new one, which nothing downstream expects.
      prisma.subjectExclusion.deleteMany({ where: { subjectId: id } }),
      ...(validIds.size > 0
        ? [prisma.subjectExclusion.createMany({
            data: [...validIds].map((studentId) => ({ schoolId, subjectId: id, studentId })),
            skipDuplicates: true,
          })]
        : []),
    ])

    // Every card that lost an entry now has a stale average, since the average is stored on
    // the card rather than derived on read. Recomputed with the same formula saveEntries
    // uses: Σ(score × coefficient) / Σ(coefficient) over the entries that remain.
    const touchedCardIds = [...new Set(doomed.map((e) => e.reportCardId))]
    for (const cardId of touchedCardIds) {
      const remaining = await prisma.reportEntry.findMany({
        where: { reportCardId: cardId },
        select: { score: true, subject: { select: { coefficient: true } } },
      })
      let totalWeighted = 0, totalCoeff = 0
      for (const e of remaining) {
        if (e.score == null) continue
        const coeff = e.subject?.coefficient ?? 1
        totalWeighted += e.score * coeff
        totalCoeff += coeff
      }
      await prisma.reportCard.update({
        where: { id: cardId },
        data: { totalScore: totalWeighted, average: totalCoeff > 0 ? totalWeighted / totalCoeff : null },
      })
    }

    res.json({
      message: 'Saved',
      excludedStudentIds: [...validIds],
      deletedMarks: doomed.length,
      affectedReportCards: touchedCardIds.length,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
