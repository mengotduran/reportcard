import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

// Whether an admin has unlocked THIS subject+term combo for teachers to edit, once the
// term itself is no longer current — see the schema comment on PastTermMarksGrant.
export const getPastTermGrant = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const subjectId = String(req.query.subjectId ?? '')
    const termId = String(req.query.termId ?? '')
    if (!subjectId || !termId) { res.status(400).json({ message: 'subjectId and termId are required' }); return }

    const grant = await prisma.pastTermMarksGrant.findUnique({ where: { subjectId_termId: { subjectId, termId } } })
    res.json({ granted: !!grant })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Admin-only toggle. Deliberately whole-course, not per-teacher or per-student: a course
// can have more than one teacher, and unlocking a past term is a whole-class decision —
// the admin is granting "teachers may edit this course's marks for this term again", not
// picking one specific person.
export const setPastTermGrant = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const subjectId = String(req.body.subjectId ?? '')
    const termId = String(req.body.termId ?? '')
    const granted = !!req.body.granted
    if (!subjectId || !termId) { res.status(400).json({ message: 'subjectId and termId are required' }); return }

    const [subject, term] = await Promise.all([
      prisma.subject.findFirst({ where: { id: subjectId, schoolId } }),
      prisma.term.findFirst({ where: { id: termId, schoolId } }),
    ])
    if (!subject || !term) { res.status(404).json({ message: 'Subject or term not found' }); return }

    if (granted) {
      await prisma.pastTermMarksGrant.upsert({
        where: { subjectId_termId: { subjectId, termId } },
        update: {},
        create: { schoolId, subjectId, termId, grantedById: req.user!.id },
      })
    } else {
      await prisma.pastTermMarksGrant.deleteMany({ where: { subjectId, termId } })
    }
    res.json({ granted })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
