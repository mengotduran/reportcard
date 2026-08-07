// Offline build only. Each migration's raw SQL is inlined as a string at
// build time (esbuild's `text` loader for *.sql, configured in
// scripts/offline-build/bundle.mjs) — the packaged executable has no Prisma
// CLI available to run `prisma migrate deploy` against the school's machine,
// so sqliteMigrate.ts applies these directly via better-sqlite3 on startup.
//
// Add a new entry here, in order, whenever a migration is added under
// prisma/sqlite/migrations/ — this list is NOT generated automatically.
import init from '../../prisma/sqlite/migrations/20260624111054_init/migration.sql'
import addSubjectTerm from '../../prisma/sqlite/migrations/20260625000000_add_subject_term/migration.sql'
import addStudentStatus from '../../prisma/sqlite/migrations/20260625010000_add_student_status/migration.sql'
import addNewFields from '../../prisma/sqlite/migrations/20260629000000_add_new_fields/migration.sql'
import syncDepartmentsMarksModeBirthDetails from '../../prisma/sqlite/migrations/20260719000000_sync_departments_marks_mode_birth_details/migration.sql'
import addTeacherCreatedForTerm from '../../prisma/sqlite/migrations/20260720160000_add_teacher_created_for_term/migration.sql'
import addTimetableSlot from '../../prisma/sqlite/migrations/20260720174500_add_timetable_slot/migration.sql'
import addTimetablePeriod from '../../prisma/sqlite/migrations/20260720183000_add_timetable_period/migration.sql'
import addTeachingHoursCoverage from '../../prisma/sqlite/migrations/20260721183500_add_teaching_hours_coverage/migration.sql'
import addTimetableSlotVersioning from '../../prisma/sqlite/migrations/20260725163400_add_timetable_slot_versioning/migration.sql'
import addPastTermMarksGrant from '../../prisma/sqlite/migrations/20260725185800_add_past_term_marks_grant/migration.sql'
import addClassLevelProgramme from '../../prisma/sqlite/migrations/20260726191800_add_class_level_programme/migration.sql'
import addAbsenceGraceAndPeriodIndex from '../../prisma/sqlite/migrations/20260728103000_add_absence_grace_and_period_index/migration.sql'
import syncPeriodMinutesResetTokenSeenByAdmin from '../../prisma/sqlite/migrations/20260728120000_sync_period_minutes_reset_token_seen_by_admin/migration.sql'
import addPromotionScale from '../../prisma/sqlite/migrations/20260802135550_add_promotion_scale/migration.sql'
import dropRepeatThreshold from '../../prisma/sqlite/migrations/20260802140509_drop_repeat_threshold/migration.sql'
import addStudentPhoto from '../../prisma/sqlite/migrations/20260803165754_add_student_photo/migration.sql'
import addClassGradingModeAndScaleUnlock from '../../prisma/sqlite/migrations/20260807120000_add_class_grading_mode_and_scale_unlock/migration.sql'

export const SQLITE_MIGRATIONS: { name: string; sql: string }[] = [
  { name: '20260624111054_init', sql: init },
  { name: '20260625000000_add_subject_term', sql: addSubjectTerm },
  { name: '20260625010000_add_student_status', sql: addStudentStatus },
  { name: '20260629000000_add_new_fields', sql: addNewFields },
  { name: '20260719000000_sync_departments_marks_mode_birth_details', sql: syncDepartmentsMarksModeBirthDetails },
  { name: '20260720160000_add_teacher_created_for_term', sql: addTeacherCreatedForTerm },
  { name: '20260720174500_add_timetable_slot', sql: addTimetableSlot },
  { name: '20260720183000_add_timetable_period', sql: addTimetablePeriod },
  { name: '20260721183500_add_teaching_hours_coverage', sql: addTeachingHoursCoverage },
  { name: '20260725163400_add_timetable_slot_versioning', sql: addTimetableSlotVersioning },
  { name: '20260725185800_add_past_term_marks_grant', sql: addPastTermMarksGrant },
  { name: '20260726191800_add_class_level_programme', sql: addClassLevelProgramme },
  { name: '20260728103000_add_absence_grace_and_period_index', sql: addAbsenceGraceAndPeriodIndex },
  { name: '20260728120000_sync_period_minutes_reset_token_seen_by_admin', sql: syncPeriodMinutesResetTokenSeenByAdmin },
  // NOTE: this list was already missing 10 migrations (20260723-20260801) before this
  // entry was added — a pre-existing gap, not introduced here. Flagged to the project
  // owner; not fixed as part of this change since it's unrelated in scope.
  { name: '20260802135550_add_promotion_scale', sql: addPromotionScale },
  { name: '20260802140509_drop_repeat_threshold', sql: dropRepeatThreshold },
  { name: '20260803165754_add_student_photo', sql: addStudentPhoto },
  // ClassLevel.gradingMode (nursery ratings) + ClassLevel.scaleUnlockedAt (the superadmin's
  // one-shot key to a frozen mark ceiling). One migration because both columns reached the
  // SQLite schema together; SQLite adds columns by rebuilding the table, so they share one.
  { name: '20260807120000_add_class_grading_mode_and_scale_unlock', sql: addClassGradingModeAndScaleUnlock },
]
