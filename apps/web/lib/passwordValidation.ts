// Mirrors apps/api/src/utils/passwordValidation.ts — kept in sync by hand, no shared package
// between the two apps. Used for live client-side feedback only; the API is the real gate.

export interface PasswordCheck {
  label: string
  met: boolean
}

// Length only, deliberately — no required letter/digit/special-character mix. Many of the
// people setting these passwords aren't tech-savvy, and complexity rules trade a marginal
// security gain for real friction. Mirrors apps/api/src/utils/passwordValidation.ts.
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
  ]
}

export function isPasswordValid(password: string): boolean {
  return passwordChecks(password).every((c) => c.met)
}

export function validateUsername(username: string): string | null {
  if (!username || username.length < 8) return 'Username must be at least 8 characters'
  if (/\s/.test(username)) return 'Username cannot contain spaces'
  return null
}

// Lowercased, spaces/punctuation stripped, padded toward 8 chars with digits if the name
// alone is too short. Just a starting suggestion — the admin can always edit it.
export function suggestUsername(name: string): string {
  let base = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!base) base = 'user'
  while (base.length < 8) base += Math.floor(Math.random() * 10)
  return base
}
