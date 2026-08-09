/**
 * Feature switches that are deliberately hardcoded rather than per-school settings.
 *
 * These are product decisions taken centrally, not something a school configures. Kept in
 * one file so re-enabling something is a one-line change with an obvious blast radius.
 */

/**
 * Whether a student's passport photo can be uploaded.
 *
 * **Currently OFF** (2026-08-09). Turned off to stop uploaded photos consuming storage
 * before there is a real answer for where they should live — a photo per pupil is by far
 * the largest thing this product would ever store, and it grows with every enrolment,
 * unlike a school's logo or stamp which is one file each.
 *
 * What this switch does NOT touch, on purpose:
 *  - The `Student.photo` column, its controllers and its API client functions all stay.
 *    This is a switch, not a removal, so turning it back on is flipping this to `true`
 *    (and its twin in `apps/web/lib/features.ts`).
 *  - **The photo frame on the report card.** It already prints as an empty labelled box
 *    when a student has no photo, which is exactly what a school needs in order to glue a
 *    printed photograph onto the card by hand. Nothing about the design, the print output
 *    or the report card template changes.
 *  - School logos, stamps and cover images. Those are one-per-school and stay uploadable.
 *  - Removing a photo that already exists, so nothing is ever stranded.
 */
export const STUDENT_PHOTO_UPLOADS_ENABLED = false
