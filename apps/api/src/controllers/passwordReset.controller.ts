import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'
import { sendPasswordResetEmail } from '../utils/email'
import { hashToken, generateRawToken, RESET_TOKEN_TTL_MS as TOKEN_TTL_MS } from '../utils/resetToken'

// A resend within the same short window is almost always a double-click or an
// impatient refresh, not a genuine second request — skip re-sending (and
// re-spending a slot of the free Gmail daily cap) rather than invalidating the
// link the person may already have open in their inbox.
const RESEND_COOLDOWN_MS = 2 * 60 * 1000

// Request a reset link by email. Always responds with the same generic message
// whether or not the address exists — telling the caller otherwise would let
// anyone probe the school for which emails are registered.
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const genericResponse = { message: 'If that email is registered, a password reset link has been sent to it.' }
    if (!email) { res.status(400).json({ message: 'Email is required' }); return }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive) { res.json(genericResponse); return }

    const alreadySentRecently = user.resetTokenExpiresAt != null
      && user.resetTokenExpiresAt.getTime() - Date.now() > TOKEN_TTL_MS - RESEND_COOLDOWN_MS
    if (!alreadySentRecently) {
      const rawToken = generateRawToken()
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: hashToken(rawToken), resetTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      })
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`
      await sendPasswordResetEmail({ to: user.email, resetUrl, lang: user.preferredLanguage === 'FR' ? 'FR' : 'EN' })
    }

    res.json(genericResponse)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Consume a reset link's token and set a new password.
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const token = String(req.body.token ?? '')
    const newPassword = String(req.body.newPassword ?? '')
    if (!token) { res.status(400).json({ message: 'Reset token is required' }); return }
    if (newPassword.length < 6) { res.status(400).json({ message: 'Password must be at least 6 characters' }); return }

    const user = await prisma.user.findUnique({ where: { resetTokenHash: hashToken(token) } })
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
      res.status(400).json({ message: 'This reset link is invalid or has expired. Request a new one.' })
      return
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetTokenHash: null, resetTokenExpiresAt: null },
    })
    res.json({ message: 'Password reset successfully' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
