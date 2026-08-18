import prisma from '../config/prisma'
import { normalizeGuardianPhone } from './phone'

/**
 * Attach a student to a parent account that already exists for the same contact.
 *
 * The case this exists for: a parent has already claimed one child and set a password, and
 * the school then records that same phone or email against another student, either by
 * editing the record or by enrolling a sibling. Without this the parent is invisible to the
 * new child until somebody issues a fresh invite, and the parent is asked to set up an
 * account they already have.
 *
 * Only ever ADDS a link. A contact edited away from one parent and onto another does not
 * revoke the first: a child can legitimately have two guardians with separate logins, and
 * quietly cutting one off because a number was corrected would be worse than leaving an
 * extra link for an admin to remove deliberately.
 *
 * Never throws into the caller. Failing to link is a missed convenience; failing the whole
 * student save because of it would be a real bug.
 */
export async function linkGuardianByContact(opts: {
  schoolId: string
  studentId: string
  guardianPhone?: string | null
  guardianEmail?: string | null
}): Promise<{ linked: boolean; parentName?: string }> {
  try {
    const { schoolId, studentId } = opts

    // The phone is matched in its canonical form, because a parent's login identifier is the
    // E.164 digits, while the column may hold whatever was typed.
    const phone = normalizeGuardianPhone(opts.guardianPhone)
    const username = 'error' in phone ? null : phone.e164
    const email = (opts.guardianEmail ?? '').trim().toLowerCase() || null
    if (!username && !email) return { linked: false }

    // EVERY parent matching either contact, not just the first. A child commonly has two
    // guardians with separate logins, and the phone on the record may belong to one while the
    // email belongs to the other. Taking only the first match meant that when one of them was
    // already linked, the other was never considered at all.
    const parents = await prisma.user.findMany({
      where: {
        role: 'PARENT',
        isActive: true,
        OR: [
          ...(username ? [{ username }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: { id: true, name: true },
    })
    if (parents.length === 0) return { linked: false }

    const alreadyLinked = new Set(
      (await prisma.guardian.findMany({
        where: { studentId, userId: { in: parents.map((p) => p.id) } },
        select: { userId: true },
      })).map((g) => g.userId),
    )
    const toLink = parents.filter((p) => !alreadyLinked.has(p.id))
    if (toLink.length === 0) return { linked: false }

    await prisma.guardian.createMany({
      data: toLink.map((p) => ({ userId: p.id, studentId, schoolId })),
      skipDuplicates: true,
    })
    return { linked: true, parentName: toLink.map((p) => p.name).join(', ') }
  } catch (error) {
    console.error('[guardianLink] could not attach an existing parent:', error)
    return { linked: false }
  }
}
