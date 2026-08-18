import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma, { IS_OFFLINE_BUILD } from '../config/prisma'
import { generateToken } from '../utils/jwt'
import { AuthRequest } from '../middleware/auth'
import { generateRawToken, hashToken, INVITE_TOKEN_TTL_MS } from '../utils/resetToken'
import { sendPasswordSetupEmail } from '../utils/email'
import { validateNewPassword, validateUsername } from '../utils/passwordValidation'
import { normalizeGuardianPhone } from '../utils/phone'

// Register a new school + admin account
export const registerSchool = async (req: Request, res: Response) => {
  try {
    const { schoolName, schoolType, schoolEmail, schoolPhone, schoolAddress, subdomain, adminName, adminEmail, adminPassword, language } = req.body

    // Check if school email or subdomain already exists
    const existingSchool = await prisma.school.findFirst({
      where: { OR: [{ email: schoolEmail }, { subdomain }] }
    })
    if (existingSchool) {
      res.status(400).json({ message: 'School email or subdomain already exists' })
      return
    }

    // Check if admin email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (existingUser) {
      res.status(400).json({ message: 'Admin email already exists' })
      return
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12)

    // Create school and admin together
    const school = await prisma.school.create({
      data: {
        name: schoolName,
        type: schoolType,
        language: language === 'FR' ? 'FR' : 'EN',
        email: schoolEmail,
        phone: schoolPhone,
        address: schoolAddress,
        subdomain: subdomain.toLowerCase(),
        users: {
          create: {
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            role: 'SCHOOL_ADMIN',
          }
        }
      },
      include: { users: true }
    })

    const admin = school.users[0]
    const token = generateToken({ id: admin.id, role: admin.role, schoolId: school.id })

    res.status(201).json({
      message: 'School registered successfully',
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      school: {
        id: school.id,
        name: school.name,
        type: school.type,
        subdomain: school.subdomain,
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Login
export const login = async (req: Request, res: Response) => {
  try {
    // Body key stays `email` for every existing caller — treated as "identifier" now that
    // an account with no email logs in with `username` instead (see the User model). Email
    // is tried first since that's still the common case; the username lookup only runs if
    // it misses, so this costs a second query only for username-based logins.
    const { email: identifier, password } = req.body

    let user = (await prisma.user.findUnique({
      where: { email: identifier },
      include: { school: true },
    })) ?? (await prisma.user.findUnique({
      where: { username: identifier },
      include: { school: true },
    }))

    // Third try: the same address in lower case. Postgres compares TEXT exactly, so an
    // account stored as "parent@example.com" is not found by "Parent@Example.com" — and a
    // phone keyboard capitalises the first letter for you. Addresses are stored lower-cased
    // wherever this codebase writes them, so folding the typed one is enough.
    if (!user && typeof identifier === 'string' && identifier.includes('@')) {
      const lowered = identifier.trim().toLowerCase()
      if (lowered !== identifier) {
        user = await prisma.user.findUnique({ where: { email: lowered }, include: { school: true } })
      }
    }

    // Fourth try: the identifier read as a phone number.
    //
    // A parent's username IS their phone number, stored as E.164 digits with no "+"
    // ("237677123456"). Nobody types it that way — they type 677123456, or 0677123456, or
    // the "+237 677 123 456" that the school printed on their slip, and an exact-match
    // lookup turns every one of those into "Invalid credentials" on an account that exists
    // and whose password is right. Normalising here means the phone is one identity however
    // it is written, exactly as it already is on the Student record.
    //
    // Only reached when both exact lookups miss, so a staff login costs nothing extra and a
    // literal username always wins: a member of staff who chose "677123456" as their
    // username is found by the exact lookup above before this branch is ever considered.
    if (!user) {
      const phone = normalizeGuardianPhone(String(identifier ?? ''))
      if (!('error' in phone) && phone.e164 !== identifier) {
        user = await prisma.user.findUnique({
          where: { username: phone.e164 },
          include: { school: true },
        })
      }
    }

    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    const token = generateToken({
      id: user.id,
      role: user.role,
      schoolId: user.schoolId,
    })

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        masterClassLevel: user.masterClassLevel ?? null,
        preferredLanguage: user.preferredLanguage,
      },
      school: user.school ?? null
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Get logged in user
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { school: true }
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      masterClassLevel: user.masterClassLevel ?? null,
      preferredLanguage: user.preferredLanguage,
      school: user.school,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Update preferred UI language for the logged-in user
export const updatePreferredLanguage = async (req: AuthRequest, res: Response) => {
  try {
    const { language } = req.body
    if (language !== 'EN' && language !== 'FR') {
      res.status(400).json({ message: 'language must be EN or FR' }); return
    }
    await prisma.user.update({ where: { id: req.user!.id }, data: { preferredLanguage: language } })
    res.json({ preferredLanguage: language })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Update the logged-in user's own login email (their personal account email,
// distinct from the school's institutional email in School Settings).
export const updateMyEmail = async (req: AuthRequest, res: Response) => {
  try {
    const trimmed = String(req.body.email ?? '').trim().toLowerCase()
    if (!trimmed) { res.status(400).json({ message: 'Email is required' }); return }

    const current = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true, password: true } })
    if (!current) { res.status(404).json({ message: 'User not found' }); return }

    // CHANGING an address asks for the current password; adding the FIRST one does not.
    //
    // Whoever owns the login email owns password recovery, so an unattended phone was
    // enough to move an account to a stranger's address and lock its owner out. Adding a
    // first email carries no such risk — there was nothing to take over, the account had a
    // username and no recovery path at all — and that is the flow this feature exists to
    // make easy, so it stays frictionless.
    if (current.email && current.email !== trimmed) {
      const currentPassword = String(req.body.currentPassword ?? '')
      if (!currentPassword) {
        res.status(400).json({ message: 'Enter your current password to change the email you sign in with.' })
        return
      }
      if (!(await bcrypt.compare(currentPassword, current.password))) {
        res.status(401).json({ message: 'Current password is incorrect' })
        return
      }
    }

    const updated = await prisma.user.update({ where: { id: req.user!.id }, data: { email: trimmed } })
    res.json({
      id: updated.id, name: updated.name, email: updated.email, role: updated.role,
      masterClassLevel: updated.masterClassLevel ?? null, preferredLanguage: updated.preferredLanguage,
    })
  } catch (error: any) {
    if (error?.code === 'P2002') { res.status(409).json({ message: 'That email is already in use by another account' }); return }
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Self-service: a logged-in user changes their own password, proving they
// already know the current one. No email involved, so unlike forgot-password
// this works the same in the offline SQLite build as it does in the cloud.
export const changeMyPassword = async (req: AuthRequest, res: Response) => {
  try {
    const currentPassword = String(req.body.currentPassword ?? '')
    const newPassword = String(req.body.newPassword ?? '')
    if (!currentPassword) { res.status(400).json({ message: 'Current password is required' }); return }
    const passwordError = validateNewPassword(newPassword)
    if (passwordError) { res.status(400).json({ message: passwordError }); return }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) { res.status(404).json({ message: 'User not found' }); return }

    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) { res.status(401).json({ message: 'Current password is incorrect' }); return }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
    res.json({ message: 'Password changed successfully' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Superadmin self-recovery — no auth, uses SUPERADMIN_SECRET
export const resetSuperAdminPassword = async (req: Request, res: Response) => {
  try {
    const { secretKey, email, newPassword } = req.body
    if (!secretKey || secretKey !== process.env.SUPERADMIN_SECRET) {
      res.status(403).json({ message: 'Invalid secret key' })
      return
    }
    if (!email) {
      res.status(400).json({ message: 'Email is required' })
      return
    }
    const passwordError = validateNewPassword(String(newPassword ?? ''))
    if (passwordError) { res.status(400).json({ message: passwordError }); return }
    const superAdmin = await prisma.user.findFirst({ where: { email, role: 'SUPERADMIN' } })
    if (!superAdmin) { res.status(404).json({ message: 'No superadmin found with that email' }); return }
    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: superAdmin.id }, data: { password: hashed } })
    res.json({ message: 'Password reset successfully', email: superAdmin.email })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Reset any user's password (superadmin → admins; admin/VP → teachers in same school)
export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.params.userId)
    const requesterRole = req.user!.role
    const requesterSchoolId = req.user!.schoolId

    const target = await prisma.user.findUnique({ where: { id: userId } })
    if (!target) { res.status(404).json({ message: 'User not found' }); return }

    if (requesterRole === 'SUPERADMIN') {
      if (target.role === 'SUPERADMIN') {
        res.status(403).json({ message: 'Cannot reset another superadmin\'s password' }); return
      }
    } else {
      // SCHOOL_ADMIN / VICE_PRINCIPAL
      if (target.schoolId !== requesterSchoolId) {
        res.status(403).json({ message: 'User not in your school' }); return
      }
      const teacherRoles = ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL']
      if (!teacherRoles.includes(target.role)) {
        res.status(403).json({ message: 'Can only reset passwords for teachers and vice principals' }); return
      }
    }

    // Offline builds never have email delivery, and a username-based account (no email on
    // file) has nowhere to receive a setup link either way — both are forced onto the
    // direct-set branch regardless of what the caller asked for. Someone who still has an
    // email ON FILE but has lost access to that inbox (changed jobs, forgot ITS password,
    // account deleted…) is otherwise a dead end: re-sending a link to an address they can't
    // reach doesn't help. `mode: 'direct'` is the admin's explicit escape hatch for exactly
    // that case — only meaningful when an email exists, since it's ignored (always direct)
    // when there's none to begin with.
    const wantsDirect = IS_OFFLINE_BUILD || !target.email || req.body.mode === 'direct'
    if (wantsDirect) {
      const { newPassword } = req.body
      const passwordError = validateNewPassword(String(newPassword ?? ''))
      if (passwordError) { res.status(400).json({ message: passwordError }); return }
      const hashed = await bcrypt.hash(newPassword, 12)
      await prisma.user.update({ where: { id: userId }, data: { password: hashed, passwordSetAt: new Date() } })
      res.json({ message: 'Password reset successfully' })
      return
    }

    // Online, with an email on file and no direct override requested: no password taken
    // from the requester at all — a fresh setup link is emailed to the target user, same
    // as a brand-new teacher invite. wantsDirect is false here, which per the OR above
    // guarantees target.email is set — the check still narrows the type for TypeScript.
    if (!target.email) { res.status(400).json({ message: 'This account has no email on file' }); return }
    const inviteToken = generateRawToken()
    await prisma.user.update({
      where: { id: userId },
      data: { resetTokenHash: hashToken(inviteToken), resetTokenExpiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) },
    })
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')
    const setupUrl = `${frontendUrl}/reset-password?token=${inviteToken}`
    await sendPasswordSetupEmail({ to: target.email, resetUrl: setupUrl, lang: target.preferredLanguage === 'FR' ? 'FR' : 'EN' })
    res.json({ message: 'Password setup email sent' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Create superadmin (run once)
export const createSuperAdmin = async (req: Request, res: Response) => {
  try {
    const { name, email, password, secretKey } = req.body

    if (secretKey !== process.env.SUPERADMIN_SECRET) {
      res.status(403).json({ message: 'Invalid secret key' })
      return
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(400).json({ message: 'Email already exists' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'SUPERADMIN',
        schoolId: null,
      }
    })

    res.status(201).json({
      message: 'Superadmin created',
      user: { id: superAdmin.id, name: superAdmin.name, email: superAdmin.email, role: superAdmin.role }
    })
  } catch (error) {
    console.error('SUPERADMIN ERROR:', JSON.stringify(error, null, 2))
    res.status(500).json({ message: 'Server error', error: String(error) })
  }
}
