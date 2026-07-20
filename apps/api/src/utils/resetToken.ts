import crypto from 'crypto'

// Shared by every flow that issues a password-setup/reset link (self-service
// forgot-password, admin-created teacher, admin-triggered reset) — they must
// all hash tokens identically, since any of them can be redeemed by the same
// resetPassword endpoint via User.resetTokenHash.
export const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex')

export const generateRawToken = () => crypto.randomBytes(32).toString('hex')

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour — self-service forgot-password

// Admin-issued links (new teacher invite, admin-triggered reset) sit unread in an
// inbox far more often than a self-service reset someone just requested — a much
// longer window avoids the admin having to babysit whether it was clicked in time.
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
