import { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import prisma, { IS_OFFLINE_BUILD } from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { generateToken } from '../utils/jwt'
import { validateNewPassword } from '../utils/passwordValidation'
import { normalizeGuardianPhone, formatPhoneForDisplay } from '../utils/phone'
import {
  hashToken, generateRawToken, GUARDIAN_INVITE_TTL_MS,
  whatsappInviteUrl, guardianClaimLink,
} from '../utils/guardianInvite'
import { getReportCard } from './reportcard.controller'
import { getStudentFees } from './fees.controller'
import { sendGuardianAccessEmail } from '../utils/email'

// ── Parent scope ────────────────────────────────────────────────────────────
//
// Every route below resolves what a parent may see from their Guardian rows, NEVER from the
// token's schoolId — a parent's User row has schoolId = null on purpose, because a parent can
// have children in two different Schools at once (a primary and a secondary under one
// ParentSchool are separate School rows here).
//
// This is also why parents get their own routes instead of being added to `restrictTo` on the
// existing ones: those are all written against "my school", which for a parent is not a
// meaningful unit. Widening them would have handed a parent the whole school roster.

/** The children this parent is linked to, with the school each one attends. */
async function childrenOf(userId: string) {
  const links = await prisma.guardian.findMany({
    where: { userId },
    select: {
      studentId: true,
      schoolId: true,
      student: {
        select: {
          id: true, name: true, studentId: true, classLevel: true, photo: true, status: true, isActive: true,
        },
      },
      school: { select: { id: true, name: true, type: true, logo: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return links
}

/**
 * Assert this parent may see this child, and return the link. Returns null when they may not,
 * which every caller turns into a 404 rather than a 403: telling a stranger that a student id
 * exists but is not theirs is itself a small leak.
 */
async function assertChild(userId: string, studentId: string) {
  const link = await prisma.guardian.findFirst({
    where: { userId, studentId },
    select: { studentId: true, schoolId: true },
  })
  return link
}

// ── Admin side: issuing an invite ───────────────────────────────────────────

/**
 * POST /api/students/:id/guardian-invite
 *
 * Issues a single-use claim link for this student's guardian and returns it together with a
 * wa.me deep link. Nothing is sent from the server: the admin taps the link, their own
 * WhatsApp opens with the message ready, and they press send. See utils/guardianInvite.ts.
 */
export const createGuardianInvite = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentId = String(req.params.id)

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, name: true, guardianPhone: true, school: { select: { name: true } } },
    })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    // The invite is delivered to this number, so it has to be one WhatsApp can open. Older
    // rows predate the guardianPhone rule and may hold anything at all.
    const phone = normalizeGuardianPhone(student.guardianPhone)
    if ('error' in phone) {
      res.status(400).json({
        message: `This student has no usable guardian phone yet. Add one on their record first. (${phone.error})`,
      })
      return
    }

    const rawToken = generateRawToken()
    // Built BEFORE the row is written: if the origin is misconfigured this throws, and an
    // unusable invite should not be left behind for the admin to wonder about.
    let link: string
    try {
      link = guardianClaimLink(rawToken)
    } catch {
      res.status(500).json({ message: 'The parent portal address is not configured on this server. Contact support.' })
      return
    }

    const invite = await prisma.guardianInvite.create({
      data: {
        schoolId,
        studentId,
        tokenHash: hashToken(rawToken),
        phone: phone.e164,
        expiresAt: new Date(Date.now() + GUARDIAN_INVITE_TTL_MS),
        createdBy: req.user!.id,
      },
      select: { id: true, expiresAt: true },
    })

    res.status(201).json({
      message: 'Invite created',
      inviteId: invite.id,
      expiresAt: invite.expiresAt,
      phone: phone.e164,
      phoneDisplay: formatPhoneForDisplay(phone.e164),
      // The raw token is returned exactly once, here, and is never readable again — only its
      // hash is stored. Re-sending means issuing a new invite.
      link,
      whatsappUrl: whatsappInviteUrl(phone.e164, student.name, student.school.name, link),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * How many invites one bulk call will issue. A class is the unit an admin actually works
 * through — the cap is a guard against a mis-sent body asking for the whole school, not a
 * limit anybody should meet in normal use.
 */
const BULK_INVITE_MAX = 300

/**
 * POST /api/students/guardian-invites/bulk
 * body: { classLevel?: string; studentIds?: string[]; includeLinked?: boolean }
 *
 * Issues one invite per student and hands back a wa.me link for each. Nothing is SENT here
 * either — there is no way to send a WhatsApp message to many numbers at once without a
 * Meta business account, so what this removes is the reopening of a modal per student, not
 * the tap per parent. See utils/guardianInvite.ts.
 *
 * Students who cannot be invited come back in `skipped` with a reason rather than being
 * silently dropped: "40 students, 12 links" needs the other 28 accounted for on screen, or
 * the admin has no idea who still has no parent access.
 */
export const createBulkGuardianInvites = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { classLevel, studentIds, includeLinked } = req.body as {
      classLevel?: string; studentIds?: string[]; includeLinked?: boolean
    }

    const ids = Array.isArray(studentIds) ? studentIds.filter((s) => typeof s === 'string') : []
    const scoped = String(classLevel ?? '').trim()
    // One or the other must be given. Without this, an empty body would mean "every student
    // in the school", which is the one request that should never happen by accident.
    if (ids.length === 0 && (!scoped || scoped === 'all')) {
      res.status(400).json({ message: 'Choose a class first. Links are created one class at a time.' })
      return
    }

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        isActive: true,
        // A dismissed student's guardian is not given new access. One who already claimed
        // theirs keeps it, and their past cards stay readable — see getMyChildren.
        status: 'ACTIVE',
        ...(ids.length > 0 ? { id: { in: ids } } : { classLevel: scoped }),
      },
      select: { id: true, name: true, classLevel: true, guardianPhone: true },
      orderBy: [{ name: 'asc' }],
      take: BULK_INVITE_MAX + 1,
    })

    if (students.length > BULK_INVITE_MAX) {
      res.status(400).json({ message: `That is more than ${BULK_INVITE_MAX} students at once. Pick one class at a time.` })
      return
    }
    if (students.length === 0) {
      res.status(404).json({ message: 'No active students found for that class.' })
      return
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } })

    // One query for every existing link, rather than one per student.
    const linked = new Set(
      (await prisma.guardian.findMany({
        where: { studentId: { in: students.map((s) => s.id) } },
        select: { studentId: true },
      })).map((g) => g.studentId),
    )

    const skipped: { studentId: string; name: string; reason: string }[] = []
    const rows: {
      studentId: string; name: string; className: string; inviteId: string
      phone: string; phoneDisplay: string; link: string; whatsappUrl: string
    }[] = []
    const inviteData: Prisma.GuardianInviteCreateManyInput[] = []
    const expiresAt = new Date(Date.now() + GUARDIAN_INVITE_TTL_MS)

    for (const student of students) {
      if (linked.has(student.id) && !includeLinked) {
        skipped.push({ studentId: student.id, name: student.name, reason: 'A parent already has access' })
        continue
      }
      const phone = normalizeGuardianPhone(student.guardianPhone)
      if ('error' in phone) {
        skipped.push({ studentId: student.id, name: student.name, reason: phone.error })
        continue
      }

      const rawToken = generateRawToken()
      let link: string
      try {
        link = guardianClaimLink(rawToken)
      } catch {
        // Misconfigured origin: fail the whole call rather than writing a batch of invites
        // whose links nobody can open. Same reasoning as the single-student path.
        res.status(500).json({ message: 'The parent portal address is not configured on this server. Contact support.' })
        return
      }

      const inviteId = randomUUID()
      inviteData.push({
        id: inviteId, schoolId, studentId: student.id, tokenHash: hashToken(rawToken),
        phone: phone.e164, expiresAt, createdBy: req.user!.id,
      })
      rows.push({
        studentId: student.id, name: student.name, className: student.classLevel, inviteId,
        phone: phone.e164, phoneDisplay: formatPhoneForDisplay(phone.e164), link,
        whatsappUrl: whatsappInviteUrl(phone.e164, student.name, school?.name ?? '', link),
      })
    }

    // A single insert for the batch. The raw tokens exist only in the response — the rows
    // hold nothing but their hashes, so this response is the one chance to send them.
    if (inviteData.length > 0) await prisma.guardianInvite.createMany({ data: inviteData })

    res.status(201).json({ invites: rows, skipped, total: students.length, expiresAt })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/students/guardian-access?classLevel=
 *
 * The state of parent access across a class, before any link is created: who is linked, who
 * has a live unclaimed invite, and who cannot be invited at all yet. Drives the summary the
 * admin sees when the modal opens.
 */
