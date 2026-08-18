import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { isRegistrationClass } from './hndRegistration.controller'
import { stripProgramme } from '../utils/programme'
import { frozenScaleClasses } from '../utils/scaleFreeze'

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

// COMPETENCY (a rating per subject, no marks — nursery/pre-primary) is offered to PRIMARY
// schools only, same shape as resolveProgramme's university-only gate above: a secondary or
// university class sending it is forced back to NUMERIC rather than refused, since it can
// only be a client sending a field that does not apply to it.
const GRADING_MODES = ['NUMERIC', 'COMPETENCY'] as const
type GradingModeValue = (typeof GRADING_MODES)[number]
const resolveGradingMode = (value: unknown, schoolType?: string): GradingModeValue => {
  if (schoolType !== 'PRIMARY') return 'NUMERIC'
  return typeof value === 'string' && (GRADING_MODES as readonly string[]).includes(value.toUpperCase())
    ? (value.toUpperCase() as GradingModeValue)
    : 'NUMERIC'
}

/**
 * The Test ceiling to use when a caller doesn't send one. A flat 30 was the old default and
 * is kept exactly at the standard maxScore of 100 (the familiar 30 Test / 70 Exam), but it
 * is nonsense on a smaller total: the mobile class form posts maxScore 20, which paired with
 * 30 produced a Test worth more than the whole subject and an Exam ceiling of −10. Scaling
 * the same 30% keeps every existing default identical and makes the rest coherent.
 */
const defaultTestMaxScore = (maxScore: number): number =>
  Math.max(1, Math.min(30, Math.round((Number(maxScore) || 0) * 0.3)))

/**
 * The Test/Exam split, checked — PRIMARY only, since it is the only school type that reads
 * `testMaxScore` at all (secondary marks two sequences out of the same maxScore, and a
 * university's 30/70 CA-Exam split is fixed in code).
 *
 * The exam ceiling is DERIVED (`maxScore − testMaxScore`), so the one thing that must hold
 * is that the Test leaves room for an Exam. Nothing enforced this: the web form caps the
 * input at `maxScore − 1`, but a form is a suggestion and the endpoint is what decides — a
 * direct call could set Test 60 of a maxScore 50 and leave every exam mark unenterable
 * against a negative ceiling.
 *
 * Returns an error message, or null when the pair is fine.
 */
function validatePrimaryScale(schoolType: string | undefined, maxScore: unknown, testMaxScore: unknown): string | null {
  if (schoolType !== 'PRIMARY') return null
  const max = Number(maxScore)
  const test = Number(testMaxScore)
  if (!Number.isFinite(max) || max < 2) return 'The subject total must be at least 2, so the Test and the Exam can each be worth something.'
  if (!Number.isFinite(test) || test < 1) return 'The Test must be worth at least 1 mark.'
  if (test >= max) return `The Test (${test}) must be less than the subject total (${max}) — the Exam is what is left over, so there would be nothing to sit.`
  return null
}

