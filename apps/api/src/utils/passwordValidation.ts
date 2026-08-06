// New passwords/usernames only — never re-validated on login or against an existing hash, so
// an account created before these rules existed keeps working unchanged. Applied at every
// point a NEW password is set: teacher/admin creation (both the direct-set and no-email
// branches), admin-driven resets, self-service change, and the emailed set-password link.
//
// Mirrored in apps/web/lib/passwordValidation.ts for live client-side feedback — keep the two
// rules in sync by hand; there's no shared package between the two apps to import from.

const SPECIAL_CHAR = /[^A-Za-z0-9]/
const LETTER = /[A-Za-z]/
const DIGIT = /[0-9]/

export function validateNewPassword(password: string): string | null {
  if (!password || password.length < 8) return 'Password must be at least 8 characters'
  if (!LETTER.test(password)) return 'Password must include at least one letter'
  if (!DIGIT.test(password)) return 'Password must include at least one number'
  if (!SPECIAL_CHAR.test(password)) return 'Password must include at least one special character'
  return null
}

// A username is a login identifier for someone with no email — same shape either way at the
// database level (both are just `where: { email/username }` lookups), so it only needs to be
// unambiguous to type, not "secure" the way a password does.
export function validateUsername(username: string): string | null {
  if (!username || username.length < 8) return 'Username must be at least 8 characters'
  if (/\s/.test(username)) return 'Username cannot contain spaces'
  return null
}
