import prisma from '../config/prisma'
import type { MarksEntryMode } from '@prisma/client'

/**
 * Switching who records marks was capped at twice per semester, after which the provider
 * (superadmin) would do it instead — see logMarksEntryModeChange and its call site for the
 * reasoning (a school that could flip the setting freely could switch to TEACHERS, have
 * marks changed, and switch back unnoticed).
 *
 * DISABLED for now (2026-07-21): got in the way of active testing, where switching back
 * and forth is routine rather than suspicious. marksEntrySwitchAllowance below always
 * returns allowed: true; used/limit/termId still compute normally so the settings page's
 * "X of Y used" counter and the change log keep working, so re-enabling later is just
 * restoring the `allowed` line.
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
  // Cap disabled — see the docstring above. Was: `used < MARKS_ENTRY_SWITCHES_PER_TERM`.
  return { used, limit: MARKS_ENTRY_SWITCHES_PER_TERM, termId, allowed: true }
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
