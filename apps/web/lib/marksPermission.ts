/**
 * May the signed-in ADMIN record marks here?
 *
 * Primary and secondary: always. Teachers still own the job and the readiness panel keeps
 * naming whoever has not filled a subject, but a term cannot be held hostage by one teacher
 * who has gone unreachable — the admin is the fallback.
 *
 * University: only under ADMIN_ONLY. That mode exists for exactly this, is recorded and
 * capped per semester, and switching it on is the deliberate act that moves entry to the
 * administration.
 *
 * The API decides for real (see saveEntries); this mirrors it so the grid does not invite an
 * edit that will be refused. Keep the two in step — the same rule drifted across three call
 * sites once before.
 */
export function adminMayEnterMarks(schoolType?: string | null, marksEntryMode?: string | null): boolean {
  return schoolType !== 'UNIVERSITY' || marksEntryMode === 'ADMIN_ONLY'
}
