import prisma from '../config/prisma'
import type { MarksEntryMode } from '@prisma/client'

/**
 * Switching who records marks is capped: a school may do it twice per semester, and after
 * that the provider (superadmin) does it for them.
 *
 * Why a cap at all: the setting exists to keep marks out of teachers' hands, and a school
 * that can flip it freely could switch to TEACHERS, have marks changed, and switch back.
 * The cap plus the log turn that into something that cannot be done quietly or often.
 *
 * What it does NOT do, and cannot: stop a dishonest admin. They can already enter and
 * change any mark themselves. This narrows delegation and leaves a trail; it is not a
 * guarantee, and should not be sold as one.
 */
export const MARKS_ENTRY_SWITCHES_PER_TERM = 2

/** The semester a switch counts against. Null between academic years, where nothing is
 *  running to protect and switching is deliberately unrestricted. */
export async function currentTermIdFor(schoolId: string): Promise<string | null> {
  const term = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } })
  return term?.id ?? null
}

export interface SwitchAllowance {
  /** Switches the SCHOOL itself has already made this semester. Provider switches are
   *  excluded: the provider acting is the permission, not a use of the school's quota. */
  used: number
  limit: number
  /** Null when no semester is running: the cap does not apply. */
  termId: string | null
  allowed: boolean
}

export async function marksEntrySwitchAllowance(schoolId: string): Promise<SwitchAllowance> {
  const termId = await currentTermIdFor(schoolId)
  if (!termId) {
    // No semester, no cap. There are no marks in flight for a switch to disturb, and a
    // school setting itself up before the year starts should not need to ask anyone.
    return { used: 0, limit: MARKS_ENTRY_SWITCHES_PER_TERM, termId: null, allowed: true }
  }
  const used = await prisma.marksEntryModeChange.count({
    where: { schoolId, termId, byProvider: false },
  })
  return { used, limit: MARKS_ENTRY_SWITCHES_PER_TERM, termId, allowed: used < MARKS_ENTRY_SWITCHES_PER_TERM }
}

/**
 * Record a switch. Call ONLY after the change is committed: a row claiming a switch that
 * failed would be a lie, and this log's only job is to be true.
 *
 * `changedByName` is snapshotted rather than joined so the record still reads correctly
 * once that user is renamed or deleted.
 */
export async function logMarksEntryModeChange(opts: {
  schoolId: string
  mode: MarksEntryMode
  changedById: string
  changedByName: string
  termId: string | null
  byProvider: boolean
}): Promise<void> {
  await prisma.marksEntryModeChange.create({
    data: {
      schoolId: opts.schoolId,
      mode: opts.mode,
      changedById: opts.changedById,
      changedByName: opts.changedByName,
      termId: opts.termId,
      byProvider: opts.byProvider,
    },
  })
}