export const getClassGuardianAccess = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const classLevel = String(req.query.classLevel ?? '').trim()

    const students = await prisma.student.findMany({
      where: {
        schoolId, isActive: true, status: 'ACTIVE',
        ...(classLevel && classLevel !== 'all' ? { classLevel } : {}),
      },
      select: { id: true, name: true, classLevel: true, guardianPhone: true },
      orderBy: [{ classLevel: 'asc' }, { name: 'asc' }],
    })

    const studentIds = students.map((s) => s.id)
    const [links, pending] = await Promise.all([
      prisma.guardian.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true } }),
      prisma.guardianInvite.findMany({
        where: { studentId: { in: studentIds }, claimedAt: null, expiresAt: { gt: new Date() } },
        select: { studentId: true },
      }),
    ])
    const linked = new Set(links.map((l) => l.studentId))
    const hasPending = new Set(pending.map((p) => p.studentId))

    const rows = students.map((s) => {
      const phone = normalizeGuardianPhone(s.guardianPhone)
      return {
        studentId: s.id,
        name: s.name,
        className: s.classLevel,
        linked: linked.has(s.id),
        pendingInvite: hasPending.has(s.id),
        phoneDisplay: 'error' in phone ? null : formatPhoneForDisplay(phone.e164),
        phoneProblem: 'error' in phone ? phone.error : null,
      }
    })

    res.json({
      students: rows,
      counts: {
        total: rows.length,
        linked: rows.filter((r) => r.linked).length,
        ready: rows.filter((r) => !r.linked && !r.phoneProblem).length,
        noPhone: rows.filter((r) => !r.linked && r.phoneProblem).length,
      },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/students/:id/guardian-status — whether a parent already has access, so the admin
 * button can say "Send login link" or "Parent already linked" instead of guessing.
 */
export const getGuardianStatus = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentId = String(req.params.id)

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, guardianPhone: true } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const [linked, pending] = await Promise.all([
      prisma.guardian.findFirst({
        where: { studentId },
        select: { createdAt: true, user: { select: { name: true, username: true, email: true } } },
      }),
      prisma.guardianInvite.findFirst({
        where: { studentId, claimedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, expiresAt: true },
      }),
    ])

    const phone = normalizeGuardianPhone(student.guardianPhone)
    res.json({
      linked: linked
        ? {
            name: linked.user.name,
            // A parent signs in with whichever contact their invite was delivered to, so
            // this is their email when they came through the public sign-up form.
            phone: linked.user.email ?? formatPhoneForDisplay(linked.user.username),
            since: linked.createdAt,
          }
        : null,
      pendingInvite: pending,
      canInvite: !('error' in phone),
      phoneProblem: 'error' in phone ? phone.error : null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// ── Public: redeeming an invite ─────────────────────────────────────────────

/** Look up a live invite by its raw token, or null. Shared by preview and claim. */
async function liveInvite(rawToken: string) {
  if (!rawToken) return null
  return prisma.guardianInvite.findFirst({
    where: { tokenHash: hashToken(rawToken), claimedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true, schoolId: true, studentId: true, phone: true, email: true, expiresAt: true,
      student: { select: { id: true, name: true, classLevel: true } },
      school: { select: { name: true } },
    },
  })
}

/**
 * GET /api/parent/claim/:token — what this link is for, before asking for a password.
 * Public by necessity: the token IS the credential, and the parent has no account yet.
 */
export const previewClaim = async (req: Request, res: Response) => {
  try {
    const invite = await liveInvite(String(req.params.token))
    if (!invite) {
      res.status(404).json({ message: 'This link is no longer valid. Ask the school to send a new one.' })
      return
    }
    // Deliberately thin: enough for the parent to recognise their own child, and nothing a
    // stranger holding a guessed token could mine. No marks, no fees, no phone number.
    res.json({
      studentName: invite.student.name,
      className: invite.student.classLevel,
      schoolName: invite.school.name,
      expiresAt: invite.expiresAt,
      // What they will type to sign in from now on. Shown back to them because holding this
      // token already means holding that mailbox or that phone, so it reveals nothing new,
      // and because "sign in with your email" and "sign in with your phone number" are
      // different instructions depending on how the invite reached them.
      loginWith: invite.email ? 'email' : 'phone',
      loginIdentifier: invite.email ?? formatPhoneForDisplay(invite.phone),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * How many children one claim may pull in besides the invited one.
 *
 * A family with more than this many children at one school does not exist; a contact shared
 * by more than this many students is bad data — a school that filled guardianPhone with its
 * own office number, or with one placeholder for a whole class. Linking those would hand a
 * single "parent" most of the roster, so past the cap only the invited child is linked and
 * the rest go back to needing their own invite.
 */
const SIBLING_LINK_MAX = 10

/**
 * Link the other children this same guardian has at this same school.
 *
 * An invite is issued against one student, so without this a parent with three children
 * needs three links and three claims to see all three. The school itself recorded this
 * contact against those other students, so the match is that school's own assertion, no
 * weaker than the one link being redeemed right now.
 *
 * Deliberately scoped to the SAME school. A parent whose children are at the group's primary
 * and secondary still claims each school separately, so one school's typo can never expose
 * another school's student.
 *
 * Phone matching runs through normalizeGuardianPhone rather than a SQL equality, because the
 * column holds whatever was typed before the rule existed: "+237 670 000 05" and
 * "237670000005" are the same number and a string comparison would miss it.
 */
async function linkMatchingSiblings(
  tx: Prisma.TransactionClient,
  opts: { schoolId: string; userId: string; studentId: string; phone: string | null; email: string | null },
): Promise<number> {
  const { schoolId, userId, studentId, phone, email } = opts
  if (!phone && !email) return 0

  const candidates = await tx.student.findMany({
    where: {
      schoolId,
      id: { not: studentId },
      isActive: true,
      status: 'ACTIVE',
      ...(email ? { guardianEmail: { not: null } } : { guardianPhone: { not: null } }),
    },
    select: { id: true, guardianPhone: true, guardianEmail: true },
  })

  const matches = candidates.filter((s) => {
    if (email) return (s.guardianEmail ?? '').trim().toLowerCase() === email
    const onFile = normalizeGuardianPhone(s.guardianPhone)
    return !('error' in onFile) && onFile.e164 === phone
  })

  if (matches.length === 0 || matches.length > SIBLING_LINK_MAX) return 0

  await tx.guardian.createMany({
    data: matches.map((s) => ({ userId, studentId: s.id, schoolId })),
    // A child this parent already claimed is left alone rather than failing the whole claim.
    skipDuplicates: true,
  })
  return matches.length
}

/**
 * POST /api/parent/claim — redeem the invite and hand back a session.
 *
 * The parent's login identifier is their PHONE NUMBER, stored in User.username. It is already
 * unique and already accepted by the normal login path, so parents need no new sign-in flow.
 * Their User.schoolId stays null; see the note at the top of this file.
 *
 * If an account already exists for that phone (a second child, possibly at another school),
 * the existing account is reused and simply gains another Guardian row. The supplied password
 * must match the existing one in that case, so an invite cannot be used to reset a stranger's
 * password by claiming a child of theirs.
 */
export const claimInvite = async (req: Request, res: Response) => {
  try {
    const { token, password, name } = req.body as { token?: string; password?: string; name?: string }

    const invite = await liveInvite(String(token ?? ''))
    if (!invite) {
      res.status(404).json({ message: 'This link is no longer valid. Ask the school to send a new one.' })
      return
    }

    const passwordError = validateNewPassword(String(password ?? ''))
    if (passwordError) {
      res.status(400).json({ message: passwordError })
      return
    }

    // The invite is keyed to whichever contact it was delivered to, and that contact becomes
    // the login identifier: an emailed invite makes an email account, a WhatsApp or printed
    // one makes a phone account. Both are already unique columns the normal login path
    // accepts, so neither needs a sign-in flow of its own.
    const existing = invite.email
      ? await prisma.user.findUnique({ where: { email: invite.email } })
      : await prisma.user.findUnique({ where: { username: invite.phone! } })

    if (existing && existing.role !== 'PARENT') {
      // The contact collides with a staff account. Vanishingly unlikely for a phone
      // (usernames are chosen words, not digits) but an email is exactly what staff sign in
      // with, so a parent who is also a teacher at the school lands here. Either way it must
      // not silently attach a child to a staff account.
      res.status(409).json({ message: 'This contact is already in use by another account. Ask the school for help.' })
      return
    }

    let siblingsLinked = 0
    const result = await prisma.$transaction(async (tx) => {
      let user = existing
      if (user) {
        // Returning parent adding another child: prove it is them before extending access.
        const matches = await bcrypt.compare(String(password), user.password)
        if (!matches) {
          return {
            error: invite.email
              ? 'You already have an account for this email address. Enter your existing password to add this child.' as const
              : 'You already have an account for this phone number. Enter your existing password to add this child.' as const,
          }
        }
      } else {
        user = await tx.user.create({
          data: {
            name: (name ?? '').trim() || `Parent of ${invite.student.name}`,
            ...(invite.email ? { email: invite.email } : { username: invite.phone! }),
            password: await bcrypt.hash(String(password), 10),
            role: 'PARENT',
            // Null on purpose: a parent is not a member of one school. See the top of this file.
            schoolId: null,
            passwordSetAt: new Date(),
          },
        })
      }

      await tx.guardian.upsert({
        where: { userId_studentId: { userId: user.id, studentId: invite.studentId } },
        create: { userId: user.id, studentId: invite.studentId, schoolId: invite.schoolId },
        update: {},
      })

      // Siblings at the same school, so one link covers the whole family.
      siblingsLinked = await linkMatchingSiblings(tx, {
        schoolId: invite.schoolId,
        userId: user.id,
        studentId: invite.studentId,
        phone: invite.phone,
        email: invite.email,
      })

      await tx.guardianInvite.update({
        where: { id: invite.id },
        data: { claimedAt: new Date(), claimedBy: user.id },
      })

      return { user }
    })

    if ('error' in result) {
      res.status(401).json({ message: result.error })
      return
    }

    const user = result.user!
    res.status(201).json({
      message: 'Account ready',
      // Everything this claim gave access to: the invited child plus any sibling the school
      // has the same contact for.
      childrenLinked: 1 + siblingsLinked,
      token: generateToken({ id: user.id, role: user.role, schoolId: null }),
      user: {
        id: user.id, name: user.name, email: user.email, username: user.username,
        role: user.role, masterClassLevel: null, preferredLanguage: user.preferredLanguage,
      },
      school: null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// ── Parent-facing reads ─────────────────────────────────────────────────────

/** GET /api/parent/children */
export const getMyChildren = async (req: AuthRequest, res: Response) => {
  try {
    const links = await childrenOf(req.user!.id)

    // One query for every child's published-card count, rather than one per child.
    const studentIds = links.map((l) => l.studentId)
    const cards = studentIds.length
      ? await prisma.reportCard.findMany({
          where: { studentId: { in: studentIds }, status: 'PUBLISHED' },
          select: { studentId: true, updatedAt: true },
        })
      : []

    res.json({
      children: links.map((l) => {
        const mine = cards.filter((c) => c.studentId === l.studentId)
        return {
          id: l.student.id,
          name: l.student.name,
          studentCode: l.student.studentId,
          className: l.student.classLevel,
          photo: l.student.photo,
          // A dismissed or disabled student still has past cards worth reading, so they are
          // shown rather than hidden — flagged so the parent understands the status.
          active: l.student.isActive && l.student.status === 'ACTIVE',
          status: l.student.status,
          school: l.school,
          publishedCards: mine.length,
          lastCardAt: mine.length ? mine.map((c) => c.updatedAt).sort().reverse()[0] : null,
        }
      }),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** GET /api/parent/children/:studentId/report-cards — PUBLISHED only, newest first. */
export const getChildReportCards = async (req: AuthRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId)
    const link = await assertChild(req.user!.id, studentId)
    if (!link) {
      res.status(404).json({ message: 'Not found' })
      return
    }

    const cards = await prisma.reportCard.findMany({
      // `status: 'PUBLISHED'` is hardcoded, never taken from a query parameter. A draft card
      // is a work in progress the school has not stood behind yet.
      where: { studentId, status: 'PUBLISHED' },
      select: {
        id: true, average: true, position: true, decision: true, status: true, updatedAt: true,
        student: { select: { classLevel: true } },
        term: { select: { id: true, name: true, session: true, startDate: true } },
      },
      orderBy: [{ term: { startDate: 'desc' } }],
    })

    // "3rd" means little on its own; "3rd of 42" is what a parent is actually asking. There is
    // no stored class size on ReportCard, so it is counted per term over the same class — one
    // grouped query for every card rather than one per card.
    const classLevel = cards[0]?.student.classLevel
    const sizes = classLevel
      ? await prisma.reportCard.groupBy({
          by: ['termId'],
          where: {
            termId: { in: cards.map((c) => c.term.id) },
            status: 'PUBLISHED',
            student: { classLevel },
          },
          _count: { _all: true },
        })
      : []
    const sizeByTerm = new Map(sizes.map((s) => [s.termId, s._count._all]))

    res.json({
      reportCards: cards.map(({ student, ...c }) => ({
        ...c,
        totalStudents: sizeByTerm.get(c.term.id) ?? null,
      })),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/parent/children/:studentId/report-cards/:cardId
 *
 * Delegates to the school-side getReportCard once the card is proven to be this parent's
 * child's AND published. That handler already computes class subject statistics, CGPA and the
 * year-end figures; a parallel implementation here would drift from it, and a report card
 * that shows a parent different numbers than the school sees is the worst possible bug.
 */
export const getChildReportCard = async (req: AuthRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId)
    const cardId = String(req.params.cardId)

    const link = await assertChild(req.user!.id, studentId)
    if (!link) {
      res.status(404).json({ message: 'Not found' })
      return
    }

    const card = await prisma.reportCard.findFirst({
      where: { id: cardId, studentId, status: 'PUBLISHED' },
      select: { id: true, schoolId: true },
    })
    if (!card) {
      res.status(404).json({ message: 'Report card not found' })
      return
    }

    // Hand the downstream handler the child's school, not the parent's (they have none).
    req.user = { ...req.user!, schoolId: card.schoolId }
    req.params = { ...req.params, id: cardId }
    return getReportCard(req, res)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/parent/children/:studentId/fees
 *
 * Same delegation as above, for the same reason: the HND two-year scoping in getStudentFees is
 * subtle, and a parent must never be shown a different balance than the bursar.
 */
export const getChildFees = async (req: AuthRequest, res: Response) => {
  try {
    const studentId = String(req.params.studentId)
    const link = await assertChild(req.user!.id, studentId)
    if (!link) {
      res.status(404).json({ message: 'Not found' })
      return
    }

    req.user = { ...req.user!, schoolId: link.schoolId }
    req.params = { ...req.params, studentId }
    return getStudentFees(req, res)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// ── Parents asking for access themselves ────────────────────────────────────
//
// The other direction to the invite flow above: a parent who found the site on their own
// rather than being sent a link. See the GuardianAccessRequest model for why it is a stored
// request rather than an instant yes/no.
//
// The one rule that shapes everything here: this server can SEND to an email address, and
// cannot send to a phone. So an email that already matches the student's record is verified
// and delivered without a human, and everything else waits in a queue for the school. A
// parent typing a contact is not proof of anything; receiving at it is.

/** How long a self-service link lives. Far shorter than an admin-issued one (30 days),
 *  because it is sent the moment it is asked for and nobody carries it in a pocket. */
const SELF_SERVICE_INVITE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Crude per-IP throttle, held in memory.
 *
 * Deliberately not a package and not a shared store: one API container serves everything
 * (see the deployment notes), a restart clearing the counters costs nothing, and the point
 * is only to stop a script working through a class list. If this ever runs on more than one
 * instance it becomes per-instance rather than global, which is a weaker limit but not a
 * broken one.
 */
const requestHits = new Map<string, number[]>()
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 8

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (requestHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  requestHits.set(ip, hits)
  // Swept here rather than on a timer so an idle server holds nothing.
  if (requestHits.size > 5000) {
    for (const [key, times] of requestHits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) requestHits.delete(key)
    }
  }
  return hits.length > RATE_MAX
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * GET /api/parent/schools — the picker on the public sign-up form.
 *
 * Only schools a parent could actually be matched against: active, and holding at least one
 * active student. A school with an empty roster cannot match any child by definition, so
 * listing it produces requests that land in a queue with nothing to resolve them against —
 * and two schools sharing a name (a real one and a mistyped duplicate) are indistinguishable
 * to a parent, who then picks the wrong one and hears nothing back.
 */
export const listSchoolsForSignup = async (_req: Request, res: Response) => {
  try {
    const schools = await prisma.school.findMany({
      where: {
        isActive: true,
        students: { some: { isActive: true, status: 'ACTIVE' } },
      },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    })
    res.json({ schools })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * GET /api/parent/schools/:id/classes — the class picker.
 *
 * Class names only, nothing about who is in them. A school's class list is on its
 * brochures and on every report card it prints, so this is not where the privacy line is.
 */
export const listClassesForSignup = async (req: Request, res: Response) => {
  try {
    const schoolId = String(req.params.id)
    const classes = await prisma.classLevel.findMany({
      where: { schoolId },
      select: { name: true },
      orderBy: { order: 'asc' },
    })
    res.json({ classes: classes.map((c) => c.name) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/parent/request-access — the public sign-up form.
 *
 * Answers identically whatever happens: match, no match, wrong school, unknown child. The
 * form would otherwise be an oracle for "is this number the guardian of that child", which
 * anyone could work through a class list with. The parent learns the outcome from their
 * inbox, or from the school; never from this response.
 */
export const requestGuardianAccess = async (req: Request, res: Response) => {
  const SAME_ANSWER = {
    message: 'Thank you. If those details match our records, a link is on its way to you. If not, the school will get in touch.',
  }

  try {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim()
    if (rateLimited(ip)) {
      res.status(429).json({ message: 'Too many attempts. Please wait an hour and try again, or contact the school.' })
      return
    }

    const { schoolId, studentName, classLevel, contact, parentName } = req.body as {
      schoolId?: string; studentName?: string; classLevel?: string; contact?: string; parentName?: string
    }
    const typedName = String(studentName ?? '').trim()
    const typedClass = String(classLevel ?? '').trim()
    const typedContact = String(contact ?? '').trim()

    if (!schoolId || !typedName || !typedClass || !typedContact) {
      res.status(400).json({ message: 'Fill in the school, your child\'s name, their class and your contact.' })
      return
    }

    // Email or phone, decided by shape. Rejected here rather than silently swallowed: a
    // typo in your own contact is the one thing worth telling the person about, since it
    // reveals nothing about the school's records.
    const isEmail = typedContact.includes('@')
    let email: string | null = null
    let phone: string | null = null
    if (isEmail) {
      if (!EMAIL_SHAPE.test(typedContact)) {
        res.status(400).json({ message: 'That email address does not look right.' })
        return
      }
      email = typedContact.toLowerCase()
    } else {
      const normalized = normalizeGuardianPhone(typedContact)
      if ('error' in normalized) {
        res.status(400).json({ message: normalized.error })
        return
      }
      phone = normalized.e164
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } })
    if (!school) { res.json(SAME_ANSWER); return }

    // `mode: 'insensitive'` is Postgres-only; SQLite's LIKE is already case-insensitive for
    // ASCII and passing the flag there throws. Same branch as everywhere else in this repo.
    const nameWhere = IS_OFFLINE_BUILD
      ? { equals: typedName }
      : { equals: typedName, mode: 'insensitive' as const }
    const candidates = await prisma.student.findMany({
      where: { schoolId: school.id, classLevel: typedClass, isActive: true, status: 'ACTIVE', name: nameWhere },
      select: { id: true, name: true, guardianEmail: true, guardianPhone: true },
    })

    // Exactly one, or nobody knows who is meant. Two children sharing a name in one class is
    // uncommon but real, and guessing between them could hand one family the other's marks.
    const student = candidates.length === 1 ? candidates[0] : null

    let matched = false
    if (student) {
      matched = email
        ? (student.guardianEmail ?? '').trim().toLowerCase() === email
        : (() => {
            const onFile = normalizeGuardianPhone(student.guardianPhone)
            return !('error' in onFile) && onFile.e164 === phone
          })()
    }

    // Only a matched EMAIL can be delivered without a human: the address was on the record
    // before today, so reaching it proves the requester reads that mailbox. A matched phone
    // is just as good a check, but nothing here can send to it, so it waits for the school.
    const canSendNow = Boolean(student && matched && email)

    const request = await prisma.guardianAccessRequest.create({
      data: {
        schoolId: school.id,
        studentId: student?.id ?? null,
        studentName: typedName,
        classLevel: typedClass,
        parentName: String(parentName ?? '').trim() || null,
        email, phone, matched,
        status: canSendNow ? 'SENT' : 'PENDING',
        resolvedAt: canSendNow ? new Date() : null,
      },
      select: { id: true },
    })

    if (canSendNow && student && email) {
      const rawToken = generateRawToken()
      let link: string
      try {
        link = guardianClaimLink(rawToken)
      } catch {
        // Origin misconfigured. The request stays on the books, but as something the school
        // has to deal with rather than a delivery that silently never happened.
        await prisma.guardianAccessRequest.update({
          where: { id: request.id },
          data: { status: 'PENDING', resolvedAt: null },
        })
        res.json(SAME_ANSWER)
        return
      }

      await prisma.guardianInvite.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          tokenHash: hashToken(rawToken),
          email,
          expiresAt: new Date(Date.now() + SELF_SERVICE_INVITE_TTL_MS),
          // Self-issued: there is no admin behind it, so the request itself is the author.
          createdBy: request.id,
        },
      })

      await sendGuardianAccessEmail({
        to: email,
        claimUrl: link,
        studentName: student.name,
        schoolName: school.name,
      })
    }

    res.json(SAME_ANSWER)
  } catch (error) {
    console.error(error)
    // Even a server error answers the same way, so a crash cannot become a signal either.
    res.json(SAME_ANSWER)
  }
}

// ── The school's side of those requests ─────────────────────────────────────

/** GET /api/students/guardian-requests?status=PENDING */
export const listGuardianRequests = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const status = String(req.query.status ?? 'PENDING').toUpperCase()
    const where = {
      schoolId,
      ...(status === 'ALL' ? {} : { status: status as 'PENDING' | 'SENT' | 'REJECTED' }),
    }

    const requests = await prisma.guardianAccessRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, studentName: true, classLevel: true, parentName: true,
        email: true, phone: true, matched: true, status: true, createdAt: true,
        student: { select: { id: true, name: true, classLevel: true, guardianPhone: true, guardianEmail: true } },
      },
    })

    res.json({
      requests: requests.map((r) => ({
        ...r,
        phoneDisplay: r.phone ? formatPhoneForDisplay(r.phone) : null,
        // Whether this request can be settled at all: a request whose child could not be
        // resolved needs the admin to fix the name first, not to approve it.
        resolvable: r.student !== null,
      })),
      pending: await prisma.guardianAccessRequest.count({ where: { schoolId, status: 'PENDING' } }),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/students/guardian-requests/:id/approve
 *
 * Issues the invite and, when the student's record has no contact of that kind yet, writes
 * the parent's onto it. That last part is the quiet win: a school with an empty guardian
 * phone column fills it in as parents come forward, one approval at a time, instead of
 * chasing a thousand numbers up front.
 *
 * Emails it directly; a phone request comes back with a wa.me link for the admin to tap,
 * because nothing here can send a WhatsApp message.
 */
export const approveGuardianRequest = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const id = String(req.params.id)

    const request = await prisma.guardianAccessRequest.findFirst({
      where: { id, schoolId },
      select: {
        id: true, status: true, email: true, phone: true, studentId: true,
        student: { select: { id: true, name: true, guardianPhone: true, guardianEmail: true } },
        school: { select: { name: true } },
      },
    })
    if (!request) { res.status(404).json({ message: 'Request not found' }); return }
    if (request.status !== 'PENDING') { res.status(400).json({ message: 'This request has already been dealt with.' }); return }

    // The admin may have corrected the student on the way in, for a request whose typed name
    // matched nobody or matched two children.
    const studentId = String(req.body?.studentId ?? request.studentId ?? '')
    if (!studentId) {
      res.status(400).json({ message: 'Choose which student this request is for before approving it.' })
      return
    }
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: { id: true, name: true, guardianPhone: true, guardianEmail: true },
    })
    if (!student) { res.status(404).json({ message: 'Student not found' }); return }

    const rawToken = generateRawToken()
    let link: string
    try {
      link = guardianClaimLink(rawToken)
    } catch {
      res.status(500).json({ message: 'The parent portal address is not configured on this server. Contact support.' })
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.guardianInvite.create({
        data: {
          schoolId, studentId: student.id, tokenHash: hashToken(rawToken),
          email: request.email, phone: request.phone,
          expiresAt: new Date(Date.now() + SELF_SERVICE_INVITE_TTL_MS),
          createdBy: req.user!.id,
        },
      })

      // Fill the gap, never overwrite: an admin approving a request is vouching for the
      // parent, not correcting the record. A student who already has a contact of that kind
      // keeps it, and any change stays a deliberate edit on the student's own form.
      const fill: { guardianPhone?: string; guardianEmail?: string } = {}
      if (request.phone && !student.guardianPhone) fill.guardianPhone = request.phone
      if (request.email && !student.guardianEmail) fill.guardianEmail = request.email
      if (Object.keys(fill).length > 0) {
        await tx.student.update({ where: { id: student.id }, data: fill })
      }

      await tx.guardianAccessRequest.update({
        where: { id: request.id },
        data: { status: 'SENT', studentId: student.id, resolvedAt: new Date(), resolvedBy: req.user!.id },
      })
    })

    if (request.email) {
      await sendGuardianAccessEmail({
        to: request.email,
        claimUrl: link,
        studentName: student.name,
        schoolName: request.school.name,
      })
      res.json({ message: `Link emailed to ${request.email}`, sent: 'email' as const })
      return
    }

    res.json({
      message: 'Link ready to send',
      sent: 'whatsapp' as const,
      link,
      phoneDisplay: formatPhoneForDisplay(request.phone),
      whatsappUrl: whatsappInviteUrl(request.phone!, student.name, request.school.name, link),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** POST /api/students/guardian-requests/:id/reject */
export const rejectGuardianRequest = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const id = String(req.params.id)
    const { count } = await prisma.guardianAccessRequest.updateMany({
      where: { id, schoolId, status: 'PENDING' },
      data: { status: 'REJECTED', resolvedAt: new Date(), resolvedBy: req.user!.id },
    })
    if (count === 0) { res.status(404).json({ message: 'Request not found' }); return }
    res.json({ message: 'Request dismissed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
