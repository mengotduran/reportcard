// Offline build only. Each migration's raw SQL is inlined as a string at
// build time (esbuild's `text` loader for *.sql, configured in
// scripts/offline-build/bundle.mjs) — the packaged executable has no Prisma
// CLI available to run `prisma migrate deploy` against the school's machine,
// so sqliteMigrate.ts applies these directly via better-sqlite3 on startup.
//
// Add a new entry here, in order, whenever a migration is added under
// prisma/sqlite/migrations/ — this list is NOT generated automatically.
//
// ORDER IS LOAD-BEARING, and silently so. SQLite has no ALTER COLUMN, so Prisma
// rewrites a changed table as CREATE new_X / INSERT ... SELECT / DROP X / RENAME.
// That SELECT names the exact columns the table is expected to have at that
// moment, so a migration omitted here doesn't just skip its own change — it
// breaks every later rebuild of the same table. Omitting
// 20260801151843_split_day_evening_period_minutes left the very next migration
// selecting a School.dayPeriodMinutes that nothing had created, which crashed
// the installer on startup rather than failing anywhere visible at build time.
import init from '../../prisma/sqlite/migrations/20260624111054_init/migration.sql'
import addSubjectTerm from '../../prisma/sqlite/migrations/20260625000000_add_subject_term/migration.sql'
import addStudentStatus from '../../prisma/sqlite/migrations/20260625010000_add_student_status/migration.sql'
import addNewFields from '../../prisma/sqlite/migrations/20260629000000_add_new_fields/migration.sql'
import syncDepartmentsMarksModeBirthDetails from '../../prisma/sqlite/migrations/20260719000000_sync_departments_marks_mode_birth_details/migration.sql'
import addTeacherCreatedForTerm from '../../prisma/sqlite/migrations/20260720160000_add_teacher_created_for_term/migration.sql'
import addTimetableSlot from '../../prisma/sqlite/migrations/20260720174500_add_timetable_slot/migration.sql'
import addTimetablePeriod from '../../prisma/sqlite/migrations/20260720183000_add_timetable_period/migration.sql'
import addTeachingHoursCoverage from '../../prisma/sqlite/migrations/20260721183500_add_teaching_hours_coverage/migration.sql'
import addNotifications from '../../prisma/sqlite/migrations/20260723232415_add_notifications/migration.sql'
import addTimetableSlotVersioning from '../../prisma/sqlite/migrations/20260725163400_add_timetable_slot_versioning/migration.sql'
import addPastTermMarksGrant from '../../prisma/sqlite/migrations/20260725185800_add_past_term_marks_grant/migration.sql'
import addClassLevelProgramme from '../../prisma/sqlite/migrations/20260726191800_add_class_level_programme/migration.sql'
import addAbsenceGraceAndPeriodIndex from '../../prisma/sqlite/migrations/20260728103000_add_absence_grace_and_period_index/migration.sql'
import syncPeriodMinutesResetTokenSeenByAdmin from '../../prisma/sqlite/migrations/20260728120000_sync_period_minutes_reset_token_seen_by_admin/migration.sql'
import addNotificationLinkData from '../../prisma/sqlite/migrations/20260729213500_add_notification_link_data/migration.sql'
import addSchoolHolidays from '../../prisma/sqlite/migrations/20260730194408_add_school_holidays/migration.sql'
import addTeacherSubjectHistory from '../../prisma/sqlite/migrations/20260730200100_add_teacher_subject_history/migration.sql'
import backfillAssignmentStartToTerm from '../../prisma/sqlite/migrations/20260730230100_backfill_assignment_start_to_term/migration.sql'
import addHolidayProgramme from '../../prisma/sqlite/migrations/20260730234500_add_holiday_programme/migration.sql'
import addSubjectExclusion from '../../prisma/sqlite/migrations/20260731140000_add_subject_exclusion/migration.sql'
import addPrivateClassDuration from '../../prisma/sqlite/migrations/20260731170000_add_private_class_duration/migration.sql'
import addPrivateSlotCourseRelation from '../../prisma/sqlite/migrations/20260731190000_add_private_slot_course_relation/migration.sql'
import addPeriodProgramme from '../../prisma/sqlite/migrations/20260731222138_add_period_programme/migration.sql'
import splitDayEveningPeriodMinutes from '../../prisma/sqlite/migrations/20260801151843_split_day_evening_period_minutes/migration.sql'
import addPromotionScale from '../../prisma/sqlite/migrations/20260802135550_add_promotion_scale/migration.sql'
import dropRepeatThreshold from '../../prisma/sqlite/migrations/20260802140509_drop_repeat_threshold/migration.sql'
import addStudentPhoto from '../../prisma/sqlite/migrations/20260803165754_add_student_photo/migration.sql'
import addPrimaryTestExamAndExamNumber from '../../prisma/sqlite/migrations/20260805180037_add_primary_test_exam_and_exam_number/migration.sql'
import addUsernameNullableEmail from '../../prisma/sqlite/migrations/20260805225200_add_username_nullable_email/migration.sql'
import addClassGradingModeAndScaleUnlock from '../../prisma/sqlite/migrations/20260807120000_add_class_grading_mode_and_scale_unlock/migration.sql'
import addCompetencyScale from '../../prisma/sqlite/migrations/20260808202600_add_competency_scale/migration.sql'

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
  { name: '20260723232415_add_notifications', sql: addNotifications },
  { name: '20260725163400_add_timetable_slot_versioning', sql: addTimetableSlotVersioning },
  { name: '20260725185800_add_past_term_marks_grant', sql: addPastTermMarksGrant },
  { name: '20260726191800_add_class_level_programme', sql: addClassLevelProgramme },
  { name: '20260728103000_add_absence_grace_and_period_index', sql: addAbsenceGraceAndPeriodIndex },
  { name: '20260728120000_sync_period_minutes_reset_token_seen_by_admin', sql: syncPeriodMinutesResetTokenSeenByAdmin },
  { name: '20260729213500_add_notification_link_data', sql: addNotificationLinkData },
  { name: '20260730194408_add_school_holidays', sql: addSchoolHolidays },
  // Rebuilds TeacherSubject to add the startedAt/endedAt window, and seeds startedAt from
  // createdAt. The backfill immediately below then corrects that seed — the two are a pair
  // and neither is safe to register without the other.
  { name: '20260730200100_add_teacher_subject_history', sql: addTeacherSubjectHistory },
  { name: '20260730230100_backfill_assignment_start_to_term', sql: backfillAssignmentStartToTerm },
  { name: '20260730234500_add_holiday_programme', sql: addHolidayProgramme },
  { name: '20260731140000_add_subject_exclusion', sql: addSubjectExclusion },
  { name: '20260731170000_add_private_class_duration', sql: addPrivateClassDuration },
  { name: '20260731190000_add_private_slot_course_relation', sql: addPrivateSlotCourseRelation },
  { name: '20260731222138_add_period_programme', sql: addPeriodProgramme },
  // Must precede drop_repeat_threshold: it is what replaces School.periodMinutes with the
  // day/evening pair that the next migration's rebuild goes on to select.
  { name: '20260801151843_split_day_evening_period_minutes', sql: splitDayEveningPeriodMinutes },
  { name: '20260802135550_add_promotion_scale', sql: addPromotionScale },
  { name: '20260802140509_drop_repeat_threshold', sql: dropRepeatThreshold },
  { name: '20260803165754_add_student_photo', sql: addStudentPhoto },
  // Must precede add_class_grading_mode_and_scale_unlock, which rebuilds ClassLevel and
  // selects the testMaxScore column this migration adds.
  { name: '20260805180037_add_primary_test_exam_and_exam_number', sql: addPrimaryTestExamAndExamNumber },
  { name: '20260805225200_add_username_nullable_email', sql: addUsernameNullableEmail },
  // ClassLevel.gradingMode (nursery ratings) + ClassLevel.scaleUnlockedAt (the superadmin's
  // one-shot key to a frozen mark ceiling). One migration because both columns reached the
  // SQLite schema together; SQLite adds columns by rebuilding the table, so they share one.
  { name: '20260807120000_add_class_grading_mode_and_scale_unlock', sql: addClassGradingModeAndScaleUnlock },
  // Per-school rating levels for COMPETENCY classes. A plain CREATE TABLE, so it carries no
  // ordering hazard of its own — but it still has to be listed here or the offline installer
  // simply never creates the table. That is exactly the omission this file's header warns
  // about, and the build guard in bundle.mjs now refuses to build without this line.
  { name: '20260808202600_add_competency_scale', sql: addCompetencyScale },
]
