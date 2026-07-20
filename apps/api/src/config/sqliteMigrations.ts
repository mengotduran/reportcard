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

export const SQLITE_MIGRATIONS: { name: string; sql: string }[] = [
  { name: '20260624111054_init', sql: init },
  { name: '20260625000000_add_subject_term', sql: addSubjectTerm },
  { name: '20260625010000_add_student_status', sql: addStudentStatus },
  { name: '20260629000000_add_new_fields', sql: addNewFields },
  { name: '20260719000000_sync_departments_marks_mode_birth_details', sql: syncDepartmentsMarksModeBirthDetails },
  { name: '20260720160000_add_teacher_created_for_term', sql: addTeacherCreatedForTerm },
]