export const getClassLevels = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const [levels, frozen, rolls] = await Promise.all([
      prisma.classLevel.findMany({
        where: { schoolId },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      frozenScaleClasses(schoolId),
      // The class roll, in ONE grouped query rather than a count per class. ACTIVE only:
      // this is "how many children are in this class", and a dismissed pupil is not one of
      // them — they are kept on file but are out of rosters, class lists and report runs.
      prisma.student.groupBy({
        by: ['classLevel'],
        where: { schoolId, status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ])
    const rollOf = new Map(rolls.map((r) => [r.classLevel, r._count._all]))
    // `scaleLockedBy` is the closed term that settled this class's assessment settings (its
    // mark totals AND its marks-vs-ratings mode) for the year, or null when they are still
    // free to change. Sent so the Classes form can lock those fields and say why, rather
    // than letting an admin type a number or flip a mode that will be refused.
    // An unlocked class reports null however much history it has — the grant is what counts.
    res.json({
      classLevels: levels.map((l) => ({
        ...l,
        scaleLockedBy: l.scaleUnlockedAt == null ? (frozen.get(l.name) ?? null) : null,
        studentCount: rollOf.get(l.name) ?? 0,
      })),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createClassLevel = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, abbreviation, hasStream, order, maxScore, testMaxScore, feeAmount, registrationFee, hndRegistrationFee, departmentId, programme, gradingMode } = req.body

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

    // Primary only — the Test must leave room for an Exam. Validated against the values
    // actually about to be written, not the raw body, so an omitted field is checked as
    // whatever it will default to rather than skipped.
    const resolvedMaxScore = maxScore ? Number(maxScore) : 20
    const resolvedTestMaxScore = testMaxScore ? Number(testMaxScore) : defaultTestMaxScore(resolvedMaxScore)
    const scaleError = validatePrimaryScale(school?.type, resolvedMaxScore, resolvedTestMaxScore)
    if (scaleError) { res.status(400).json({ message: scaleError }); return }

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
        maxScore: resolvedMaxScore,
        // Primary only in practice (Test/Exam split); harmless default elsewhere since
        // secondary/university never read this field.
        testMaxScore: resolvedTestMaxScore,
        feeAmount: Math.max(0, Math.round(Number(feeAmount)) || 0),
        // Optional, unlike feeAmount: a school that does not charge registration separately
        // never sees the field, and 0 is the honest value for it.
        registrationFee: Math.max(0, Math.round(Number(registrationFee)) || 0),
        hndRegistrationFee: regFee,
        departmentId: resolvedDepartmentId,
        programme: resolveProgramme(programme, school?.type),
        gradingMode: resolveGradingMode(gradingMode, school?.type),
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
    const { name, abbreviation, hasStream, order, maxScore, testMaxScore, feeAmount, registrationFee, hndRegistrationFee, departmentId, programme, gradingMode } = req.body

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

    // Primary only — the Test must leave room for an Exam. This is a PARTIAL update, so the
    // pair is validated as the class will actually end up: a request changing only maxScore
    // is checked against the testMaxScore already on file, which is exactly how you would
    // otherwise cut the total down below a Test that was set earlier.
    const scaleError = validatePrimaryScale(
      school?.type,
      maxScore !== undefined ? Number(maxScore) : level.maxScore,
      testMaxScore !== undefined ? Number(testMaxScore) : level.testMaxScore,
    )
    if (scaleError) { res.status(400).json({ message: scaleError }); return }

    // Once a term of this academic year has closed with published cards, HOW THIS CLASS IS
    // ASSESSED is settled for the year — see frozenScaleClasses. That covers the mark
    // ceilings and the marks-vs-ratings mode alike: a card already handed out states an
    // average and a position, or states ratings and deliberately states neither, and
    // switching afterwards makes the cards still in parents' hands describe a class that no
    // longer exists.
    //
    // Only a genuine CHANGE is refused. Every other edit (rename, fee, order) re-sends these
    // fields untouched, and saving a class without moving them has to keep working.
    const scaleChanged =
      (maxScore !== undefined && Number(maxScore) !== level.maxScore) ||
      (testMaxScore !== undefined && Number(testMaxScore) !== level.testMaxScore)
    // Compared AFTER resolveGradingMode, so a client sending COMPETENCY to a secondary class
    // (where it resolves back to NUMERIC) is not treated as a change and refused for nothing.
    const modeChanged =
      gradingMode !== undefined && resolveGradingMode(gradingMode, school?.type) !== level.gradingMode
    let consumeScaleUnlock = false
    if (scaleChanged || modeChanged) {
      const frozenBy = (await frozenScaleClasses(schoolId)).get(level.name)
      if (frozenBy && level.scaleUnlockedAt == null) {
        // Name the thing they actually tried to move, so the refusal points at the field
        // they just edited rather than at the general idea of assessment settings.
        const what = scaleChanged && modeChanged
          ? 'its mark totals and whether it is marked or rated'
          : modeChanged
            ? 'whether it is marked or rated'
            : 'its mark totals'
        res.status(403).json({
          message: `Report cards for ${level.name} have already been published for ${frozenBy}, so ${what} cannot change until the next academic year. Ask the superadmin to unlock this class if it really has to.`,
        })
        return
      }
      // A grant is spent on the change it was given for, so an unlock left open cannot be
      // used again months later.
      consumeScaleUnlock = level.scaleUnlockedAt != null
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
      ...(testMaxScore !== undefined ? { testMaxScore: Number(testMaxScore) } : {}),
      ...(feeAmount !== undefined ? { feeAmount: Math.max(0, Math.round(Number(feeAmount)) || 0) } : {}),
      ...(registrationFee !== undefined ? { registrationFee: Math.max(0, Math.round(Number(registrationFee)) || 0) } : {}),
      ...(hndRegistrationFee !== undefined
        ? { hndRegistrationFee: !regEligible || hndRegistrationFee === null || hndRegistrationFee === '' ? null : Math.max(0, Math.round(Number(hndRegistrationFee)) || 0) }
        : {}),
      ...(resolvedDepartmentId !== undefined ? { departmentId: resolvedDepartmentId } : {}),
      ...(programme !== undefined ? { programme: resolveProgramme(programme, school?.type) } : {}),
      // Switchable both ways, unlike `programme` above: marks and ratings live in separate
      // columns on ReportEntry (score/seq vs grade), so flipping the mode hides the other
      // one's data rather than destroying it, and flipping back restores it. Existing cards
      // keep whatever average/position they had until their marks are next saved, which is
      // when saveEntries clears them.
      //
      // Free only while the year is still open, though — once a term has closed with
      // published cards this is frozen with the ceilings (see the check above), because the
      // cards already handed out state an average and a position, or deliberately do not.
      ...(gradingMode !== undefined ? { gradingMode: resolveGradingMode(gradingMode, school?.type) } : {}),
      // Spend the superadmin's grant on this change (see the freeze check above).
      ...(consumeScaleUnlock ? { scaleUnlockedAt: null } : {}),
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

// Who's currently on a class's team, independent of whether it has any subjects yet.
// TeacherSubject rows only exist once a class has subjects, so a brand-new class (created,
// staffed, subjects added later — a completely normal order) would otherwise make every
// non-master member invisible, undercounting the team and letting a 4th teacher slip past
// the 1-3 cap. `departments` is primary schools' otherwise-unused equivalent of the
// secondary/university "explicit placement" field (see its own doc comment on the User
// model) — repurposed here to hold class names a teacher is on the team for. Read/written
// as a whole array rather than via array-mutation operators (`has`/`push`) because it's a
// native Postgres String[] online but a JSON column on the SQLite offline build, which
// supports neither — same reasoning as the Excel-template class list elsewhere in this file.
export async function classTeamRoster(schoolId: string, className: string): Promise<{ id: string; departments: string[] }[]> {
  const teachers = await prisma.user.findMany({
    where: { schoolId, isActive: true, role: { in: ['CLASS_TEACHER', 'CLASS_MASTER'] } },
    select: { id: true, departments: true },
  })
  return teachers
    .map((t) => ({ id: t.id, departments: (Array.isArray(t.departments) ? t.departments : []) as string[] }))
    .filter((t) => t.departments.includes(className))
}

/**
 * Primary-only: a class has 1-3 teachers who between them can teach EVERY subject in that
 * class (unlike secondary/university, where one course belongs to one teacher). Replaces the
 * whole team in one call — every subject in the class gets an active TeacherSubject row for
 * every teacher in the new team, and anyone dropped from the team has their rows for THIS
 * class's subjects (only) ended, never deleted, so hours already taught stay on record. The
 * roster itself (see classTeamRoster above) is also kept in sync so it stays correct with or
 * without subjects.
 *
 * Shared by the Classes page's "Set Teachers" modal (setClassTeachers below) AND teacher
 * creation (teacher.controller.ts createTeacher, which builds newIds/masterId itself — a
 * new hire joins as a non-master unless the class had nobody on it yet — then calls this
 * same function so the two paths can never drift apart).
 */
export async function applyClassTeachingTeam(schoolId: string, level: { name: string }, ids: string[], masterId: string): Promise<void> {
  const subjects = await prisma.subject.findMany({ where: { schoolId, classLevel: level.name }, select: { id: true } })
  const subjectIds = subjects.map((s) => s.id)
  const now = new Date()

  if (subjectIds.length > 0) {
    const active = await prisma.teacherSubject.findMany({
      where: { subjectId: { in: subjectIds }, endedAt: null },
      select: { id: true, userId: true, subjectId: true },
    })
    const haveKey = new Set(active.map((a) => `${a.userId}:${a.subjectId}`))

    // Ended, not deleted, same as a normal handover — the hours already taught under this
    // row still belong to whoever taught them.
    const toEnd = active.filter((a) => !ids.includes(a.userId)).map((a) => a.id)
    // One row per (teacher, subject) pair not already active — an existing pair is left
    // completely untouched, so its original startedAt (and the hours already accrued
    // against it) survive a re-save of an unchanged team.
    const toAdd = ids.flatMap((uid) => subjectIds.filter((sid) => !haveKey.has(`${uid}:${sid}`)).map((sid) => ({ userId: uid, subjectId: sid, startedAt: now })))

    await prisma.$transaction([
      ...(toEnd.length ? [prisma.teacherSubject.updateMany({ where: { id: { in: toEnd } }, data: { endedAt: now } })] : []),
      ...(toAdd.length ? [prisma.teacherSubject.createMany({ data: toAdd })] : []),
    ])
  }

  // Roster: add level.name for every kept/new member who doesn't already have it, drop it
  // for anyone on the prior roster who isn't in the new team.
  const priorRoster = await classTeamRoster(schoolId, level.name)
  const priorIds = new Set(priorRoster.map((t) => t.id))
  const droppedFromRoster = priorRoster.filter((t) => !ids.includes(t.id))
  const newToRoster = await prisma.user.findMany({
    where: { id: { in: ids.filter((uid) => !priorIds.has(uid)) } },
    select: { id: true, departments: true },
  })
  await prisma.$transaction([
    ...newToRoster.map((t) => prisma.user.update({
      where: { id: t.id },
      data: { departments: [...(Array.isArray(t.departments) ? t.departments as string[] : []), level.name] },
    })),
    ...droppedFromRoster.map((t) => prisma.user.update({
      where: { id: t.id },
      data: { departments: t.departments.filter((d) => d !== level.name) },
    })),
  ])

  // Demote whoever currently masters THIS class if someone else is taking over — a
  // teacher's mastery of a DIFFERENT class is never touched here.
  const currentMaster = await prisma.user.findFirst({
    where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: level.name, id: { not: masterId } },
  })
  if (currentMaster) {
    await prisma.user.update({ where: { id: currentMaster.id }, data: { role: 'CLASS_TEACHER', masterClassLevel: null } })
  }
  await prisma.user.update({ where: { id: masterId }, data: { role: 'CLASS_MASTER', masterClassLevel: level.name } })
}

/**
 * A teacher is on one class by default — moving them to a different class's team (rather
 * than explicitly opting to manage both, see setClassTeachers' keepDualClass) takes them off
 * whatever OTHER class they were on. Ends their TeacherSubject rows for that other class's
 * subjects and drops it from their roster. If they were that class's master: the sole
 * remaining teacher there auto-becomes master (same "solo = auto master" rule as everywhere
 * else); with 2+ remaining and no master among them, the class is simply left masterless —
 * same as any other team change, the admin revisits Set Teachers there to pick one, this
 * never blocks the move itself. A class down to zero teachers just has the row cleared
 * directly, since applyClassTeachingTeam requires at least one member.
 *
 * Exported: also the direct "Remove from class" action on the Teachers page (see
 * removeTeacherFromClass below), not just the internal move-on-conflict path inside
 * setClassTeachers.
 */
export async function removeTeacherFromClassTeam(schoolId: string, className: string, teacherId: string): Promise<void> {
  const level = await prisma.classLevel.findFirst({ where: { schoolId, name: className }, select: { name: true } })
  if (!level) return // class was renamed/deleted since — nothing left to clean up

  const roster = await classTeamRoster(schoolId, className)
  const remainingIds = roster.map((t) => t.id).filter((tid) => tid !== teacherId)

  if (remainingIds.length === 0) {
    const subjectIds = (await prisma.subject.findMany({ where: { schoolId, classLevel: level.name }, select: { id: true } })).map((s) => s.id)
    if (subjectIds.length) {
      await prisma.teacherSubject.updateMany({ where: { userId: teacherId, subjectId: { in: subjectIds }, endedAt: null }, data: { endedAt: new Date() } })
    }
    const departing = await prisma.user.findUnique({ where: { id: teacherId }, select: { departments: true, masterClassLevel: true } })
    const wasMaster = departing?.masterClassLevel === level.name
    await prisma.user.update({
      where: { id: teacherId },
      data: {
        departments: ((departing?.departments as string[] | undefined) ?? []).filter((d) => d !== level.name),
        ...(wasMaster ? { masterClassLevel: null, role: 'CLASS_TEACHER' } : {}),
      },
    })
    return
  }

  const currentMaster = await prisma.user.findFirst({ where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: level.name }, select: { id: true } })
  const newMasterId = currentMaster && remainingIds.includes(currentMaster.id) ? currentMaster.id : remainingIds[0]
  await applyClassTeachingTeam(schoolId, level, remainingIds, newMasterId)
}

/**
 * A team of 1 auto-becomes that teacher's Class Master. A team of 2 or 3 REQUIRES
 * masterTeacherId in the same request — this is the one thing the admin must decide, so it
 * is refused rather than left to default to whoever happened to be picked first.
 *
 * A teacher already on a DIFFERENT class is, by default, MOVED here (removed from that
 * other class's team) rather than ending up on both — see removeTeacherFromClassTeam.
 * `keepDualClass` is the admin's explicit opt-in for a teacher who genuinely manages two
 * classes at once; anyone whose id is in that list keeps their other-class membership
 * untouched. Capped at 2 classes total, though: a teacher already on 2 OTHER classes can't
 * be kept-both onto a 3rd — refused with a message naming both, so the admin removes them
 * from one first (the Teachers page's own "Remove from class" chips). The frontend is what
 * surfaces the move/keep-both choice before calling this endpoint (it already has every
 * teacher's current classes from GET /teachers).
 */
export const setClassTeachers = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { teacherIds, masterTeacherId, keepDualClass } = req.body as { teacherIds?: unknown; masterTeacherId?: unknown; keepDualClass?: unknown }

    const level = await prisma.classLevel.findFirst({ where: { id, schoolId } })
    if (!level) { res.status(404).json({ message: 'Class not found' }); return }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    if (school?.type !== 'PRIMARY') {
      res.status(400).json({ message: 'A shared class teaching team only applies to primary schools' })
      return
    }

    const ids = Array.isArray(teacherIds) ? [...new Set(teacherIds.map(String))] : []
    if (ids.length < 1 || ids.length > 3) {
      res.status(400).json({ message: 'A class needs between 1 and 3 teachers' })
      return
    }

    const teachers = await prisma.user.findMany({ where: { id: { in: ids }, schoolId, isActive: true }, select: { id: true, name: true, departments: true } })
    if (teachers.length !== ids.length) {
      res.status(400).json({ message: 'One or more selected teachers were not found' })
      return
    }

    // Auto for a solo teacher; otherwise the admin must say which one, every time this is
    // saved — adding a 2nd teacher to a previously-solo class does not let the first one
    // keep the role by default, since that default might not be who the admin actually wants.
    let masterId: string
    if (ids.length === 1) {
      masterId = ids[0]
    } else {
      const requestedMaster = typeof masterTeacherId === 'string' ? masterTeacherId : ''
      if (!requestedMaster || !ids.includes(requestedMaster)) {
        res.status(400).json({ message: 'Choose a class master before saving' })
        return
      }
      masterId = requestedMaster
    }

    // Newcomers to THIS class who are also on a different class: move them (default) or
    // leave them on both if the admin explicitly said so via keepDualClass. A teacher manages
    // at most 2 classes total — keepDualClass on someone already at that cap is refused
    // outright rather than silently pushing them to 3; the admin removes them from one of
    // their existing classes first (the Teachers page's own "Remove from class" chips are
    // exactly that action), then retries. The frontend is expected to steer around this by
    // checking classLevels/departments before ever offering "keep both", but it's enforced
    // here too since that's the real gate.
    const priorRoster = await classTeamRoster(schoolId, level.name)
    const priorIds = new Set(priorRoster.map((t) => t.id))
    const keepSet = new Set(Array.isArray(keepDualClass) ? keepDualClass.map(String) : [])
    const newcomers = teachers
      .filter((teacher) => !priorIds.has(teacher.id))
      .map((teacher) => ({ teacher, otherClasses: ((teacher.departments as string[] | undefined) ?? []).filter((d) => d !== level.name) }))
      .filter((n) => n.otherClasses.length > 0)

    // Validate the whole batch BEFORE touching any other class — a failure partway through
    // must never leave some teachers already moved and others not.
    for (const { teacher, otherClasses } of newcomers) {
      if (keepSet.has(teacher.id) && otherClasses.length >= 2) {
        res.status(400).json({
          message: `${teacher.name} already manages the maximum of 2 classes (${otherClasses.join(', ')}). Remove them from one first.`,
        })
        return
      }
    }
    for (const { teacher, otherClasses } of newcomers) {
      if (keepSet.has(teacher.id)) continue // otherClasses.length === 1 here — within the 2-class cap
      for (const otherClass of otherClasses) {
        await removeTeacherFromClassTeam(schoolId, otherClass, teacher.id)
      }
    }

    await applyClassTeachingTeam(schoolId, level, ids, masterId)

    res.json({ message: 'Class teaching team updated' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * DELETE /api/class-levels/:id/teachers/:teacherId
 * Primary only. Direct "Remove from class" — the Teachers page's own action, rather than
 * making an admin reopen the class's full "Set Teachers" picker just to drop one person.
 * Reuses removeTeacherFromClassTeam, so a solo departure leaves the class with nobody, a
 * departing master hands off to whoever's left (auto if solo, masterless if 2+ with no
 * obvious pick — same as everywhere else this logic runs).
 */
export const removeTeacherFromClass = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const teacherId = String(req.params.teacherId)
    const schoolId = req.user!.schoolId!

    const level = await prisma.classLevel.findFirst({ where: { id, schoolId } })
    if (!level) { res.status(404).json({ message: 'Class not found' }); return }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    if (school?.type !== 'PRIMARY') {
      res.status(400).json({ message: 'A shared class teaching team only applies to primary schools' })
      return
    }

    const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId }, select: { id: true } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    const onThisClass = await classTeamRoster(schoolId, level.name)
    if (!onThisClass.some((t) => t.id === teacherId)) {
      res.status(400).json({ message: 'That teacher is not on this class' })
      return
    }

    await removeTeacherFromClassTeam(schoolId, level.name, teacherId)
    res.json({ message: 'Teacher removed from class' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// The standard Cameroon primary structure, in teaching order. Nothing else in this app
// auto-creates classes for a school (every type's admin adds them by hand) — this is a
// one-click convenience for primary specifically, not a background/on-signup step, so a
// school that doesn't run pre-primary can just delete the ones it doesn't want afterward.
const DEFAULT_PRIMARY_CLASSES = [
  'Pre-Nursery', 'Nursery 1', 'Nursery 2',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
]

/**
 * POST /api/class-levels/seed-defaults
 * Primary only. Creates whichever of the 9 standard classes don't already exist for this
 * school (by name) — safe to click more than once, and safe after the admin has already
 * created some of them by hand. Fee starts at 0, same as any manually-created class (no
 * stock prefill — see School Onboarding Safeguards).
 */
export const seedDefaultPrimaryClasses = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    if (school?.type !== 'PRIMARY') {
      res.status(400).json({ message: 'Default classes are only available for primary schools' })
      return
    }

    const existing = await prisma.classLevel.findMany({ where: { schoolId }, select: { name: true } })
    const existingNames = new Set(existing.map((c) => c.name))
    const toCreate = DEFAULT_PRIMARY_CLASSES
      .map((name, i) => ({ name, order: i }))
      .filter((c) => !existingNames.has(c.name))

    if (toCreate.length === 0) {
      res.json({ message: 'All default classes already exist', created: 0 })
      return
    }

    // Order continues after whatever classes already exist, so a partial backfill doesn't
    // interleave with (or overwrite the ordering of) classes the admin already set up.
    const baseOrder = existing.length
    await prisma.classLevel.createMany({
      data: toCreate.map((c, i) => ({
        schoolId, name: c.name, order: baseOrder + i,
        maxScore: 100, testMaxScore: 30, feeAmount: 0, programme: 'DAY',
      })),
    })

    res.json({ message: `${toCreate.length} class${toCreate.length === 1 ? '' : 'es'} created`, created: toCreate.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
