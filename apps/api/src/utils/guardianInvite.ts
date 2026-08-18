import { hashToken, generateRawToken } from './resetToken'

export { hashToken, generateRawToken }

/**
 * How long a guardian invite stays redeemable.
 *
 * Longer than a teacher invite (7 days) because the delivery path is slower and more human:
 * an admin may send it on a Friday, the parent may only open WhatsApp days later, and a
 * printed slip can sit in a pocket over a holiday. Expiring it too eagerly just means the
 * admin re-issuing it, which costs both of them a trip.
 */
export const GUARDIAN_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * The wa.me deep link an admin taps to hand the invite over.
 *
 * This is NOT a messaging gateway: it opens WhatsApp on the ADMIN's own phone with the
 * message pre-typed and addressed to the guardian, and the admin presses send. No Meta
 * Business account, no per-message cost, no template approval. The trade is that a human
 * has to press send, which is also what keeps it verifiable: the admin sees who they are
 * sending to.
 *
 * `phone` must already be E.164 digits with no "+" (see utils/phone.ts), which is exactly
 * the shape wa.me expects.
 */
export function whatsappInviteUrl(phone: string, studentName: string, schoolName: string, link: string): string {
  const message =
    `Hello, this is ${schoolName}.\n\n` +
    `You can now view ${studentName}'s report cards and school fees online.\n\n` +
    `Open this link to set your password:\n${link}\n\n` +
    `The link works once and is only for you. Please do not share it.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

/**
 * Where a parent redeems the invite. FRONTEND_URL is already set for the password-reset links.
 *
 * Throws rather than falling back to a relative path: an invite is single use, so a link built
 * without an origin would burn the token on a message the parent can never open, and they
 * would have to go back to the school for another. Failing here means the admin sees a clear
 * error and no token is spent.
 */
export function guardianClaimLink(rawToken: string): string {
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) {
    throw new Error('FRONTEND_URL is not set, so a parent login link cannot be built')
  }
  return `${base}/parent/claim/${rawToken}`
}
