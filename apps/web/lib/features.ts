/**
 * Feature switches, mirroring `apps/api/src/config/features.ts`.
 *
 * Kept as a plain constant rather than an env var so it cannot drift between Vercel and
 * Railway configuration, and so the two halves are found together by a single grep.
 * The API is the one that actually enforces this; the UI half exists so a school is never
 * shown a control that would fail if they used it.
 */

/**
 * Whether a student's passport photo can be uploaded.
 *
 * **Currently OFF** (2026-08-09). See the API twin for the full reasoning. Re-enabling means
 * flipping BOTH this and `STUDENT_PHOTO_UPLOADS_ENABLED` in
 * `apps/api/src/config/features.ts` — flipping only this one restores the button and it
 * will fail with a 503.
 *
 * Note this does not touch the report card's photo frame, which still prints as an empty
 * labelled box for a physical photograph to be attached by hand.
 */
export const STUDENT_PHOTO_UPLOADS_ENABLED = false
