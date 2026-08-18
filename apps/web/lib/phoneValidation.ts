// Guardian phone normalisation. Stored E.164 WITHOUT the leading "+" (e.g. "237677123456"),
// because that is exactly the shape wa.me/<number> wants and it round-trips to a display
// form trivially. One canonical shape in the column means a parent typing their number can
// be matched against it later without every call site re-guessing the format.
//
// Mirrored from apps/api/src/utils/phone.ts, which is the authority, and from
// apps/mobile/lib/phone.ts. Keep the three in sync by hand; there is no shared package
// between the apps to import from (same arrangement as lib/passwordValidation.ts).
//
// Deliberately hand-written rather than pulling in libphonenumber-js: the strict half of the
// problem is one country, the loose half only needs to reject nonsense, and the API is also
// bundled into a single-file offline executable where every dependency is weight.

/** Country assumed when a number is typed with no country code at all. */
export const DEFAULT_CALLING_CODE = '237'

/**
 * Cameroon national numbers are exactly 9 digits and start with 6 (mobile) or 2 (landline).
 * Enforced strictly because it is the overwhelmingly common case and the seeded data shows
 * what happens without it: "7788724" (too short) and "6777949034" (too long) both sat in the
 * column looking plausible.
 */
const CM_NATIONAL_LENGTH = 9
const CM_VALID_PREFIX = /^[26]/

/**
 * Country calling codes, used only to sanity-check an explicitly international number so a
 * typo like "+999..." is rejected. Not exhaustive down to every reassignment — the real
 * guard for a foreign number is the E.164 length range below. Cameroon is validated far more
 * strictly above.
 */
const CALLING_CODES = new Set<string>([
  '1', '7',
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46',
  '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63',
  '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227',
  '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240',
  '241', '242', '243', '244', '245', '246', '248', '249', '250', '251', '252', '253', '254',
  '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268',
  '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356',
  '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380',
  '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502',
  '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595',
  '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679',
  '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850',
  '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966',
  '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994',
  '995', '996', '998',
])

/** E.164 caps a full international number at 15 digits; nothing real is shorter than 8. */
const E164_MIN = 8
const E164_MAX = 15

export interface NormalizedPhone {
  /** E.164 digits with no "+", ready for storage and for wa.me links. */
  e164: string
}

/**
 * Turn whatever an admin typed into one canonical international number, or explain why it
 * cannot be one.
 *
 * Accepted, in the order they are tried:
 *   "+49 151 2345678" / "0049151..."  -> explicitly international, kept as that country
 *   "237677123456"                    -> already carries a country code
 *   "677 12 34 56" / "0677123456"     -> bare national number, DEFAULT_CALLING_CODE applied
 *
 * Returns a `error` string suitable for showing to an admin, or the normalised number.
 */
export function normalizeGuardianPhone(
  input: string | null | undefined,
  defaultCallingCode: string = DEFAULT_CALLING_CODE,
): NormalizedPhone | { error: string } {
  const raw = String(input ?? '').trim()
  if (!raw) return { error: 'Guardian phone is required' }

  // Anything that isn't a digit or a leading "+" is decoration: spaces, dashes, brackets,
  // the "/" people use to cram two numbers into one cell.
  if (/[a-zA-Z]/.test(raw)) return { error: 'Guardian phone cannot contain letters' }
  const hasPlus = raw.startsWith('+')
  let digits = raw.replace(/\D/g, '')
  if (!digits) return { error: 'Enter a valid phone number' }

  // "00" is the other way of writing "+", used across francophone Africa and Europe.
  let isInternational = hasPlus
  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2)
    isInternational = true
  }

  if (isInternational) {
    const code = matchCallingCode(digits)
    if (!code) return { error: `"${raw}" does not start with a known country code` }
    // A foreign number gets the loose check only — we cannot know every country's national
    // length, and rejecting a real number is worse than storing one that fails at send time.
    if (digits.length < E164_MIN || digits.length > E164_MAX) {
      return { error: `"${raw}" is not a valid international number` }
    }
    // An explicitly international Cameroon number still deserves the strict rule.
    if (code === DEFAULT_CALLING_CODE) return validateCameroon(digits.slice(code.length), raw)
    return { e164: digits }
  }

  // No "+" and no "00". Either it already carries the default country code, or it is a bare
  // national number. Length disambiguates: a Cameroon national number is 9 digits, so
  // anything longer that starts with 237 must already include the code.
  if (digits.startsWith(defaultCallingCode) && digits.length > CM_NATIONAL_LENGTH) {
    return validateCameroon(digits.slice(defaultCallingCode.length), raw)
  }

  // A single leading 0 is the national trunk prefix and is dropped when going international.
  const national = digits.replace(/^0+/, '')
  return validateCameroon(national, raw)
}

/** Longest-match the leading 1-3 digits against the known calling codes. */
function matchCallingCode(digits: string): string | null {
  for (const len of [3, 2, 1]) {
    const candidate = digits.slice(0, len)
    if (CALLING_CODES.has(candidate)) return candidate
  }
  return null
}

function validateCameroon(national: string, raw: string): NormalizedPhone | { error: string } {
  if (national.length !== CM_NATIONAL_LENGTH) {
    return {
      error: `"${raw}" is not a valid Cameroon number (expected ${CM_NATIONAL_LENGTH} digits, got ${national.length}). For a number outside Cameroon, start it with + and the country code.`,
    }
  }
  if (!CM_VALID_PREFIX.test(national)) {
    return { error: `"${raw}" is not a valid Cameroon number (it should start with 6 or 2)` }
  }
  return { e164: `${DEFAULT_CALLING_CODE}${national}` }
}

/** "237677123456" -> "+237 677 123 456". Display only; never write this back to the column. */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  const digits = String(e164 ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const code = matchCallingCode(digits)
  if (!code) return `+${digits}`
  const national = digits.slice(code.length)
  // Only the default country gets grouped, in the 3-3-3 shape Cameroon numbers are written
  // in. Every other country groups differently and guessing produces nonsense ("+1 202 555
  // 014 3"), so a foreign number stays as one block.
  const rest = code === DEFAULT_CALLING_CODE ? national.replace(/(\d{3})(?=\d)/g, '$1 ') : national
  return `+${code} ${rest}`.trim()
}
