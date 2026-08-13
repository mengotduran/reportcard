# ReportCard System — Project Documentation

> Last updated: 2026-08-07 (**primary marking & averaging documented**: Test + Exam on a raw scale, average always coefficient-weighted and normalised to /20, pass mark 10/20, `recomputePrimaryAverages.ts` migration · the 0–20 default grading scale is secondary-only, primary defaults to 0–100 · **primary shared teaching teams**: hours split equally, a period is only missed when every member is absent · **an absence is reviewed by an explicit action, never by a background refetch** — reading the notification counts)
> Previously (2026-07-31): an admin-recorded absence is never the teacher's to retract · the copy-marks shortcut is primary/secondary only, CA /30 and Exam /70 cannot fill each other · teaching hours coverage: per-subject/course requiredHours target, timetable-derived scheduled/taught hours, teacher self-reported absences · annual transcripts for all school types · official vs student copies + stamp · failing marks in red · resits · admin-only marks entry with capped, audited switching · published cards frozen · student birth details · Course wording for universities
> This document is updated every time a new feature or change is made.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [How to Run](#3-how-to-run)
4. [Database Schema](#4-database-schema)
5. [User Roles](#5-user-roles)
6. [API Routes](#6-api-routes)
7. [Grading & Mark Calculation](#7-grading--mark-calculation)
8. [Subjects & Coefficients](#8-subjects--coefficients)
9. [Report Cards Flow](#9-report-cards-flow)
10. [Class Master System](#10-class-master-system)
11. [Teacher Management](#11-teacher-management)
12. [Report Card Design](#12-report-card-design)
13. [Class List Design](#13-class-list-design)
14. [School Customisation](#14-school-customisation)
15. [Print System](#15-print-system)
16. [Web App Pages](#16-web-app-pages)
17. [Mobile App Screens](#17-mobile-app-screens)
18. [Known Behaviours & Rules](#18-known-behaviours--rules)
19. [Demo Tenant](#19-demo-tenant)
20. [Teaching Hours Coverage](#20-teaching-hours-coverage)

---

## 1. Project Overview

A **multi-tenant SaaS platform** for schools to manage students, teachers, subjects, terms, and report cards.

- Multiple schools can be grouped under a **ParentSchool** (e.g. one institution with a Primary and Secondary section).
- Each school has its own students, teachers, subjects, terms, grading scale and report card design.
- Roles control what each user can see and do.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + npm workspaces |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL via Prisma 7 |
| Web Frontend | Next.js 16 + Tailwind CSS v4 |
| Mobile | React Native + Expo SDK 54 + expo-router v6 |

- **API** runs on port `5000`
- **Web** runs on port `3000`
- **Mobile** runs on port `8081` (Expo)
- Project path: `~/Documents/allprojects/reportcard_system/reportcard-app`

---

## 3. How to Run

```bash
# Install dependencies (from root)
npm install

# Run everything together
npm run dev

# Or run individually:
cd apps/api   && npm run dev   # API on :5000
cd apps/web   && npm run dev   # Web on :3000
cd apps/mobile && npx expo start  # Mobile on :8081

# Database
cd apps/api
npx prisma migrate dev     # Run migrations
npx prisma generate        # Regenerate Prisma client
npx prisma studio          # View data at localhost:5555
```

---

## 4. Database Schema

### School & Organisation

| Model | Purpose |
|-------|---------|
| `ParentSchool` | Groups multiple school sections under one institution |
| `School` | A single school section (PRIMARY / SECONDARY / UNIVERSITY). Has logo, cover image, subdomain, **stamp** (official seal image, prints on official copies only), **marksEntryMode** (`TEACHERS` default / `ADMIN_ONLY`) |
| `MarksEntryModeChange` | Audit log of every who-enters-marks switch: mode, snapshotted user name, timestamp, termId it counted against, `byProvider` flag. A log (not a last-changed-by field) so a flip-and-back leaves two rows |

### People

| Model | Key Fields |
|-------|-----------|
| `User` | name, **email** (nullable), **username** (nullable), password, role, schoolId, **masterClassLevel** (CLASS_MASTER only) |
| `Student` | name, studentId, classLevel (e.g. "Form 4 Arts"), guardianName/Phone/Email, **dateOfBirth**/**placeOfBirth** (optional; DOB stored as `"YYYY-MM-DD"` TEXT, never a timestamp — a timezone would shift a birth date by a day), status |

### Academic

| Model | Key Fields |
|-------|-----------|
| `Subject` | name, classLevel, **maxScore** (default 20), **coefficient** (default 1) |
| `ClassLevel` | name, hasStream (bool), order (sort position), **gradingMode** (`NUMERIC` default / `COMPETENCY` — primary only, see §7 → *Nursery / pre-primary*), **scaleUnlockedAt** (superadmin's one-shot key to a frozen class — see §7 → *How a class is assessed is frozen…*) |
| `Term` | name, session, startDate, endDate, **isCurrent** (bool) |
| `TeacherSubject` | Junction: which teacher teaches which subject (one teacher per subject per class) |

### Report Cards

| Model | Key Fields |
|-------|-----------|
| `ReportCard` | studentId, termId, status (DRAFT/PUBLISHED), totalScore, **average** (raw X.X e.g. 14.4), **position** (int), remarks |
| `ReportEntry` | reportCardId, subjectId, seq1Score, seq2Score, **resitScore** (university: exam re-sat; `score` then = CA + resit), **score** (secondary: avg of seqs · university: CA + effective exam), grade, **remarks** (auto-filled from grading scale) |

### Configuration (per school)

| Model | Purpose |
|-------|---------|
| `GradingScale` | Stores custom grade ranges as JSON. **Two storage shapes exist** (legacy bare array, or `{ ranges, classificationBands, legendRows }` which saving always writes now). Every reader must parse via `apps/api/src/utils/gradingScale.ts` — reading the column raw silently graded with the built-in defaults for years |
| `ReportCardTemplate` | Stores full card layout config as JSON |
| `ClassListTemplate` | Stores the printable class list / marks register design as JSON |

---

## 5. User Roles

| Role | Creates cards | Fills marks | General remarks | Admin access |
|------|---|---|---|---|
| `SCHOOL_ADMIN` | ✓ | ✗ | ✓ if class has no master | ✓ Full |
| `VICE_PRINCIPAL` | ✓ | ✗ | ✓ if class has no master | ✓ Most |
| `CLASS_MASTER` | ✓ auto | ✓ assigned subjects | ✓ their master class | ✗ |
| `CLASS_TEACHER` | ✓ auto | ✓ assigned subjects | ✗ | ✗ |
| `STUDENT` | (future) | — | — | — |
| `PARENT` | (future) | — | — | — |

### Key role rules

- **Only ADMIN / VICE_PRINCIPAL** can explicitly create and publish report cards via the UI
- **CLASS_TEACHER and CLASS_MASTER** auto-create a report card silently when they first save marks for a student
- **CLASS_MASTER** has a `masterClassLevel` field — the one class they manage general remarks for
- A CLASS_MASTER can teach subjects in multiple classes but is master of only ONE class
- **Admin is read-only for marks** — they view everything but don't fill marks. They **can** write the general remarks when the class has no class master (otherwise remarks are master-only)
- **General remarks are required for every class before publishing** (see §9 Publish rules)
- **Subject exclusivity** — a subject in a class belongs to exactly one teacher. Assigning it to Teacher B silently removes it from Teacher A (admin sees a notice)

### Navigation per role (web)

| Role | Pages visible |
|------|-------------|
| SUPERADMIN | Schools management only |
| SCHOOL_ADMIN / VICE_PRINCIPAL | Dashboard, Students, Classes, Subjects, Terms, Report Cards, Card Design, Class List, Grading, Teachers, Settings |
| CLASS_MASTER | Dashboard, Classes (marks entry), My Class (general remarks) |
| CLASS_TEACHER | Dashboard, Classes (marks entry) |

### Creating teachers
Only **Class Teacher** and **Class Master** roles are available when creating a new teacher. When creating a CLASS_MASTER, admin must select the class they are master of from a dropdown.

---

## 6. API Routes

Base URL: `http://localhost:5000/api`

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Login — returns JWT + user (incl. masterClassLevel) + school |
| GET | `/auth/me` | Get current user info |
| POST | `/auth/create-superadmin` | Create the first superadmin |

### Students
| Method | Route | Roles | Description |
|--------|-------|-------|-------------|
| GET | `/students` | Any | List all students |
| POST | `/students` | Admin, VP, Class teacher | Create a student |
| PUT | `/students/:id` | Admin, VP, Class teacher | Edit a student |
| PUT | `/students/:id/status` | Admin, VP | Set `ACTIVE` / `DISABLED` / `DISMISSED`. **The normal way a student leaves** |
| DELETE | `/students/:id` | Admin only | Delete a student outright. **Refuses with 409** once they have a report card or any payment (see below) |
| GET | `/students/:id/deletable` | Admin only | Read-only pre-flight: `{ deletable, counts, message }`. Asked when the delete dialog opens |
| GET | `/students/class-levels` | Any | Get distinct class levels |

**Deleting a student is for a data-entry mistake only** — a duplicate row, a name typed into
the wrong class, a registration that was never a real child. It is not how a student leaves.

A student who has been graded is an academic record, not a row: schools are expected to
produce a transcript years after a student has gone, so once anything has been recorded
against them the delete path closes for good. The API refuses with `409` and
`reason: 'HAS_ACADEMIC_RECORD'` when the student has any **report card**, **fee payment** or
**HND registration payment**, and its message names the counts and points at the status route
instead. The check is the same for primary, secondary and university; "has a report card"
carries the rule for all three, because a card is created for every active student when a term
opens, so anyone who has sat so much as one term or semester has one.

`DISABLED` and `DISMISSED` are the real exits. They keep the record and take the student out
of rosters, class lists, bulk print and exports, and they are reversible.

Both dashboards require the admin to **type the student's full name** before the delete button
activates, the same pattern as deleting a school. That guards against the mistake that actually
happens with a delete icon sat beside everyday buttons: deleting the wrong row. A yes/no prompt
confirms the act rather than the target, so it does not help there.

**The dialog asks the server before it opens.** `GET /students/:id/deletable` decides whether
the student can be deleted at all; when they cannot, the confirm button is dead from the start,
the name box is not shown (there is nothing to type your way past), and the reason is stated in
the dialog. Being made to type out a full name and only then refused is worse than not offering
the button. Both that route and `DELETE` read the **same** `getStudentDeleteBlockers` helper, so
the greyed-out button and the eventual refusal can never disagree; a pre-flight that contradicts
the enforcement is worse than none, because it teaches admins to trust a button that lies.

The `409` is still enforced on delete regardless. The pre-flight can go stale between opening
the dialog and confirming (a fee recorded on another screen, a term opened), and only the server
decides. If the pre-flight itself fails, the dialog blocks rather than opens up.

### Subjects
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/subjects` | List subjects (teachers/class masters see only assigned ones) |
| POST | `/subjects` | Create subject (name, classLevel, maxScore, coefficient, optional `requiredHours`) |
| PUT | `/subjects/:id` | Edit subject |
| DELETE | `/subjects/:id` | Delete subject + all related report entries |

### Teacher Absences
| Method | Route | Roles | Description |
|--------|-------|-------|-------------|
| GET | `/teacher-absences/me` | Any teacher | Own logged absences (optional `from`/`to`) |
| GET | `/teacher-absences` | Admin, VP | A given `teacherId`'s absences. **Pure read — never marks anything reviewed** (see §20 Absences) |
| POST | `/teacher-absences/mark-seen` | Admin, VP | Mark that `teacherId`'s absences **reviewed**, locking the teacher out of retracting them. The one and only writer of `seenByAdmin`; also called when an admin reads the `TEACHER_ABSENCE` notification |
| POST | `/teacher-absences` | Any teacher (self), Admin/VP (on a teacher's behalf via `teacherId`) | Log an absence for a `date` — `wholeDay: true` (every real slot that weekday) or specific `timetableSlotIds`. Accepts a `days` array for a multi-day report |
| DELETE | `/teacher-absences/:id` | Own (teacher) or Admin/VP | Remove a logged absence — clears **every period of that class on that date**, not just the row named |
| GET | `/teacher-absences/counts` | Admin, VP | Every teacher's absence total in one query, for the By Teacher view |

The list endpoints return **one entry per class per date**, not per period: a 07:30-09:10 double
arrives as a single entry with `periods: 2`. Rows are still stored per period underneath — see
§20 Absences for why both are true.

### Teaching Hours Coverage
| Method | Route | Roles | Description |
|--------|-------|-------|-------------|
| GET | `/coverage/me` | Any teacher | Own coverage rows (per subject/course with a `requiredHours` target) for the active (or given `?session=`) academic session |
| GET | `/coverage` | Admin, VP | School-wide coverage rows, optionally filtered by `?teacherId=` |
| GET | `/coverage/hours-totals` | Admin, VP | Hours worked per teacher across every slot, for the By Teacher view |

A coverage row is **one course**, with a `contributors[]` breakdown and a `gaps[]` list. See §20.

### Holidays
| Method | Route | Roles | Description |
|--------|-------|-------|-------------|
| GET | `/holidays` | Any signed-in user | School closures (a teacher's own hours need them too) |
| POST | `/holidays` | Admin, VP | Create — `name`, `startDate`, `endDate`, optional `programme` |
| PUT | `/holidays/:id` | Admin, VP | Edit |
| DELETE | `/holidays/:id` | Admin, VP | Remove — the teaching days go straight back into the hours count |

### Class Levels
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/class-levels` | List all class levels (sorted by order). Each carries `scaleLockedBy`: the closed term that froze its mark total and grading mode for the year, or null |
| POST | `/class-levels` | Create a class level. **Primary**: 400s unless the Test ceiling leaves room for an Exam (`0 < testMaxScore < maxScore`); an omitted `testMaxScore` defaults to 30% of the total |
| PUT | `/class-levels/:id` | Edit class level. Same primary ceiling check, applied to the values the class will **end up** with (so shrinking `maxScore` under an existing `testMaxScore` is refused). **403** if the mark total or grading mode is frozen for the year and no superadmin unlock is open |
| DELETE | `/class-levels/:id` | Delete class level |

### Terms
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/terms` | List all terms |
| POST | `/terms` | Create a term |
| PUT | `/terms/:id` | Edit a term |
| DELETE | `/terms/:id` | Delete a term |
| GET | `/terms/current` | Get the current active term |

### Report Cards
| Method | Route | Roles | Description |
|--------|-------|-------|-------------|
| GET | `/report-cards` | All | List report cards |
| GET | `/report-cards/:id` | All | Get single report card with entries |
| POST | `/report-cards` | Admin, CLASS_TEACHER, CLASS_MASTER | Create a report card |
| PUT | `/report-cards/:id/entries` | Admin, teachers | Save marks; auto-fills grade + remarks from the school's scale (parsed, both storage shapes). Refuses: teachers under `ADMIN_ONLY` (403), anyone on a **PUBLISHED** card (unpublish first; explicit grant excepted), and resit marks for students who didn't fail the course |
| PUT | `/report-cards/:id/remarks` | Admin, VP, CLASS_MASTER | Update general remarks only (admin/VP used when class has no master) |
| PUT | `/report-cards/:id/publish` | Admin, VP | Publish one card — enforces subjects + all sequences + general remarks |
| PUT | `/report-cards/:id/unpublish` | Admin, VP | Unpublish (unlocks for editing) |
| POST | `/report-cards/bulk-publish` | Admin, VP | Publish a whole class; skips + reports students not ready |
| PUT | `/report-cards/:id/grant-edit` · `/revoke-edit` | Admin, VP | Grant/revoke one-time edit on a published card |
| ~~DELETE~~ | ~~`/report-cards/:id`~~ | — | **Removed.** A report card cannot be deleted, by anyone (see below) |
| GET | `/report-cards/class-overview` | All | Students + card status for a class/term |
| GET | `/report-cards/class-readiness?termId` | Admin, VP | Per-class publish readiness (drives bulk-publish gating) |
| GET | `/report-cards/:id/readiness-detail` | Admin, VP | Which teacher is missing marks / who must write remarks |

`GET /report-cards` also takes **`studentStatus`** (`ACTIVE` / `DISABLED` / `DISMISSED`),
which drives the status filter on both dashboards — a **Status** dropdown beside the class
filter on the web, matching the Students page control exactly, and pills on mobile. Unset
returns every status, which is what the transcript and print routes want since those address
one already-chosen student.

**The exports on that screen follow the filters on screen.** Both buttons ("Export data"
and "Export data (with marks)") send the selected term, class and student status, then apply
the browser-side programme and search filters on top, so the file is the table. Selecting
"All Terms" still writes one file per term of the active year, and a term with no cards yet
simply produces no file. When the table is empty both buttons are disabled rather than
producing a zero-row download, and the scope line beside them names every filter the file
will carry. `GET /report-cards/marks-export` gained **`studentStatus`** for this (default
`ACTIVE`); it judges on `status` alone, like `GET /report-cards`, because its old
`isActive: true` clause returned an empty file for any Disabled or Dismissed export.

The web report cards table also carries the **Change Status** action (admin/VP, the same
`PUT /students/:id/status` the Students page uses, in the same modal with the same wording).
A student leaves mid-term while their cards are what you have on screen, and sending an
admin to another screen to record that is the friction worth removing. Moving one out of the
tab you are viewing removes the row from it, which is where their cards now live.

**A report card cannot be deleted.** The route was removed outright rather than guarded.

A card is an **issued document**: once published, a parent may be holding a printed copy,
and deleting the school's copy does not recall theirs. It only makes the school's record
disagree with the paper in their hand, with nothing left to show the card ever existed. That
is worse than a wrong card you can see and correct. Grade records are treated as append-only
across the sector for this reason, corrected by amendment rather than erasure.

The correction path is **`PUT /report-cards/:id/unpublish`**, which reopens the card for
editing and keeps its history. There is also nothing to clean up by deleting: a card is
auto-created for every active student when a term opens, so deleting one for an active
student was never permanent to begin with.

This also closes a hole in the student rules above: while report cards could be deleted, an
admin could delete a student's cards and then delete the student, walking straight around
the retention guard.

**Students who have left keep their report cards.** `DISABLED` and `DISMISSED` students are
not hidden and nothing of theirs is removed. Their cards move to their own tab, defaulting
to Active so the everyday view is the school's current pupils. A dismissed student still
needs a transcript to transfer, so their cards stay fully viewable and printable; they are
only kept out of bulk operations for the current term (bulk publish already filters on
`isActive`).

Filtering is **server-side**. The list is paginated, so narrowing it on the client would
empty a page while later pages still held matches.

### Teachers
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/teachers` | List all teachers (CLASS_TEACHER, CLASS_MASTER, VICE_PRINCIPAL) |
| POST | `/teachers` | Create a teacher (CLASS_TEACHER or CLASS_MASTER only) |
| PUT | `/teachers/:id` | Edit role / masterClassLevel; auto-demotes previous class master |
| DELETE | `/teachers/:id` | Soft-delete a teacher |
| GET | `/teachers/:id/subjects` | Get assigned subjects |
| PUT | `/teachers/:id/subjects` | Assign subjects; auto-reassigns from previous teacher with notice |

### School Configuration
| Method | Route | Description |
|--------|-------|-------------|
| GET/PUT | `/grading-scale` | Get/update the school's grading scale |
| GET/PUT | `/report-card-template` | Get/update the report card layout config |
| GET/PUT | `/class-list-template` | Get/update the class list / marks register design config (save: admin/VP) |
| POST/DELETE | `/school/logo` | Upload/remove school logo |
| POST/DELETE | `/school/stamp` | Upload/remove the official stamp/seal (prints on official copies only, via the designer's `stamp` section) |
| PUT | `/school/settings` | Also accepts `marksEntryMode` — validated against the enum, capped at 2 real switches per semester (403 past that), each switch audit-logged. GET returns `marksEntrySwitches` (used/limit/allowed) + `marksEntryModeHistory` |
| PUT | `/superadmin/schools/:id` | Also accepts `marksEntryMode` — the provider's override: uncapped, logged with `byProvider: true`, never counts against the school's quota |
| GET | `/report-cards/student/:id/transcript` | Annual transcript data: published cards of the session (chronological), `termCount`, grading scale, classification bands, school incl. `stamp` |
| POST/DELETE | `/school/cover` | Upload/remove cover image |

### SuperAdmin
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/superadmin/overview` | All schools (parent + standalone) with stats |
| GET | `/superadmin/schools` | List all school sections |
| POST | `/superadmin/schools` | Create a standalone school + admin user |
| POST | `/superadmin/parent-schools` | Create a parent school group with sections |
| PATCH | `/superadmin/schools/:id/toggle` | Activate / deactivate a school |
| PATCH | `/superadmin/parent-schools/:id/toggle` | Activate / deactivate a parent group |
| PATCH | `/superadmin/class-levels/:classLevelId/scale-unlock` | Hand a school a **one-shot** key to change a class's frozen mark total or grading mode (see §7 → *How a class is assessed is frozen…*). The school makes the change itself; the change spends the key |

### Demo Tenant
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/demo/reset` | Wipe & reseed the demo school. Guarded by `x-demo-secret` header (or `?key=`) === env `DEMO_RESET_SECRET`. Returns 503 if the secret is unset. Only ever touches the demo tenant. |
| GET | `/demo/credentials` | Public — returns the demo logins |

See §19 Demo Tenant for the full picture.

---

## 7. Grading & Mark Calculation

Three school types, three marking models. This section describes **secondary**; primary is
in *Primary marking & averaging* below and university in *University GPA Algorithm* after
that. What they share: the letter grade and remark always come from the school's own
grading scale, never hardcoded thresholds.

### Per-subject marks (teacher fills in) — secondary

The teacher fills in marks for **Sequence 1** and **Sequence 2**, both out of the subject's `maxScore` (default 20).

```
Subject average = (Seq1 + Seq2) / 2   →   e.g. 15/20
```

One component is enough: a subject with a Seq 1 and no Seq 2 counts the missing half as 0
rather than vanishing from the average. `null` means **neither** was entered — that subject
is unmarked and stays out of the average entirely (it is not a zero).

### Per-subject grade & remark (auto-filled)

When marks are saved, the API looks up the percentage in the school's grading scale and stores BOTH the **letter grade** (`ReportEntry.grade`, e.g. "A") and the **remark** (`ReportEntry.remarks`, e.g. "Very Good"):

```
Percentage = (subject_average / maxScore) × 100   →   e.g. 75%
```

The letter grade and remark both come from the school's grading-scale ranges (the design) — not hardcoded thresholds (`getGradeLetter`/`getAutoRemark` in the API; falls back to the default scale if none is configured).

**What shows where:**
- **Grade** column (report card detail, all 5 print templates, "Overall Grade" card) → the **letter** (A, B, C…).
- **Remarks** column → the remark word ("Good", "Very Good").
- **PERFORMANCE** column on the marks-entry page → the remark word (live performance text), by design.

**Badge style**: squared corners (borderRadius 4px), not circular pills — applied on both web and mobile.

### Final (weighted) average — secondary

```
Note coefficientée = subject_average × coefficient
Final average = Σ(note coefficientée) / Σ(coefficients)   →   stored as raw e.g. 14.4
```

**Display**: shown as just `14.4` (no /20 suffix).

**Example:**

| Subject | Avg /20 | Coeff | Note Coeff |
|---------|---------|-------|------------|
| Maths   | 15      | 5     | 75         |
| French  | 11      | 3     | 33         |
| Sport   | 18      | 2     | 36         |
| **Total** |       | **10** | **144**   |

Final average = 144 ÷ 10 = **14.4**

### Overall grade

```
Overall % = (14.4 / 20) × 100 = 72%  →  "Good"
```

### Default grading scale

| Score /20 | Percentage | Grade | Remark |
|-----------|-----------|-------|--------|
| 18–20 | 90–100% | A+ | Excellent |
| 15–17 | 75–89% | A | Very Good |
| 12–14 | 60–74% | B | Good |
| 10–11 | 50–59% | C | Average |
| 8–9 | 40–49% | D | Below Average |
| 0–7 | 0–39% | F | Fail |

**This 0–20 default is for SECONDARY only.** Primary and university both default to the
0–100 scale (`DEFAULT_UNIVERSITY_RANGES`), because both mark on a raw /100 scale. `GET
/grading-scale` auto-migrates a stale 0–100 scale back to this 0–20 default — but **only for
secondary**; doing it for primary silently wiped a correct primary scale on every page load.

Readers must also cope with the column holding **two shapes**: a bare array (legacy) or
`{ ranges, classificationBands, legendRows }` (what saves write today). Always parse via
`utils/gradingScale.ts` → `parseStoredScale`, never read `GradingScale.ranges` directly.

### Class position

Shown as ordinal: **1st**, **2nd**, **3rd**, etc.
Auto-recalculated for all students in the same class/term every time any teacher saves marks.

---

### Primary marking & averaging (Test + Exam, average always /20)

Primary is neither of the other two. Its subjects are marked on a **raw scale** like a
university, but its report card states the average **out of 20** like a secondary one — the
two are independent, and conflating them is the bug this design exists to prevent.

#### Per-subject marks

Two components per subject, stored in the same `seq1Score` / `seq2Score` columns everything
else uses:

| Component | Column | Out of |
|---|---|---|
| **Test** | `seq1Score` | `ClassLevel.testMaxScore` (default 30) |
| **Exam** | `seq2Score` | `maxScore − testMaxScore` (derived, default 70) |
| **Total** | `score` | `ClassLevel.maxScore` (default 100) |

```
Subject total = Test + Exam        →  e.g. 21 + 50 = 71/100
```

A direct sum, not an average of the two — the same shape as university's CA + Exam, and
unlike secondary, where the two sequences are averaged. The Exam ceiling is **derived, never
stored**: there is one `testMaxScore` and the rest of `maxScore` is the exam, so the two can
never drift out of sync. Both are inherited from the class by `Subject` at creation time.

#### The ceilings are the admin's, and the grade is normalised onto the scale

`maxScore` and `testMaxScore` are set per class, so a school can mark out of anything: 30/70
out of 100 is the default, 50/50 out of 100 and 20/20 out of 40 are equally valid. Only two
numbers are ever stored, and **the Exam is derived** (`maxScore − testMaxScore`), so the
parts can never stop adding up to the whole. Changing the split is a matter of moving
`testMaxScore`; changing the *total* means moving `maxScore` with it.

Two rules make an arbitrary ceiling work:

1. **The average already divides by the subject's own `maxScore`** (see the formula below),
   so it needs nothing else. A subject out of 40 scored 36 contributes 18/20 exactly as a
   subject out of 100 scored 90 does.
2. **The letter grade and remark are matched after normalising the mark onto the scale's own
   top** — the scale's top being read from its bands (any band above 20 means a 0–100
   scale), never assumed. This is what a primary card had wrong: it matched the **raw** mark,
   which silently assumed every class was marked out of 100. A subject out of 40 scored 36
   was looked up as "36" and stored an **F for a clean 90%**, while the report card *screen*
   normalised the same mark and showed an **A** — so the screen and the printed card
   disagreed about the same pupil. Fixed in `saveEntries` (`scoreForGrade`) and in
   `PrintableReportCard`'s `entryGrade`/`entryRemark`, which now take the subject's ceiling
   for primary. A class marked out of 100 is unaffected: dividing by 100 and multiplying by
   100 is what the code was already doing implicitly.

The ceilings are also **validated server-side, primary only** (`validatePrimaryScale`): the
Test must be at least 1 and strictly less than the subject total, so the Exam always has
something left. Enforced on create AND update, and on update the pair is checked as the
class will *end up* — cutting `maxScore` down below a `testMaxScore` set earlier is refused
with the same message. The web form's `max` attribute was the only thing guarding this
before, and a form is a suggestion; the endpoint is what decides. When a caller omits
`testMaxScore` it now defaults to **30% of the total** rather than a flat 30 — identical at
the standard `maxScore` of 100 (the familiar 30/70), and coherent below it, where a flat 30
used to produce a Test worth more than the whole subject.

A `Subject` **inherits both ceilings from its class when it is created** and keeps them.
Changing a class's ceilings afterwards does **not** rewrite subjects that already exist, so a
class edited mid-year can hold subjects on two different scales. The average tolerates that
(it normalises per subject), and so do the grades now, but nothing announces it: **set the
ceilings before creating the subjects.** Which is most of the reason for the rule below.

#### How a class is assessed is frozen for the rest of the year once a term has been published

**The rule (all school types):** a class's `maxScore`, its `testMaxScore` (primary) and its
`gradingMode` — marks or nursery ratings — can no longer be changed once that class has
**published report cards in a term of the current academic year that is no longer the current
term**. They stay frozen until the next academic year. Enforced in `updateClassLevel`;
`frozenScaleClasses` is the check.

Why it exists, for each half:

- **The ceilings.** Cards have already been handed out scored against that total, and because
  a `Subject` keeps its own copy of the ceilings (above), changing the class's would not
  re-scale anything — it would leave the class holding two scales at once, silently.
- **The mode.** A card already in a parent's hands either states an average and a position,
  or deliberately states neither. Flipping the mode afterwards makes those cards describe a
  class that no longer exists, and leaves the year's terms disagreeing about what a report
  card even is.

The details that matter:

- **Judged per class**, not per school. A class created in the second term has no published
  history of its own and stays fully editable, which is exactly when a school is most likely
  to be setting one up.
- **Changing within the current term is allowed.** The term is still open, nothing about it
  is final, and a school correcting a setup mistake in week two must not need permission.
- **Only a real CHANGE is refused.** Every other edit (rename, fee, order, department)
  re-sends `maxScore`/`testMaxScore`/`gradingMode` untouched, and those saves keep working —
  the check compares against what is already stored. `gradingMode` is compared *after*
  `resolveGradingMode`, so a client sending COMPETENCY to a secondary class (where it
  resolves back to NUMERIC) is not refused for a change it did not make.
- **The refusal names what was moved** — the totals, the marks/ratings choice, or both.
- **The academic year is the current term's session**; with no current term, the newest
  term's, so the freeze cannot silently lift in the gap between two years.
- **The escape hatch is the superadmin's**, and it is one-shot: `PATCH
  /superadmin/class-levels/:id/scale-unlock` sets `ClassLevel.scaleUnlockedAt`, the school
  then makes the change itself, and the change spends the grant (back to null). The
  superadmin deliberately does not edit the number — the school knows what the total should
  be, the superadmin is only deciding that changing it is warranted. It is a section on the
  superadmin's existing school detail page, beside the per-term printing toggles.
- The Classes form **disables both fields and says which term froze them** rather than
  letting an admin type a number the API will refuse. `GET /class-levels` returns
  `scaleLockedBy` (the closed term's name, or null) for exactly this.

One grant covers both halves: a school unlocked to fix a wrong total can also correct the
mode in the same save, and either one spends the key.

#### Term average — coefficient-weighted, normalised to /20

```
Average = Σ( (score / maxScore) × 20 × coefficient ) / Σ(coefficient)
```

Two independent things are happening here:

1. **Coefficients are applied.** Primary used to take a plain unweighted mean. Cameroon
   primary has no national coefficient table (that is a GCE/secondary thing), but schools of
   this kind do weight the core subjects — English/French/Maths above Arts/PE — and
   `Subject.coefficient` was already stored and set per subject, just never read for primary.
   It is now.
2. **Each subject is normalised to /20 *before* weighting.** The average a Cameroonian
   primary report card states is always out of 20, whatever scale the subjects were marked
   on. Normalising per subject rather than on the final total means a class mixing
   `maxScore`s (a /10 subject beside a /100 one) still averages correctly.

Worked example — the Class 6 card used to verify this:

| Subject | Score /100 | → /20 | Coeff | Weighted |
|---|---|---|---|---|
| English | 71 | 14.2 | 5 | 71.0 |
| French | 76 | 15.2 | 5 | 76.0 |
| Mathematics | 66 | 13.2 | 5 | 66.0 |
| Science & Technology | 72 | 14.4 | 3 | 43.2 |
| Social Studies | 70 | 14.0 | 3 | 42.0 |
| Citizenship | 67 | 13.4 | 2 | 26.8 |
| ICT | 77 | 15.4 | 2 | 30.8 |
| Health Science | 70 | 14.0 | 2 | 28.0 |
| Physical Education | 80 | 16.0 | 1 | 16.0 |
| Music & Arts | 69 | 13.8 | 1 | 13.8 |
| **Total** | **718** | | **29** | **413.6** |

Average = 413.6 ÷ 29 = **14.26 / 20**

**`totalScore` deliberately stays the RAW sum** (718 here), not the weighted figure: it is
the "Overall Total" a teacher adds up by hand, and normalising it would make it reconcile
with nothing else on the page.

#### What inherits the /20

`classAverage`, `bestAverage` and `annualAverage` are all means/maxes over the same
`ReportCard.average` column, so they became /20 automatically — there is no separate
conversion for any of them, and there must not be.

Two consequences worth stating, because both were live defects until they were fixed:

- **The pass mark is 10/20**, not 50/100 (`TRUE_PASS_MARK_PRIMARY` in `term.controller.ts`
  and `promotionScale.controller.ts` — the same value as secondary's, kept under its own
  name so the two stay independently adjustable).
- **Anything matching the AVERAGE against the grading scale must scale it back up**, because
  a primary scale is written 0–100 while its average is /20. This affects the overall `grade`
  field and the `appreciation` field on the printed card, and `avgMaxScore` on the report
  card screens. Getting it wrong reads a perfectly good 14.26/20 as 14.26/100, i.e. an F.
  Per-**subject** grades are unaffected — those are raw /100 and match directly.

The web and mobile report card screens **recompute this average client-side** as marks are
typed, so their formula must mirror `saveEntries` exactly or the figure jumps the moment it
is saved.

#### Migration

`apps/api/src/scripts/recomputePrimaryAverages.ts` rewrites `average`, `totalScore` and
`position` for every primary school under the current rule (dry-run by default, `--apply` to
write). Cards written under the old plain-/100-mean rule store a figure the whole app now
reads as /20 — 69.4 would print as 69.4/20 and clear every threshold in sight. **Positions
are re-derived too**: a uniform rescale preserves rank order, but introducing coefficients
does not.

#### Nursery / pre-primary — assessed by RATING, not by marks

A Cameroonian nursery class is not marked and is not ranked. Each subject carries a
developmental **rating**, and the report card has no total, no average and no position —
ranking three-year-olds is exactly what this mode exists to avoid.

**The mode is a stored field on the class, not a guess from its name.**
`ClassLevel.gradingMode` is `NUMERIC` (default, every existing class) or `COMPETENCY`.
Name-matching `/Nursery/` was rejected outright: class names are free text, a French section
calls these *Maternelle*, and a school may want Class 1 rated too. It is **primary-only** —
`resolveGradingMode` in `classlevel.controller.ts` forces `NUMERIC` for secondary and
university, the same shape as `resolveProgramme`'s university-only gate.

The ratings are **per school** (`CompetencyScale`, 2 to 6 levels), edited under **Grading
Scale** on web and mobile and only offered when a class is actually on `COMPETENCY`. A school
that has never customised them keeps **no row at all** and is served these three built-ins, so
nothing changed for any existing school and the defaults can still be improved centrally:

| Rating | Meaning |
|---|---|
| `Attained` | The child has the competency |
| `Developing` | On the way to it |
| `Not Yet Attained` | Not there yet |

Each level carries `labelEn`, `labelFr`, a `short` code (for narrow print columns) and a
`color`. **Both languages are stored on the level** because a custom label has no `t()` entry
to look up; only the three built-ins go through `t()`.

**Renaming a level is deliberately NOT retroactive**, and that falls straight out of storing
the label verbatim: a card issued last term keeps the exact word it was printed with. The
consequence every reader must handle is that a stored rating may be a label the school no
longer has. Resolve one with **`findLevel`**, which falls back to rendering the stored wording
in a neutral colour, never with a membership test against the live scale. `isRatingIn` is the
strict check, and is for validating what a teacher just submitted, not for display.

Two places that would otherwise lose data silently:

- **The marks picker sends an untouched row without a `rating` key**, so the API carries
  forward what is stored. Re-sending a rating from an older scale would fail the server's
  "is this a current level" check and clear it. Only a row the teacher changed asserts a value.
- **A rated card prints a `RATING SCALE` legend.** It used to print none, on the reasoning
  that the built-ins explain themselves; that stops holding once a school names its own levels.

Changing the levels is refused once a rated class has published cards for a closed term of the
session, the same freeze the class form applies to mark ceilings and `gradingMode`
(`utils/scaleFreeze.ts`, shared by both so there is one rule rather than two).

**Where a rating is stored — and why it looks odd.** It goes in `ReportEntry.grade`,
verbatim, as the English label (`apps/api/src/utils/competency.ts` is the single source;
`apps/web/lib/competency.ts` and `apps/mobile/lib/competency.ts` mirror it for display).
Deliberately the human-readable label rather than a code, for two reasons: every report card
template already resolves and prints a `grade` column, and there is no second mapping layer
to drift out of sync. **Translation happens at display time, never in storage** — `levelLabel`
picks the level's own `labelEn` / `labelFr` by section language, and only the built-ins
additionally route through `t()` (a custom label has no `t()` entry, which is why both
languages live on the level). So a French section reads *Acquis / En cours d'acquisition /
Non acquis* over the same stored rows.

**`score`, `seq1Score` and `seq2Score` stay NULL on a competency entry.** That is what keeps
the average, the total and the position empty *without any of the arithmetic knowing this
mode exists* — a null score already means "not marked" everywhere. `saveEntries` takes a
separate short path for these classes that returns before all the mark arithmetic, validates
the rating against **this school's own levels** (`levelsForSchool` + `isRatingIn`; a bad value
400s **before** the delete, so a bad payload can never wipe a card), and explicitly nulls
`average` / `totalScore` / `position`.

**The carry-forward guard (data-loss trap).** The competency save replaces a card's entries
wholesale, so a caller must re-send every subject on the card. A subject is keyed on whether
the `rating` key is **present**, not whether it is truthy:

- `rating` absent → keep whatever rating that subject already has;
- `rating: null` or `''` → clear it (so "unset this" stays expressible);
- `rating: '<one of the school's current levels>'` → set it.

Without this, opening a nursery subject in an old numeric grid and hitting Save would wipe
the whole class's ratings, since that grid re-sends every subject with seq1/seq2 and no
`rating` key at all.

**"Is this card complete?" is written in FOUR places**, and all four are competency-aware or
a nursery card could never be published: `findPublishBlockers`, `getReadinessDetail`,
`publishReportCard`, and `getClassReadiness` — the last keyed **per class**, because one
primary school runs both modes at once (nursery rated, Class 1–6 marked). For a rated class,
"complete" means every subject carries a rating.

**The mode is not freely switchable forever.** It can be changed at will while a term is
still open, but it freezes with the class's mark totals once a term of the year has closed
with published cards — see *How a class is assessed is frozen…* above. Under that freeze it
is the superadmin's one-shot unlock or nothing.

**Clients never guess the mode.** `GET /report-cards/:id` and
`GET /report-cards/class-overview` both return `gradingMode`, and the overview's entries
carry `grade` so a marks sheet can build its rows from that one response. `marksFilled` on
the overview is judged on ratings for a rated class, not on seq1/seq2.

**What the UI does with it** (all of it branches on the class, never the school):

- **Marks entry** — a rated class opens a **rating picker** instead of the numeric
  spreadsheet: one button per level per pupil (so 2 to 6, whatever the school defined), no
  Test/Exam tabs, no maximum, no keyboard on mobile. Tapping the rating a pupil already has
  clears it. A *"Rate everyone still blank"*
  bar fills only the unrecorded pupils, so it can never overwrite a deliberate pick and
  needs no confirmation. Only pupils whose rating actually changed are written.
  (`CompetencyEntry.tsx` on web, `components/CompetencyMarksEntry.tsx` on mobile; the route
  file dispatches to it after reading the class's mode.)
- **Report card screens** — the average / overall grade / position / class average tiles are
  replaced by a rated count and a plain statement that this class has none; the subject
  table shows one Rating column.
- **Printing** — the school's **saved design is reused**, with every measuring column
  dropped at render time (score, Test/Exam, coefficient, credit, grade point, weight,
  remarks, min/avg/max, jury decision) and the footer bands (TOTAL / TERM AVERAGE / CLASS
  POSITION) suppressed, leaving subject + rating. The summary strip and the grading legend
  are skipped entirely. One saved design therefore prints correct cards for both the nursery
  and Class 1–6 of the same school. See `PrintableReportCard`'s `gradingMode` prop.
- **AI remarks are not offered** on a rated card: the draft is written *from* the average,
  and there isn't one. The general remark is still required to publish, written by hand.

**Locks are identical to the numeric sheet's** — a published card, the school's
`marksEntryMode`, and a closed term all behave exactly as they do for marks.

#### Converting an existing nursery class

`apps/api/src/scripts/convertClassToCompetency.ts` (dry-run by default, `--apply` to write)
flips a class to `COMPETENCY` and rewrites its existing numeric cards as ratings: ≥70%
`Attained`, ≥50% `Developing`, else `Not Yet Attained`, then nulls the card's average,
total and position. Percentage-based, so it is independent of whatever `maxScore` the class
was marked on. It is idempotent — an already-converted class is left alone. Live ratings are
never derived from a score; only this one-off migration does that.

---

### University GPA Algorithm (CITEC-style, /100 marks)

University schools use a **different grading system** from primary/secondary:

- Marks are entered **out of 100** (CA /30 + Exam /70 = /100). `ClassLevel.maxScore = 100`.
- There are no coefficients — instead each course has a **Credit** value (`Subject.credit`).
- There are no Seq1/Seq2 sequences — a single `score` (the total /100) is stored.

#### Step 1 — Grade Point lookup

The **Grade Point (GP)** is read from the school's grading scale (the `/grading-scale` page). Default scale:

| Mark /100 | Grade | Grade Point (GP) |
|-----------|-------|-----------------|
| 90 – 100  | A+    | 4.00 |
| 80 – 89   | A     | 3.70 |
| 70 – 79   | B+    | 3.30 |
| 60 – 69   | B     | 3.00 |
| 55 – 59   | C+    | 2.30 |
| 50 – 54   | C     | 2.00 |
| 45 – 49   | D+    | 1.50 |
| 40 – 44   | D     | 1.30 |
|  0 – 39   | F     | 0.00 |

#### Step 2 — Weighted Point

```
Weighted Point (WP) = Credit × Grade Point
```

**Example**: Course with Credit=14, Mark=75 → GP=3.30 → WP = 14 × 3.30 = 46.20

#### Step 3 — Semester GPA

```
Semester GPA = Σ(WP for all courses in semester) / Σ(Credits for all courses in semester)
```

All courses registered in the semester are included, **including failed courses (F, GP=0)**.

**A compulsory course with no marks counts as ZERO — it is not skipped.** A university
department is a fixed course list: every student in it sits every course, no exceptions. So a
compulsory course with no entry means the student did not sit it, which is a zero. It prints
`00`, grades F, takes a FAIL jury decision, and carries its full credits into the GPA
denominator at 0 grade points, exactly like any other failure. A missing CA or Exam component
is treated the same way (`TOTAL = CA + Exam` with a missing part as 0), so one component is
enough to give the course a real total.

**Optional courses (`Subject.compulsory = false`) work by EXCLUSION, not by opting in.** Marking
a course optional does not on its own take it off anybody: it only makes it possible to tick
individual students off it, on Courses → the course → "Not taking". Everyone else still sits
it, so an optional course with nobody excluded behaves exactly like a compulsory one. That
default is deliberate — an opt-IN list would have silently emptied every optional course the
day it shipped.

A ticked-off student's course (`SubjectExclusion`) disappears completely and consistently: it
is not listed on their report card, it never blocks publishing, and it contributes neither
grade points nor credits to their GPA. Anything answering "which courses does this student
offer" must consult it, or two screens will disagree about the same student.

Two guards: a compulsory course refuses exclusions outright (make it optional first), and a
student who already has a mark for the course cannot be ticked off it — the mark is evidence
they sat it, so the marks have to be removed first as a deliberate act.

Note the flag alone never excuses a course from the GPA. Only an exclusion does. Testing
`compulsory !== false` in the GPA sums instead made every optional course vanish for the
students who DO take it (caught by test, 2.29 vs 4.00 on a two-student class).

**This is UNIVERSITY-ONLY.** Primary and secondary have optional subjects and streams, so an
unmarked subject there stays out of the average entirely, which is what the API's average has
always done ("skip unfilled subjects").

Getting this wrong is what produced the original bug report: the report card detail page
zeroed unmarked courses while the report cards LIST iterated only real entries and could not
see them at all, so the same student's first semester read 1.33 (20/15) on one screen and
1.67 (20/12) on the other. Any GPA computed from `reportCard.entries` alone is wrong for a
university — it must be compared against the class's compulsory subject list for that term.
Three places do this and must stay in step: `getReportCards` (per-card GPA and CGPA),
`getReportCard` (CGPA), and the report card detail page's client-side semester GPA.

#### Step 4 — CGPA (Cumulative GPA)

```
CGPA = Σ(WP for ALL courses, both semesters) / Σ(Credits for ALL courses, both semesters)
```

Again, every registered course (pass or fail) is included — this matches standard university practice.

**The CGPA appears only on the card that CLOSES the academic year**: the second semester at a
university, the third term everywhere else (where the equivalent year-end figure is the
**annual average**, which has always followed this rule). Judged from the session's own terms
ordered by `startDate`, not by counting to a fixed number, so a school running a different
shape still works.

Why it is gated: the CGPA is cumulative over every published semester the student has, with no
"up to this card" bound. On a first-semester card that meant showing a total that included the
second semester's marks — results that did not exist when that card was issued — and the
figure moved on its own the moment a later semester was published, so reprinting an old card
gave a different number than the one handed out. A first semester now shows no cumulative at
all, which is also why the first semester's GPA and CGPA no longer appear to disagree.

**Classification (step 6) appears on EVERY semester**, unlike the CGPA. It answers "where does
this student stand", which is worth knowing in December as much as in June. It bands the CGPA
once the year has one, and that semester's own GPA before then, so the classification always
describes a figure printed beside it on the same card.

Only the CGPA itself is withheld, and it prints `—` rather than falling back to the semester
GPA: that is a different figure and must never be relabelled as a cumulative one.

#### Step 5 — Overall Credits Earned

```
Overall Credits Earned = Σ(all credits registered, both semesters)
```

This is total registered credits, **not** just passed credits. The transcript prints this as a summary statistic.

#### Step 6 — Classification

The CGPA maps to a classification (shown as the transcript "REMARK"):

| CGPA Range  | Classification  |
|-------------|----------------|
| 3.60 – 4.00 | Distinction    |
| 2.80 – 3.59 | Upper Credit   |
| 2.40 – 2.79 | Lower Credit   |
| 2.00 – 2.39 | Pass           |
| 0.00 – 1.99 | Fail           |

#### Verification example (from CITEC real transcript)

- Semester 1: Σ(WP) = 153.7, Σ(Credits) = 60 → Sem1 GPA = 153.7/60 = 2.56
- Semester 2: Σ(WP) = 157.4, Σ(Credits) = 60 → Sem2 GPA = 157.4/60 = 2.62
- CGPA = (153.7 + 157.4) / (60 + 60) = 311.1 / 120 = **2.59 → Lower Credit** ✓

#### Annual Transcript

The annual transcript combines every period of the year — **all school types** now, not university only (primary/secondary get a three-term "Annual Report" variant; see §12 → *Annual transcript*). Accessed from the report-cards list via the scroll icon on the **closing period's** rows (2nd semester / 3rd term), enabled once every period of that year is published for the student. The page is `/report-cards/transcript/[studentId]?session=XXXX/XXXX`, with Student copy / Official print buttons and a preview toggle.

The transcript shows:
1. School header + student info (name, matricule, department, session, sex)
2. **First Semester table**: CODE | TITLE | CREDIT | MARK /100 | GRADE | GP | WP | REMARK
3. Per-semester totals row + Semester GPA
4. **Second Semester table** (same columns)
5. Bottom section (3 side-by-side panels): Grade System table · Classification table · Legend
6. Overall summary: Credits Earned + CGPA + Remark classification
7. Signature lines: Dean of Studies + Registrar

---

### University marking (CA / Exam / Resit)

Universities mark differently from primary/secondary:

- **CA is out of 30, the Exam out of 70, the course out of 100** (`TOTAL = CA + Exam`). The grading scale is written on the /100 scale and its bands carry `gradePoint` (/4.0) and `juryDecision` (`VALIDATED` / `FAIL`).
- **`juryDecision` outranks the grade letter** wherever a pass/fail question is asked — a school can jury a passing-looking letter as a fail (e.g. D 45–49 = FAIL). Shared helpers: `isFailingScore` / `isFailingMark` (web `lib/grading.ts` + `lib/api/gradingScale.ts`, mobile `lib/api/gradingScale.ts`, API inline). Bands match on their **lower bound** (not min..max containment): integer bands leave gaps that fractional marks (e.g. an exam of 31/70 = 44.29/100) would fall through and wrongly read as a pass.
- **Resit**: re-sits the **exam only**; CA carries over. `score` becomes `CA + resitScore`, and the original exam stays on file. **Eligibility = the student failed the course** (per the school's own scale) — nothing else. A student who passed the exam but failed the course on a weak CA is exactly who a resit helps. Enforced in `saveEntries` (unchanged pre-rule marks are grandfathered), not just the UI.

### Failing marks in red

School-wide toggle in Report Card Design (`highlightFailingRed`, default **on**, stored top-level in the template config so the report card and transcript can never disagree). A subject the student **failed** (per the school's own scale, `juryDecision` first) prints its **numbers and grade letter** in red — seq scores, score, coef/credit, grade point, weighted point. Text cells (code, title, remark, jury decision) stay black; passed subjects are untouched. Applies to every school type and to the Resits appendix table. Mobile shows the same red on the report-card score list.

---

## 8. Subjects & Coefficients

Each subject has:
- **Name** — e.g. "Mathematics"
- **Class Level** — selected from existing classes (dropdown)
- **Max Score** — what marks are entered out of. Default 20 (secondary); **100 for primary and university**. Inherited from the `ClassLevel` at creation.
- **Test Max Score** — **primary only**: the Test component's ceiling out of `maxScore` (default 30). The Exam ceiling is `maxScore − testMaxScore`, derived rather than stored. Ignored by secondary/university. See §7 → *Primary marking & averaging*.
- **Coefficient** — weight in the final average (default 1). Read by **secondary and primary**; a university weights by `credit` instead.
- **Required Hours** (optional) — target teaching hours: per semester for universities (the row is already semester-scoped via `term`), per academic year for primary/secondary. Drives §20 Teaching Hours Coverage; leave blank to skip tracking a subject entirely.

**Subject exclusivity**: each subject in a class belongs to exactly one teacher. Assigning it to a new teacher automatically removes it from the previous one. Admin sees a yellow notice listing what was reassigned.

**Primary is the exception**: a primary class is taught by a shared **team of 1–3 teachers**, all of whom hold every subject in that class at once. That is a team, not a handover, and coverage/absences treat it as one — see §20 → *Primary shared teaching teams*.

---

## 9. Report Cards Flow

### Who does what

| Step | Who | What |
|------|-----|------|
| 1 | **Admin** | Creates report card explicitly for student + term (or auto-created by teacher on first save) |
| 2 | **CLASS_TEACHER / CLASS_MASTER** (or **Admin/VP** when the school is set to Administration-only marks) | Fills marks (Seq1, Seq2 — university: CA, Exam, Resit) via the marks entry page |
| 3 | **API** | Auto-fills per-subject grade + remark from grading scale on every save |
| 4 | **CLASS_MASTER** (or **Admin/VP** if the class has no master) | Adds/edits general remarks for all students in the class |
| 5 | **Admin** | Reviews everything and publishes the report card |

### Publish rules (enforced server-side, single + bulk)

A report card can only be published when **ALL** of these are true — checked in the API, not just the UI:

1. The class has at least one **subject**.
2. **Every subject has both sequences filled** (Seq1 AND Seq2) — i.e. every teacher has filled their marks. A subject with no assigned teacher still blocks until its marks are entered. On a **rated (nursery) class** this rule reads "every subject carries a rating" instead — see §7 → *Nursery / pre-primary*.
3. The report card has **general remarks** — **required for every class** (updated 2026-06-15; previously only classes with a class master).

The bulk **"Publish Class"** action checks the whole class: the dropdown button is disabled until every student passes, and the API reports per-student `issues` (missing sequences / missing remarks / no subjects) for any it skips.

### Who writes general remarks

- Class **has** a class master → only that master writes the general remarks (as before).
- Class has **no** class master → **SCHOOL_ADMIN / VICE_PRINCIPAL** write the general remarks themselves, on the report-card detail page (a "Save Remarks" box appears). This keeps every class publishable.
- School is set to **Administration only** (see below) → such a school appoints no class masters at all: the admin writes the remarks, the card never names a master, and a class master role is refused by the API on both writing and AI-generating remarks (authorisation is checked before the "fill all marks first" validation).

### Published = frozen, for everyone

Once a card is **PUBLISHED**, nobody can save marks on it — the administration included. Unpublish first. Publishing fixes a class's averages and positions, so a mark moving underneath a published card would silently invalidate cards already handed out; making the admin unpublish makes that consequence a deliberate act. Enforced in `saveEntries` with **no role exemption** (this also closed a hole where SUBJECT_TEACHER, unnamed in the old check, could edit published marks). The one exception is the explicit `marksEditGrantedTo` grant, consumed on use. The marks-grid banner names the remedy per role: an admin is told to unpublish, a teacher to ask their admin.

### Signing in: email or username

Not every teacher has an email. An account can therefore be created with a **username** instead, and `POST /auth/login` accepts either identifier in the same field — email is tried first (still the common case), the username lookup only runs if that misses. Both login screens say "Email or username", and iOS AutoFill is told `username`, not `emailAddress`, so it offers both.

**Switching from a username to an email later is self-service.** `PATCH /auth/me/email` sets it for the signed-in user, and **adding an email never clears the username** — both keep working, so nobody is locked out mid-switch. Reachable from:

- **Web** → `/account` (teachers/class masters) and Settings → Account (admins).
- **Mobile** → Account. This did not exist before, which mattered most: teachers are the people who get a username, and the phone is where they live. Nobody else could do it for them either — an admin's teacher edit takes role, class and departments only.

The card stays visible **after** an email is set, so a typo can be corrected. Hiding it once an address existed stranded the user: an address they cannot receive mail at owns their password recovery, and no admin screen can fix it.

**An admin can set it too.** `PUT /teachers/:id` now accepts `email`, so an admin holding the address on paper, or fixing a typo that has broken a teacher's recovery, no longer needs that teacher to do it themselves. Sent-or-not like `departments`: omit it and the address is left alone. Clearing it back to nothing is refused (400) unless the teacher has a username, or the account would be left with no way to sign in; a clash returns 409.

**Changing an address asks for the current password; adding the first one does not.** Whoever owns the login email owns password recovery, so an unattended phone was enough to move an account to a stranger's address. Adding a first email carries no such risk — there was nothing to take over — and that is the flow this exists to make easy, so it stays frictionless. Enforced in `updateMyEmail` (400 without, 401 wrong) and asked for by all three self-service surfaces. The admin path above is deliberately exempt: an admin proving their own password says nothing about the teacher whose address they are setting.

`forgot-password` remains email-only by design — it emails a link, and a username-only account has nowhere to send it. That is what the admin's direct reset is for.

### Who enters marks (`School.marksEntryMode`, university setting)

Some universities record marks centrally so the person who teaches a course never enters its marks:

- **TEACHERS** (default) — exactly the flow above; nothing changes.
- **ADMIN_ONLY** — only SCHOOL_ADMIN / VICE_PRINCIPAL may save marks (CA, Exam **and** Resit). Teachers open the marks sheet **read-only** with a banner naming the policy, so they can still check their subject. Enforced in `saveEntries` (403), not just the UI. Admins enter marks from the **Courses page** (Level → Department → Semester → course → *Enter marks*) or via the report card's *Edit marks* button; the marks sheet has an in-place **CA / Exam / Resit switcher** (web + mobile).

**Switching the mode is capped and audited**: a school may switch **twice per semester** (free between academic years, when nothing is running); after that the **provider (superadmin)** sets it from the superadmin school page — uncapped, logged as the provider, never counting against the school's two. Every switch is a permanent `MarksEntryModeChange` row (who, when, which semester) shown in Settings with a "used X of 2" counter. This cannot stop a dishonest admin (they can already change any mark); it removes the ability to flip quietly.

### An admin may always enter marks at a primary or secondary school

Teachers still own the job — the readiness panel keeps naming exactly who has not filled which subject, and that is unchanged — but a term cannot be held hostage by one teacher who has gone unreachable. So at a **PRIMARY or SECONDARY** school an admin/VP can record marks themselves, in the ordinary marks sheet, whatever `marksEntryMode` says. Needing a per-card grant to act as the fallback (which the admin issued to themselves anyway) was ceremony, not a control.

**University is unchanged**: `ADMIN_ONLY` is the arrangement built for exactly this, it is capped and audited, and switching it on is the deliberate act that moves entry to the administration. An explicit per-card grant still works everywhere, and a **published card stays frozen for everyone** — to change a mark you unpublish first.

The rule lives in `saveEntries` and is mirrored by `adminMayEnterMarks` in both clients (`lib/marksPermission.ts`), so a grid never invites an edit the API will refuse. The same rule drifted across three call sites once before; keep it in the helper. Nursery ratings count as primary — the old blanket "an admin never enters" locked them out of the one school type where they are the fallback.

### Admin view

The admin report card detail page is **read-only for marks**. Admin sees subject scores, letter grades, coefficients, per-subject remarks, general remarks, average, and position, and can **Publish**. Admin/VP can also **write the general remarks** when the class has no class master (otherwise remarks are master-only).

### Marks entry (teacher / class master)

- Go to: Classes → select class → select subject → select sequence
- **Sequence labels are term-aware** (Cameroon system): Term 1 → Seq 1/2, Term 2 → Seq 3/4, Term 3 → Seq 5/6. Data still stores in `seq1Score`/`seq2Score`; only the displayed label changes (derived from the term name — see `lib/sequences.ts`, web + mobile).
- Marks are entered one student per row, out of the subject's maxScore
- A **"Copy marks from <other sequence> → fill here"** bar bulk-fills the tab from the other sequence. **Primary/secondary only.** It is never offered at a university, where CA is out of 30 and the Exam out of 70: neither is a sensible starting point for the other, since copying CA into Exam would silently halve every student and copying Exam into CA would write scores above the CA maximum. The shortcut only means something where both sequences share one `maxScore`. Resit has nothing to copy from either way. The bar also respects `ADMIN_ONLY` and per-row locks, or it would be a bulk back door around cells the user cannot type into.
- The **REMARK** column shows live performance text (e.g. "Average") from the grading scale
- Saving marks does **not** overwrite the general remarks set by the class master
- Report card is auto-created for students who don't have one yet

---

## 10. Class Master System

### Role
`CLASS_MASTER` is a teacher who:
1. Teaches specific assigned subjects (like any teacher) — can fill marks for those subjects only
2. Is master of exactly one class (`masterClassLevel`) — can write general remarks for all students in that class

### Assignment
When admin creates a CLASS_MASTER, they must select the class that person is master of. Each class has exactly one master at a time. Assigning a new master to a class automatically demotes the previous master to CLASS_TEACHER.

### Web — Classes nav (marks entry)
- CLASS_MASTER sees all their assigned classes
- Tapping any class → subjects list for marks entry
- If the class is their `masterClassLevel` → purple **"Add/Edit General Remarks"** banner appears at the top

### Web — My Class nav (general remarks)
Page `/class-master` — shows all students in their master class with:
- Average (X.X), card status (Draft/Published), current general remarks preview
- "Add Remarks" / "Edit" button → modal with textarea
- Saving calls `PUT /report-cards/:id/remarks`

### Mobile
- Two tabs: Home + My Classes
- Tapping a class → subjects list (marks entry)
- If master class → purple banner at top links to remarks screen
- Remarks screen: list of students with bottom sheet modal to edit remarks

---

## 11. Teacher Management

### Creating teachers
Admin goes to Teachers → Add Teacher:
- Choose role: **Class Teacher** or **Class Master** only
- If Class Master: must select which class they are master of
- Email must be unique

### Editing teachers
Pencil icon → edit modal:
- Change role (CLASS_TEACHER ↔ CLASS_MASTER)
- Change masterClassLevel (CLASS_MASTER only)
- If new master of a class is set → old master auto-becomes CLASS_TEACHER

### Assigning subjects
"Subjects" button → subject picker grouped by class:
- Select/deselect subjects
- If a subject is already assigned to another teacher → it's silently taken from them
- Admin sees a yellow "Subjects reassigned" notice listing what moved

---

## 12. Report Card Design

### Template types
Four base templates: **Classic** (navy), **Bilingual** (green, FR/EN), **Modern** (blue), **Official** (brown, bordered).

### Section-based editor (`/report-card-design`)
Layout stored as `sections` array. Section types:

| Type | Description |
|------|-------------|
| `header` | School name, logo, title, subtitle |
| `student_info` | Student name, class, term, guardian |
| `marks_table` | Subject scores table (shows remark text in Grade/Remarks columns) |
| `summary` | Average (X.X), position (ordinal), overall grade (remark text) |
| `signatures` | Signature lines |
| `remarks` | General remarks block |
| `text_block` | Free text |
| `divider` | Horizontal line |
| `stamp` | The school's official seal (`School.stamp`, uploaded once in School Settings **or** from the designer toolbar). Defaults to *Official only*. No stamp uploaded → prints **nothing** (the "Official Copy" note carries the identification; schools may stamp the printed page by hand) |
| `grading_legend` | Grade-system table, classification bands, abbreviation legend, editable side tables |

Every section also carries **`showOn`** (*Both copies* / *Official only* / *Student copy only*) — see **Official vs Student copies** below. `student_info` rows whose value is empty are **dropped at print time, label and all** (a dash asserts "none"; an untyped birthplace is not the same thing), and an all-empty section stands down entirely.

### Display format on printed card
- **Grade column**: shows the remark text (e.g. "Good") from the grading scale
- **Average**: shown as `14.4` (no /20)
- **Position**: shown as `3rd` (ordinal)
- Grade badges: squared corners (not circular)

### Hide tools

The toolbar is ~190px of controls sitting above the thing an admin is actually trying to look at. **Hide tools**, beside the title, collapses it to a 57px bar — 131px of card back, and the sticky LAYOUT rail moves up with it. The choice is remembered per browser (`localStorage`, `report-card-design-tools`), so someone who works collapsed does not re-collapse on every visit.

**Save Design stays visible when collapsed**: having tidied the bar away to look at the card, you should not have to bring it back just to keep your work. Add Section travels with the rest of the tools. The second row (the spreadsheet cell toolbar) normally holds its space so the bar never resizes as cells are selected; collapsed, that reservation would defeat the point, so it appears only when there IS a selected cell — a collapsed bar grows from 57px to 98px while you are editing a table, then shrinks back.

### Colour: the picker repaints the design

A table's colours live **on its cells** (`bgColor` / `textColor`, written when the table was seeded) rather than being read from the design's `primaryColor` at render time — that is what lets an admin colour one column differently from the rest, which the cell toolbar exists for. The consequence was that the **Color** box only moved the parts that read `primaryColor` live (captions, rules, hero text) and left every table header on the colour it was born with: an Annual layout seeded teal `#0f766e` stayed teal however many times Color changed, on screen and on paper.

Changing **Color** or **Accent** now repaints the design (`recolorSections`, a deep walk that swaps one colour for another wherever it appears, so `bgColor`, `textColor`, `valueColor`, `placeholderColor` and a colour inside legend HTML are all covered). Color repaints `primaryColor` **plus whatever the marks-table header rows are actually painted with** (`primaryColorTargets`) — reading the colour off the header is what makes the picker work on a design whose tables never matched `primaryColor` in the first place. White and the page background are excluded, so an uncoloured header cannot drag every white in the document with it; the neutral `#f1f5f9` totals bands are untouched. Save, and the report card preview, the annual report and every print/download follow, since all of them render from these same cells.

### Text colour: select the words, pick a colour

Selecting text in an editable label raises a floating palette; the colour is stored **in the text** (the fields are contentEditable, so the value becomes `<font color="…">…</font>`). Two things stopped that working:

- Several fields were printed as plain React children, so the colour either vanished or the markup printed as literal characters. Everything an admin can colour now goes through **`richLabel`**, which translates the TEXT while keeping the markup (a translation key never matches a string with tags in it) and returns the designer's exact markup untouched when no translation applies, so a label carrying two colours keeps both. Covered: the title ribbon, the marks-table caption, panel titles and their rows, the annual band tag, the stamp caption, the remarks signature caption, and the grading-legend title and its summary-table titles. Table CELLS are a separate mechanism and always worked — they carry `textColor` / `bgColor`, set from the cell toolbar.
- The palette appeared over **any** selection in the canvas, including text that is not editable here — the term chip, the school name and contact line (both from School Settings), sample data — and then ran `execCommand` on a non-editable node and did nothing. It now only appears inside `[contenteditable="true"]`, because a palette that appears and silently no-ops reads as the colour being applied and not sticking.

The term chip's words are generated (term name + session), so there is nothing to select: the header section has **Chip colour** and **Chip text** swatches instead. Clicking the chip on the canvas focuses the Chip text swatch and flashes it for a moment, since selecting its text is what people try first. Both swatches appear wherever a design HAS a title ribbon, which is every redesign header (`headerStyle: 'crest' | 'logo'`) on every layout and school type. A design saved before the redesign carries no `headerStyle` and draws the old letterhead, which has no ribbon and therefore no chip — in the designer and in print alike; picking a header style adds one.

**Bound values on the canvas show their `[field]` key, never an example.** Student-info rows read `[student.name]`, `[student.classLevel]`, `[term.session]`, and the chip reads `[term] · [session]` — the same convention the marks table (`[m:subject]`) and the summary boxes (`[average]`) already used. Sample data ("Nguemo Alice", "Form 4 Science", "12 May 2003") invited the reading that the design carries that data, and made it impossible to tell which field a row was bound to without opening its dropdown. Printing is unaffected: `resolveField` is designer-only, and a real card still prints Edith Fru / RIA-0040 / Class 1 / Third Term · 2026/2027.

This holds for **every layout and every school type** — the `SD` / `SD_UNI` sample-data constants were deleted outright, so there is nothing left to fall back to. Audited on the canvas across Standard / Ledger / Annual (Transcript at a university) for all three types: no sample values anywhere, 14–28 bound `[keys]` per layout. The one intentional exception is a transcript's **period caption** ("First Semester", "THIRD TERM"): it names which slot each table covers, which is what lets you tell three identical-looking tables apart while designing, and the printed card replaces it with that term's real name.

**Editable labels are one element, editable at all times.** They used to render a plain `<span>` and swap it for a contentEditable `<div>` on the first click, which broke the gesture people actually use: a double-click's two clicks landed on two different nodes, so the browser often did not treat it as a double-click and selected nothing — and when it did, a `setTimeout` left from entering edit mode collapsed the caret to the end and wiped the selection a moment later. Since the palette only appears for a real selection, it came and went for no visible reason. Two more sources of the same symptom: the sample-data cells rewrote their own `innerHTML` after **every** canvas render (no dependency list), so an unrelated edit could replace the text nodes a selection pointed at; and the palette was positioned at `rect.top - 48` with no clamp, so colouring anything in the upper part of a scrolled canvas put it behind the 188px sticky toolbar or off the top of the window. It now flips below the selection when there is no room above, and stays inside the window horizontally.

One consequence worth knowing: text scrolled under the sticky toolbar cannot be clicked at all — that is the toolbar receiving the click, not the field failing.

### Section-type defaults (Primary / Secondary / University)
A school with **no saved report-card design** starts from `getDefaultLayoutForType`. Admins edit & save from there.

Since the 2026 redesign the three types are **not** independent layouts: they share one. Same navy `#1d3557` theme and `#b58a2b` accent, the same "STUDENT REPORT CARD" title, the same "General Remarks" label, and the same ten sections in the same order — header · student info · marks table · summary strip · annual band · a panel row pairing the grading legend with **Conduct & Attendance** · remarks · a second panel row of two remarks blocks · stamp · text block. None of the three carries a signatures section. They differ in exactly two things:

| Section | Marks columns (and totals bands) | Summary boxes |
|---------|----------------------------------|---------------|
| **Primary** | S/N · Subject · **Test** · **Exam** · Total /100 · Grade · Remark. No coefficient column, and **no totals bands at all** — see "Primary states each figure once" below | Term Average /20 · Class Average /20 · Position in Class · Best Average · Appreciation |
| **Secondary** | S/N · Subject · **Coef** · Seq 1 · Seq 2 · Avg /20 · **Avg × Coef** · Grade · Remark, banded with TOTAL COEFFICIENTS / TOTAL POINTS OBTAINED / WEIGHTED AVERAGE /20 | identical to primary's five |
| **University** | S/N · Code · Course Title · Credits · **CA** · Exam · Total /100 · Grade · **GP** · **WGP**, banded with TOTAL CREDITS / TOTAL POINTS / GPA | Total Credits · Semester GPA · Cumulative GPA · Class Average · Classification |

Beyond those, only three labels vary: primary says **Pupil ID** where the others say Student ID, and university says **Programme** / **Semester** where the others say Class / Term.

The per-type builders that gave each type its own colour, title and signature blocks (`getLegacyDefaultLayoutForType`) are **pre-redesign and no longer used** — kept only for reference and rollback. Conduct & Attendance survives as a hand-filled panel (Discipline / Punctuality / Days Absent / Late Arrivals / Warnings Issued), not as summary boxes.

Hand-filled fields (Conduct, Attendance, GPA, CGPA, Credits) render as `—` placeholders — design only, no change to grade calculation.

**Primary states each figure once.** A primary Standard card carries no `OVERALL TOTAL` / `TERM AVERAGE` bands under its marks table: the summary boxes directly below already give the term average, so a band there only repeated it under the Grade and Remark columns. Secondary keeps its bands (they total coefficients and weighted points, which no box shows), and **Ledger keeps its own** — that layout has no summary section at all, so its bands are the only place the figures appear. Applied in three places, because a default alone would never reach a school that had already saved a design: the default (`buildRedesignLayout`), the designer on load (`ensureNoPrimaryTotalsBands`, same one-time backfill idea as `ensureBirthRows`), and the print renderer, so a card is correct whether or not the admin ever re-saves. The shared gate is `dropsPrimaryTotalsBands`; nursery/competency cards drop all footer bands earlier and are unaffected.

University default headers also include **Date of Birth** and **Place of Birth** rows (optional per student, blank when not recorded, printed spelled out — `12 May 2003` / `12 mai 2003` — because `12/05/2003` reads as 5 December to half the world). Already-saved university designs pick these rows up **once** in the designer (`ensureBirthRows`; deleting them afterwards sticks). **A changed default never reaches an already-saved design** — any new default row/section needs a one-time backfill like this.

### Annual transcript (all school types)

A second design per school, stored under the template config's `transcript` key so it can never clobber the standard design. Edited on the same section canvas via the **Transcript** (university) / **Annual** (primary & secondary) layout thumbnail:

- **Period tables are ordinal**: `transcriptSemester: 'sem1' | 'sem2' | 'sem3'` means the Nth period of the year — two semesters at a university, three terms elsewhere. Each table prints a **caption naming its period** (the student's real term name).
- University tables: CODE / TITLE / CREDIT / MARK / GRADE / GRADE POINT / WEIGHTED POINT with per-semester TOTAL + SEMESTER GPA; summary box = Credits / **CGPA** / Remark. Primary & secondary tables: subject / coef / seqs / average / grade / remarks with TOTAL + TERM AVERAGE; summary = **Annual Average** / Grade.
- Printed **from the closing period's row** (2nd semester / 3rd term) on the report-cards list, enabled only when **every** period of that year is published for the student. The transcript endpoint returns published cards only.
- All period tables share one table design (edits mirror across them).

**Every figure on it comes off the report cards; nothing is re-derived.** A period's TERM AVERAGE is that card's stored `average`, and the **annual average is the mean of those stored term averages** — the same arithmetic on the same inputs as the API's `annualAverage` (see `getReportCard`) and as `endAcademicYear`'s PASS/TRIAL/REPEAT, so the transcript and the card that fed it can never disagree. The transcript used to recompute each term from the entries: harmless for secondary (which happened to match) and wrong for primary, whose subjects are marked raw but whose average is normalised to /20 — one pupil's transcript read **77.60** for a term her report card called **15.5**, and the annual average, the Grade and the Decision were all judged on that /100 figure against /20 bands. Labels now state the scale (`TERM AVERAGE /20`, `Annual Average /20`, `Annual Average /100` at a university).

**Every school type states the year's average.** University summaries carry `Annual Average /100` (a credit-weighted mark, which is what `ReportCard.average` holds there) beside Credits / CGPA / Remark. Two defects hid this: the grading-legend's summary tables were gated on *the grading scale carrying grade points*, not on school type, so a primary or secondary school's OVERALL SUMMARY was built and then never rendered; and the transcript passed no `cgpa`, so **every university transcript printed a dash** for Cumulative GPA (it now reads the year-closing card's, rather than reimplementing a rule the server owns). Saved designs are backfilled once by `ensureAnnualAverageRow`, the same idiom as `ensureBirthRows` / `ensureStampSection` — matched on the bound field, not the label, so a renamed row is left alone and a deliberate deletion sticks.

### Official vs Student copies

A school needs both copies alive at once, so **the copy is chosen when printing, never saved into the design**:

- **Student copy** — handed out at term end; the default on every print surface, and the only thing bulk printing produces (officials are per-student, on request).
- **Official copy** — the school seals and sends it itself (WES, embassies). Prints an automatic, non-editable **"Official Copy"** note under the title; the student copy prints nothing there (absence of the note is what makes it unofficial).
- Per-section `showOn` decides what differs (signatures/seal official-only; a "not valid for official use" note student-only). The **watermark** is scoped the same way (`watermark.showOn`) — an UNOFFICIAL wash on student copies while the official stays clean.
- **The seal sits on the RIGHT.** Every layout seeded it there except Standard, which seeded `align: 'center'` — so the everyday report card was the one document whose stamp sat in the middle of the page, under the signatures rather than beside them. The default is now `right`, and `ensureStampOnRight` moves an existing centred one **once** (same marker idiom as `ensureBirthRows`), so a school that then deliberately centres its seal keeps it. It runs inside `mergeSavedStandardConfig`, which is the one path every standard-layout reader shares, so the seal moves on paper whether or not the admin reopens the designer.
- **Watermark defaults depend on the type**: a **logo** is upright (`rotation: 0`) and 240px, a **text** watermark runs diagonally (`-45`) at 80px; both are centred. Resolved identically by the designer and by `PrintableReportCard`'s `Watermark`, so the canvas and the paper agree. Only what an admin actually changes is stored — every field of `TemplateConfig.watermark` is optional for that reason. Merging the *resolved* defaults back in on every edit was what froze a text tilt onto a logo: ticking the checkbox wrote `rotation: -45`, and switching to Logo then carried it. The two type branches also need their `key`, or React reconciles one into the other and reuses the colour `<input>` as the hidden file `<input>`, which is the "controlled input to be uncontrolled" error clicking Logo used to throw.
- The designer has a **Preview: Official | Student copy** switch (view-only, never saved); sections scoped to the other copy dim with a badge rather than vanishing.
- Transcript and report-card pages have **two print buttons**; the preview follows the chosen copy.

---

## 13. Class List Design

Each school designs its own printable **class list / marks register** — the blank sheet teachers print to record marks by hand — in a **click-to-edit canvas** (`/class-list-design`, admin, **desktop-only**).

- **Storage**: `ClassListTemplate` model — one `config` JSON per school (`GET/PUT /class-list-template`; save restricted to admin/VP).
- **Same generator** (`lib/classListDocument.ts`) renders both the on-screen canvas and the actual print.

### Click-to-edit canvas
The A4 sheet itself is editable:
- Click the **title**, any **group heading** (e.g. "1st Term") or **column label** (e.g. "Seq 1") to rename inline.
- **+ Group** adds a term/semester column group; **×** removes it.
- **+** adds a column to a group; **×** removes a column; **☆/★** marks a column as an "average" (tinted) column.
- A side panel holds non-text options: logo / school-type toggles, header & average colours, Student ID column, orientation, blank rows, meta fields (Subject/Teacher/Year), and footer signature fields.

### Flexible column model
`config.groups[] → columns[]`, each column `{ label, avg }`. This replaced the old fixed term/sequence toggles; **legacy saved configs auto-migrate** to groups.

### Presets & section-type defaults
A **preset** dropdown seeds a starting layout: **Secondary** (3 terms × Seq 1/2 · 3/4 · 5/6 + Avg), **Primary** (Eval 1–6 + Avg), **University** (Semester × CA / Exam / Final). A school with no saved design defaults to the preset matching its `school.type` (`typeToClassListPreset`). Sequence numbers run continuously across terms (Term 1 → Seq 1/2, Term 2 → Seq 3/4, Term 3 → Seq 5/6).

### Printing
The saved design drives the **Class List** print in the Report Cards toolbar: pick a class → the popup renders the roster (A4) using the school's design. Mark cells print blank; extra blank rows are added for new admissions.

### Mobile
Desktop-only. The mobile app shows a **"Better on Desktop"** screen under More → Class List Design.

---

## 14. School Customisation

### Logo & Cover Image
Uploaded via **Settings** page. Stored in `apps/api/uploads/`.

### Grading Scale (`/grading-scale`)
Admin defines custom grade ranges (min%, max%, grade letter, remark, color). Default ranges match the school's system (see Section 7). Changes apply everywhere immediately — grade column always recalculates live from current scale.

---

## 15. Print System

### Individual report card
On the report card detail page, **Print / Save PDF**:
1. Renders `PrintableReportCard` hidden on-page
2. Opens a **popup window** (user stays on the site)
3. Injects HTML with absolute image paths
4. Waits for images, then `window.print()` → popup closes after printing

### Print all cards for a class
**Print All** button:
1. Fetches all published cards for the class
2. Renders them hidden on current page (210mm wide)
3. After 600ms, opens popup with all cards
4. `page-break-after: always` between cards → one card per printed page
5. Shows "Loading..." while data loads

### Official vs student copies at print time

Every print surface produces one of two copies (see §12): report-card detail and transcript pages offer **Print Student Copy** and **Print Official**; bulk class printing always produces **student copies** (officials are per-student, on request). Printing runs from a `useEffect` keyed on a pending flag — choosing a copy must re-render the portal *before* `window.print()`, or the dialog captures the previous copy.

### Annual transcript pagination

The university transcript is a **two-page document by design** (content ≈1370px vs A4's 1123px): page 1 = header + semester tables + grading system, page 2 = stamp + signatures. A seal beside the signatures on a signature page is normal transcript convention — deliberate, not a bug.

### Class list / marks register
**Class List** dropdown (Report Cards toolbar) → pick a class → opens a popup that prints the roster (A4) using the school's saved **Class List Design** (see Section 13). Mark cells print blank for hand-filling, plus extra blank rows for new admissions.

---

## 16. Web App Pages

| Page | Path | Who |
|------|------|-----|
| Dashboard | `/dashboard` | All |
| Students | `/students` | Admin |
| Classes (admin) | `/classes` | Admin |
| Subjects | `/subjects` | Admin |
| Terms | `/terms` | Admin |
| Report Cards list | `/report-cards` | Admin (full list), Teachers/Class Master (class view) |
| Report Card detail | `/report-cards/:id` | Admin (read-only) |
| Marks entry | `/report-cards/class/:class/:subjectId` | CLASS_TEACHER, CLASS_MASTER — a **rated (nursery) class** opens the rating picker instead of the numeric grid (§7) |
| Card Design | `/report-card-design` | Admin |
| Class List Design | `/class-list-design` | Admin (desktop-only) |
| Grading Scale | `/grading-scale` | Admin |
| Class Master | `/class-master` | CLASS_MASTER |
| Teachers | `/teachers` | Admin |
| Teaching Hours | `/teaching-hours` | Admin |
| My Teaching Hours | `/my-teaching-hours` | Teachers, Class Master |
| Settings | `/settings` | Admin |
| SuperAdmin | `/superadmin` | SUPERADMIN only |

---

## 17. Mobile App Screens

| Screen | File | Who | Description |
|--------|------|-----|-------------|
| Login | `login.tsx` | All | **Email or username** + password |
| Home (SuperAdmin) | `(tabs)/index.tsx` | SUPERADMIN | Red header, 4 stat cards (schools/groups/students/active), "Manage Schools" button |
| Home (teacher/master) | `(tabs)/index.tsx` | CLASS_TEACHER, CLASS_MASTER | School banner; purple "Manage Remarks" for CLASS_MASTER, blue "Enter My Classes" for CLASS_TEACHER |
| Home (admin) | `(tabs)/index.tsx` | SCHOOL_ADMIN, VICE_PRINCIPAL | Dashboard stats cards |
| Schools | `(tabs)/schools.tsx` | SUPERADMIN | All schools grouped by ParentSchool; toggle active/inactive per group/section; FAB to create standalone school |
| Classes | `(tabs)/report-cards.tsx` | Teachers, Class Master | Class list; tapping navigates to subjects screen |
| Class subjects | `class/[classLevel].tsx` | CLASS_TEACHER, CLASS_MASTER | Subjects + sequence selector; CLASS_MASTER sees purple "Add/Edit General Remarks" banner at top |
| Marks entry | `marks/[subjectId].tsx` | Teachers + Admin/VP | Enter marks; in-place **CA / Exam / Resit switcher** (`router.setParams`), labelled **Test / Exam** for primary, where each component is capped at its own ceiling (the phone used to cap both at the subject total); rows lock read-only under `ADMIN_ONLY` (for teachers) and on published cards (for everyone), with a banner naming the remedy per role. A **rated (nursery) class** dispatches to `components/CompetencyMarksEntry.tsx` instead: one card per pupil, three tappable ratings, no keyboard (§7) |
| Class Master remarks | `class-master/[classLevel].tsx` | CLASS_MASTER | Students list with averages + card status; bottom sheet modal to edit per-student general remarks |
| Report card detail | `report-card/[id].tsx` | CLASS_TEACHER, CLASS_MASTER | Grading scale loaded; per-subject badge shows remark + color (squared); summary: Average (X.X), Grade (remark), Position (ordinal) |
| Students | `(tabs)/students.tsx` | SCHOOL_ADMIN, VICE_PRINCIPAL | Admin student list; registration form includes optional Date/Place of Birth (DOB as `YYYY-MM-DD` text, same pattern as the fees ledger) |
| Admin report card | `admin/report-card/[id].tsx` | Admin/VP | Score list shows **failing marks in red** (honours the school toggle); **Edit marks** button (drafts only) to the class sheet; grant buttons hidden under `ADMIN_ONLY`; readiness panel names no teacher when marks are the administration's job |
| Courses/Subjects admin | `admin/subjects/index.tsx` | Admin/VP | Sections grouped "class — semester" with an **ACTIVE** badge on the running semester; per-course **Enter marks** pencil (university + `ADMIN_ONLY`) straight to that course's CA sheet |
| Settings | `admin/settings/index.tsx` | Admin/VP | Read-only school info **plus the one editable setting: Who enters marks** (university only), with the "used X of 2 switches" counter and cap messaging |
| Teaching Hours | `(tabs)/teaching-hours.tsx` | Teachers, Class Master | Own coverage per subject/course (required/taught/projected/status) + FAB to report an absence (whole day or specific periods from that day's timetable). Admin's school-wide coverage report is **web-only** (a filterable table, same reasoning as the Timetable builder) |

### Mobile tab layout per role

| Role | Tab 1 | Tab 2 |
|------|-------|-------|
| SUPERADMIN | Home (shield icon, red) | Schools (business icon, red) |
| CLASS_MASTER | Home (purple) | My Classes (chat icon, purple) |
| CLASS_TEACHER | Home (blue) | Classes (school icon, blue) |
| SCHOOL_ADMIN / VICE_PRINCIPAL | Dashboard | Students, Report Cards |

---

## 18. Known Behaviours & Rules

| Behaviour | Detail |
|-----------|--------|
| **Marks don't overwrite general remarks** | Teacher saving marks never touches `ReportCard.remarks` |
| **Grade column shows the letter** | Report card Grade columns show the letter grade (A, B, C…), not the remark word. Remarks columns show the word. The marks-entry "PERFORMANCE" column shows the word by design |
| **Grade/remark from grading scale** | API derives both the letter grade and the remark from the school's grading-scale ranges on save (`getGradeLetter`/`getAutoRemark`); the detail page recomputes the displayed grade from the current scale |
| **Remarks required for ALL classes** | Publishing (single + bulk) requires general remarks for every class. Admin/VP write them when a class has no master |
| **No stale remarks on save** | Marks save never sends existing `entry.remarks` to the API — API always auto-fills from current grading scale |
| **Position auto-updates** | Every `saveEntries` call recalculates positions for all students in the class |
| **Auto-remarks on save** | API auto-fills `ReportEntry.remarks` from grading scale remark when marks are saved |
| **Average displayed as X.X** | No `/20` suffix anywhere — just the raw number (e.g. 14.4) — web + mobile |
| **Position displayed as ordinal** | 1st, 2nd, 3rd — not #1, #2, #3 — web + mobile |
| **Badge style** | Squared corners (borderRadius 4px), not circular — web + mobile |
| **Subject exclusivity** | One teacher per subject per class. Reassigning silently removes from previous teacher |
| **Class master auto-demotion** | Setting new master of a class auto-demotes old master to CLASS_TEACHER |
| **Deleting a subject** | Also deletes all `ReportEntry` records for that subject |
| **Class Level `order` field** | Controls sort order of classes in all lists and dropdowns |
| **Stream support** | `ClassLevel.hasStream = true` → student registration shows Arts/Science; baked into classLevel string |
| **Subject filter** | Teachers and class masters see only their assigned subjects (API enforces this for all teacher-type roles) |
| **Report card auto-creation** | Created automatically when teacher/class master first saves marks for a student who doesn't have one |
| **Admins CAN edit marks (drafts only)** | Admin/VP save marks like teachers do — and are the ONLY mark-writers when `marksEntryMode = ADMIN_ONLY`. A **published** card is frozen for everyone including admins: unpublish first |
| **Who-enters-marks switching is capped** | 2 school switches per semester (free between years), then only the provider from the superadmin page; every switch audit-logged (`MarksEntryModeChange`) and shown in Settings |
| **Resit = failed the course** | University resit eligibility is course failure per the school's own scale (`juryDecision` first), regardless of the exam mark; only the exam is re-sat |
| **Grading scale must be parsed** | `GradingScale.ranges` has two storage shapes; read it only via `utils/gradingScale.ts` (`parseStoredScale`) — never raw |
| **Universities say Course, not Subject** | All university-facing UI (nav, pages, exports, mobile) says Course/Courses; the DB/API keep `Subject`. `/courses` serves the page; `/subjects` remains for other school types |
| **Hand-listed payloads are a trap** | Several pages/controllers rebuild school/student objects field-by-field; a field omitted there silently never prints (this bit twice: the stamp, then birth details). Check every hand-list when adding a School/Student field |
| **Empty student-info rows hide** | A row with no value ('' or the '—' placeholder) is dropped from the printed card, label and all |
| **Demo school resource caps** | The demo tenant only (subdomain `demo`) is capped: 20 students, 20 subjects, 10 teachers, 10 cover images. Real schools are unlimited. See §19 |

---

## 19. Demo Tenant

A disposable **demo school** lets people (e.g. recruiters) explore the live app without harming real data. Because the app is multi-tenant (every query scoped by `schoolId`), a demo `SCHOOL_ADMIN` can only ever see/edit the demo school — never another school's data. The demo is **never** given a SUPERADMIN (the only cross-tenant role).

### Identity
- The demo school is identified by **`subdomain = 'demo'`** ("Greenfield Demo Secondary", SECONDARY).
- Default logins (both password `demo1234`): `recruiter@demo.com` (SCHOOL_ADMIN), `teacher@demo.com` (CLASS_MASTER of Form 1).

### Seed & reset
- `apps/api/src/scripts/seedDemo.ts` → `resetDemoSchool()` wipes ALL demo-school data (FK-safe order) and reseeds: 3 classes (Form 1–3), 5 subjects each, 3 terms, ~14 students, report cards in mixed states (published / ready-to-publish / missing sequences) to showcase the workflow.
- Run it: `npm run seed:demo` (dev) / `npm run seed:demo:prod` (after build), or `POST /api/demo/reset` with the `x-demo-secret` header.
- Point a scheduler (e.g. a free external cron) at `POST /api/demo/reset` to keep the demo clean automatically.

### Resource caps (demo school ONLY)
Enforced server-side in `apps/api/src/config/demo.ts` (`demoLimitBlock`) — returns `403` once a cap is hit, and `null` (no limit) for every real school:

| Resource | Cap |
|----------|-----|
| Students | 20 |
| Subjects | 20 |
| Teachers (active CLASS_TEACHER/CLASS_MASTER/VP) | 10 |
| Cover images (logo + cover + gallery) | 10 |

### Config
- Env var `DEMO_RESET_SECRET` guards the reset endpoint (returns 503 if unset — a safe default).

---

## 20. Teaching Hours Coverage

Tracks whether a teacher actually covers the hours a Subject/Course is supposed to take — per **semester** for universities, per **academic year** for primary/secondary — computed from the existing weekly timetable rather than a separate day-by-day attendance register.

### How the numbers are computed
- `Subject.requiredHours` (optional Int) is the target, and it belongs to the **course**, not to a teacher. Two lecturers sharing a 30-hour course are at 30 between them, never 30 each. (How that 30 is *split* between them differs for a primary teaching team — see *Primary shared teaching teams* below.) A university course row is already scoped to one semester via `Subject.term`; a primary/secondary subject row has no `term`, so the target means "this academic year" (summed across all terms in the session).
- **A coverage row is one COURSE**, with a `contributors[]` breakdown naming who taught what and over which window, and a `gaps[]` list naming any stretch nobody held it. Status and `isFinal` are computed at course level, never taken from a contributor: each contributor measured its own slice against the full target, which is only right when there is exactly one of them.
- **Scheduled hours** = for each term the course scopes to, how many times the slot's weekday occurs between the term's start/end dates × the slot's duration — **minus school closures** (see Holidays below), and **clamped to the window the teacher actually held the course**.
- **Taught hours** = scheduled hours elapsed so far, minus any `TeacherAbsence` hours in that span.
- **Projected/final hours** = full-period scheduled hours minus all logged absences (past + future planned). While the scope is still open this is a live **projection**; once every scope term has ended it becomes the **final** total.
- Status is `NO_TARGET`, `UNDER`, `EXACT`, or `OVER`, compared against the projected/final total (0.5h tolerance for "exact").
- Counting runs **only inside real term dates**. The By Teacher totals used to collapse a whole session into one span, which counted the breaks *between* terms as teaching weeks; they now iterate the actual `Term` rows.
- All arithmetic lives in one place: `apps/api/src/utils/teachingHours.ts` (`computeCoverage`, `resolveScopeTerms`, `countTeachingWeekdays`, `mergeDateRanges`), shared by both the admin and teacher-facing endpoints so the numbers can never drift apart between the two views.

### Primary shared teaching teams (primary only)
A primary class is taught by a **team of 1–3 teachers who hold every subject together** — not
a handover, which is what `startedAt`/`endedAt` model everywhere else. Where 2+ teachers are
*currently and concurrently* assigned to the same subject (`endedAt: null`), coverage treats
them as one team:

- **Hours are shared, not duplicated.** The class's periods are de-duplicated across the team
  (each member holds their own `TimetableSlot` row for what is really the same class period,
  so they are matched by day + time + window, never by row id), and each member is credited
  an **equal share**: 2 teachers on a 30-hour class are at 15 each, 3 at 10 each. The shares
  sum back to the class's real total, so no aggregation elsewhere had to change.
- **A period is only missed when EVERY member is absent for it.** One teacher covering for
  another is not a lost class, so the team's missed periods are the **intersection** of the
  members' reports, not the union. Below 100% absence the hours are untouched.
- **An individual's own absence still stands on their record** even when a teammate covered —
  it is visible on their contributor line, it just does not dock the class's taught hours.
- A teacher who has since **left** a shared class (`endedAt` set) drops out of the team and is
  measured individually again, exactly like any ordinary handover.

For this to mean anything the team must actually be **scheduled for the same periods** — a
day-split timetable (one teacher Mondays, another Tuesdays) never produces a shared period, so
"both absent at once" can never occur and the rule is inert.

### Which courses appear
A course earns a row by having an hours target, **any hours at all** (scheduled, taught or projected), **or** absences recorded against it. Requiring a target made an absence on any other course invisible in By Course entirely — an admin could open the view, delete every absence it listed, and still have absences on record with nothing hinting they existed. It also withheld hours already worked: a teacher could teach a whole term on a course nobody had set a target for, and the one screen the school looks at to answer "how much has been taught" showed nothing. Untargeted rows carry their taught and projected hours with status `NO_TARGET`, which both clients already colour neutrally, sort last and offer as a "No target" filter.

What still earns nothing is a course with a teacher, no target, no absences and **no hours whatsoever** — never timetabled, nothing taught, nothing projected. There are hundreds of those (217 at one secondary school, every one reading 0/0) and they would bury the rows carrying real work.

Gaps deliberately do **not** earn a row. Assignments rarely start on a term's first day, so nearly every course has an uncovered stretch; including them listed all 112 courses in one school and buried the two that mattered.

### Holidays (`SchoolHoliday`)
- A named, **inclusive** date range during which the school is closed — public holiday, mid-term break, anything that cancels teaching. Admin-managed on the Terms page, since it is the same academic calendar: terms say when teaching happens, holidays carve out the days inside them when it does not.
- Ranges **may overlap** and are merged before subtracting, so "Easter 12-16 April" plus "Good Friday 14 April" removes that day once, not twice.
- A period falling inside a closure is not counted as taught, and **an absence reported for such a period stops subtracting** — nobody missed a class that never ran. Without that, declaring a holiday after teachers had already reported would dock the hours twice.
- `programme` (nullable) scopes a closure to one sitting. **NULL means the whole school**, which is what every holiday means by default. Only set it when one sitting runs through a closure the other observes. The picker is hidden for non-universities, since evening cohorts are a university concept for now.
- Hours are **derived on read, never stored**, so declaring a closure after the fact retroactively corrects every total and deleting one puts those hours straight back. No backfill, nothing to repair.

### Assignment history and mid-term handover (`TeacherSubject.startedAt` / `endedAt`)
- An assignment records **when a teacher took a course and when they gave it up**. Hours only count inside that window, so a mid-term handover splits a course's hours between the two teachers at the date the admin recorded.
- An ended assignment is **kept, never deleted** — it is the only record that the previous teacher ever taught it, and deleting it would erase the hours they are owed. Reassignment sets `endedAt`; it used to delete the row outright.
- The handover date is set by the admin ("Effective from" on Assign Courses, defaulting to today), so recording a departure five days late still credits those five days to the right person. The outgoing teacher's timetable slots are archived **as of that date**, not "now".
- Saving assignments is a **diff**, not delete-and-recreate. Re-saving an unchanged list must not reset anyone's `startedAt`, which would silently erase months of accrued hours.
- **Deactivating a teacher closes their windows**, so a course they held immediately shows as an unstaffed gap rather than appearing covered forever. Reactivating deliberately does not reopen them.
- `(userId, subjectId)` is no longer unique: a teacher may hold a course, hand it over, and take it back, which is two legitimate rows. "Only one ACTIVE assignment" is enforced in code.
- Every read that means "currently holds this course" filters `endedAt: null` — marks access, dashboards, course lists, delete-warning counts. An ended row must never grant access or ownership.

### Gap flagging
A `gap` is a stretch of a term that no assignment window covers: nobody held the course, so nothing was taught and nothing accrued. Elapsed gaps are teaching already lost; upcoming ones are a staffing warning while there is still time to act.

Anything **before a course's first-ever assignment is not a gap**. That stretch nearly always means the record did not exist yet, not that a class went untaught — a school setting the system up mid-term would otherwise see every course flagged. Gaps *between* assignments (a handover with nobody in the middle) and after the last one are still caught, which is the case that matters.

### Absences
- `TeacherAbsence` — one row per missed **period** (`schoolId`, `teacherId`, `timetableSlotId`, `date` as `"YYYY-MM-DD"` text, `periodIndex`, `recordedById`). Per period is what keeps the hours arithmetic and the "N periods missed" totals right.
- **Reporting and deleting are atomic per SLOT.** The slot is the class the admin put on the timetable, so it is the smallest thing anyone can be absent from: a 07:30-09:10 double is one class of two periods, and "I will miss it" cannot mean half of it. Deleting one row therefore clears every period of that class on that date, and the list is grouped so it shows as a single entry with one delete button.
- Only real subject/course slots count — a private/personal slot can't be marked absent.

#### Who may report, and until when
| | Teacher | Admin/VP |
|---|---|---|
| Report a class still to come | yes | yes |
| Report a class already **started** | **no** | yes |
| Report a class already **ended** | no | no |
| Delete before an admin has reviewed | yes | yes |
| Delete **after** an admin has reviewed | **no** | **yes** |
| Delete an absence **an admin recorded** | **no** | **yes** |
| Delete once the class is **over** | no | **no** |

The cutoff is judged on the whole class, not on each period inside it. "Whole day" quietly skips classes past the cutoff and reports the rest; explicitly-picked ones are rejected outright, naming the date.

`seenByAdmin` is written by an **explicit review action**, `POST /teacher-absences/mark-seen`, never as a side effect of fetching. Reviewing writes no notification (it is a read on the admin's side), so the teacher's screen is told over the realtime channel instead, or it would keep offering a delete the API now refuses.

**What counts as a review** — either of:
- An admin **opening** the teacher's absences: the per-teacher drill-down modal on Teaching Hours, or landing on `/teacher-timetable`. Fired from a genuine focus/open event only.
- An admin **reading the `TEACHER_ABSENCE` notification**, individually or via *mark all read*. An admin who reads the notification and acts on it some other way (a phone call, a word in the corridor) has reviewed it; requiring the deeper drill-down left the teacher able to delete a report the admin had already dealt with.

**What does NOT count**: any background refetch. `GET /teacher-absences` is a **pure read with no side effect**, which it had to become — the realtime `absences:changed` listener calls it, and both routers keep a screen mounted after you navigate away from it (pushed underneath whatever is on top now). Its listener therefore stays live and refetched every time *anyone* in the school reported an absence, which marked that teacher's absences reviewed within milliseconds of creation, routinely before an admin had opened the app at all. **A background sync must keep data current without ever counting as a review** — that split is the whole point, and collapsing it back reintroduces the bug.

An absence an **admin recorded** is never the teacher's to retract, from the moment it is written and regardless of how far off the class is. `seenByAdmin` does not cover this on its own: it starts false on a record the teacher never filed, so until an admin next happened to open the list the subject of the record could quietly erase it, including before ever opening the notification that told them it existed. The test is `recordedById !== teacherId` (derived, no stored field), judged across the whole class because deleting clears every period of it. Teacher-facing lists show a padlock reading "recorded by admin"; admins are unaffected and still delete until the class ends.

`School.absenceGraceMinutes` remains as a second cutoff on teacher retraction. It is null on every live school, so it has no effect today, and it is **not** part of the rules above.

### Realtime
Socket.IO runs on the same port as the REST API, so an offline install needs no extra host or firewall rule.

- **Signals only, never data.** Every event is "something changed, refetch". All authorization stays in the REST controllers; pushing payloads through rooms would mean re-implementing school scoping in a second place, where the failure mode is silent cross-tenant leakage.
- Rooms (`user:{id}`, `school:{id}`) are joined **server-side from the verified JWT**, never from client input.
- Events: `notifications:changed` (including on **read**, or the bell badge sits stale while the list beside it shows everything read) and `absences:changed` (created, removed, **or locked** by an admin's review).
- Polling is kept as a slow fallback (150s) so a dead socket degrades to stale rather than silently frozen. This is **not** push: nothing arrives while the app is closed.

### Notifications (`Notification`)
An in-app inbox, not OS push — nothing arrives while the app is closed. Fired on absence report/retraction, admin-logged/removed absences, and course reassignment. Admins see them in the sidebar bell; teachers on their mobile home header and the web sidebar.

`Notification.data` stores **where tapping it leads**, captured when the notification is written rather than resolved on read. That is not an optimisation: a retraction DELETES the absence and a reassignment ARCHIVES the slots, so by the time anyone opens the message the state it describes is gone and nothing could look it up. Clients compare `data.teacherId` with their own id — their own timetable if it matches, the read-only view of that teacher's if not.

Rows written before this exist have `data: null` and are simply not tappable. Admin-recipient ones can never be backfilled, because the teacher they concern is named only in the body prose.

The timetable banner appears **only for things the grid cannot show** — a removed absence (the row is gone, so the week looks ordinary) or a reassigned course (its slots are archived, so they are absent entirely). A live absence is drawn on its own period from fetched data, never from route params, so it can never outlive the record.

### Deleting a timetable version
Refused when absences are recorded against it. `TeacherAbsence` cascades on `TimetableSlot`, so deleting those rows would destroy attendance history with no warning and silently rewrite the hours that subtract from it. The response names the count; the admin edits the current timetable instead, which archives rather than destroys.

### Day and Evening sections (`ClassLevel.programme`)
- A class belongs to the **day section** or the **evening section**. This records which section/intake a class is, **not what time it is taught**. A university's Level 3 (Degree) is taught in the evening but follows the day curriculum and continues from Level 2 day, so it is a DAY class; only Level 1 and Level 2 Evening are the evening section.
- **Both sittings share the same department.** A university has no department rows: the department is parsed out of the class name, and every parser strips the section marker first, so `HND Nursing - Level 1` and its evening twin are one department, "Nursing". Secondary is the same by a different route, since a class points at a real `Department` row by id.
- **Courses are per class, not per department.** Each sitting holds its own `Subject` rows, so the evening cohort can have its own credits, required hours and lecturer. Creating an evening class therefore offers to copy the day class's courses (the existing copy-subjects action); the copies are independent from then on, and nothing warns if the two drift apart.
- A university runs the same programme twice with the **same lecturers and different students**. Each sitting is its own `ClassLevel`, so students, marks, positions and fees are already separate, and one lecturer can be assigned to both. The two sittings need not offer the same levels: an evening-only level is normal. Curriculum is cloned with the existing copy-subjects action.
- A **secondary** evening programme with a genuinely different curriculum is NOT this: that is a separate `School` under the same `ParentSchool`. Note that `User.schoolId` is single, so shared staff would need two accounts.
- The class NAME carries an `(Evening)` marker purely because classes are referenced by name (`Student.classLevel` and `Subject.classLevel` are strings, not foreign keys) and `ClassLevel` is unique on `(schoolId, name)`. `ClassLevel.programme` is the field that means it.
- **"Evening" must never appear on a printed document.** The marker is stripped at the single entry point of `PrintableReportCard`, which every layout and the sections renderer pass through, and wherever a class name is displayed. Every university class-name parser (`univDept`, `univLevel`, `levelGroupOf`, `deptFromClassName`, …) normalises the name first, because their patterns anchor at the end of the string, which is exactly where the marker sits — getting this wrong dropped an evening class out of the Add Student picker entirely.

### Day and Evening have independent bell schedules
- The Timetable page's **Set Up Periods** editor has no "whole school" option any more. `TimetablePeriod.programme` is a required `DAY`/`EVENING` tag (default `DAY`), and for universities the modal shows two fully separate tabs — Day periods and Evening periods — each with its own list of teaching periods and breaks. Every other school type still sees one plain list, since Evening doesn't exist for them.
- **Minutes-per-period is per sitting too**: `School.dayPeriodMinutes` and `School.eveningPeriodMinutes` (was one shared `periodMinutes`). An evening course runs its own curriculum with its own evaluations, so its missed-period count must never be measured against the day's period length, or the reverse. Resolved per class/course via `getProgrammeByClassLevel` + `periodMinutesFor` (`coverage.controller.ts` / `utils/teachingHours.ts`) everywhere a period count is derived from a slot's duration: timetable save validation, teacher-absence creation/listing/counts, and coverage/teaching-hours totals.
- Migration `20260801151843_split_day_evening_period_minutes` backfilled every pre-existing period by clock time (`>= 16:30` → EVENING, else DAY) and copied the old shared `periodMinutes` into both new columns, so existing schools are unaffected until an admin sets the Evening value separately.

### Which sitting a lecturer teaches
`getTeachers` returns `programmes` — the distinct sittings of the classes their **live** course assignments belong to, so the Teachers list can badge a lecturer Day, Evening, or Day & Evening. Derived from assignments rather than timetable slots: an assignment is what generates the hours, and it survives a timetable being rebuilt. An ended assignment stops counting, so handing the evening course away drops them back to Day. Empty when they hold no courses, which shows as no badge rather than a guess.

Shown for universities only — every other school type has DAY classes exclusively, so the badge would read the same on every row.

### Walkthrough: evening department → lecturer assignment
End-to-end steps for a university admin standing up a new evening sitting (this whole flow is university-only, see above):

0. **Decide the department needs an evening sitting.** Only universities have one; if the day department already exists, its name and fees can be copied rather than retyped.
1. **Classes page → Add Department.** If no evening classes exist yet, the Section toggle (Day/Evening) is open on the create modal — pick **Evening**. If evening classes already exist, the page shows ALL/DAY/EVENING chips above the department list; switch to the **Evening** chip first, then Add Department (the section is then locked to Evening for anything created from there).
2. **Base it on the day department (optional but typical).** Tick "Take the department from the day section", pick the matching day department from the dropdown — this locks the Department Name field to match it (so the two stay one department) and copies its abbreviation/fee/max score. Tick which courses to copy across; copies are independent from that point (editing one never touches the other, and lecturers never carry over).
3. **Fill in the rest:** Department Name (skip if taken from the day twin), Level (only Level 1 or Level 2 — Level 3 is day-only, it continues the day curriculum), Abbreviation (for student matricules), Max Score per Course, and the fee (Level 2's is its own entry fee, not derived from Level 1).
4. **Save.** This creates one `ClassLevel` row, e.g. `HND Software Engineering - Level 1 (Evening)`. Repeat step 1–4 once per level if the evening sitting needs both Level 1 and Level 2.
5. **Add courses, if not already copied in step 2.** Courses page → pick the department card (badged **Evening**) → pick the semester → Add Course. Courses live on the class, not the department, so day and evening keep separate course lists even though they share a department name.
6. **Assign the lecturer.** Teachers page → open the lecturer → Assign Courses. The picker groups courses by class level, so the evening ones appear under their own `(Evening)`-labelled group, separate from the day group of the same department. Tick the evening courses, set "Effective from", and Save. One lecturer can hold both the day and evening sections of the same course — assignment is per class level, not exclusive.

### Renaming a class carries its references
A class is referenced **by name**, not by id: `Student.classLevel`, `Subject.classLevel`, `User.masterClassLevel` and `ExcelTemplate.classLevels` are all plain strings. `updateClassLevel` therefore rewrites all four in **one transaction** when the name changes, and reports what moved ("Moved with it: 22 students, 6 subjects/courses"). Renaming used to change only the `ClassLevel` row, which stranded everything pointing at it: students vanished from their class, courses lost their marks sheet, and the class master lost the class they write remarks for, all silently. **Deleting** a class carries the same exposure, so it is guarded: a class with students or subjects/courses is **refused** with the counts named ("still has 22 students and 6 courses"), because deleting must never be a quiet way to destroy a roster or a term's marks. Weak references hold no data of their own and are cleaned up instead of blocking: a class master assigned to it is unassigned, and the class is dropped from any Excel template's class list, both reported in the response.

### Who can be scheduled for what
- The timetable builder only offers a teacher the courses/subjects **they are already assigned**, scoped to the period now running: for a university, courses whose `Subject.term` is the current semester; for primary/secondary, subjects for the current academic year (`term` null means the whole year, which is how they are always stored).
- **Assigning a course is not done here.** An admin assigns on the Teachers page (`assignTeacherSubjects`), which is also where the "a university course has exactly one lecturer" hand-over lives (it takes the course off the previous lecturer, archives their periods for it and notifies them). Saving a timetable no longer writes to `TeacherSubject` at all.
- `saveTimetable` enforces the same rule, so a stale page can't get round it. Pairs already on the teacher's live timetable are grandfathered, because timetables built under the earlier "any course in the department" rule can hold a course since unassigned. In the builder, a slot already on the grid also keeps its own course selectable, so opening it to change a room can't blank the course.

### Period structure (the school's bell schedule)
- `School.periodMinutes` (optional Int) is how many minutes the school counts as **one teaching period**, e.g. 50. It is set once, school-wide, on Set Up Periods, and applies to every class of every type (university, primary, secondary). A 1h40 class is therefore 2 periods, not one long one.
- A row in the period grid (`TimetablePeriod`) is **as many periods as the admin types** — the first row of the day can be a double period and the next a single. The admin only picks the start time and the number of periods; the end time is derived as start + N × `periodMinutes`, so a teaching row is always a whole number of periods. Breaks (`isBreak`) are exempt and can be any length.
- A row that is *not* a whole number of periods (typically one saved before the school set its period length) is flagged in the grid and **blocks the save**, with every offending row named at once. It has to be corrected by hand: rounding it automatically would silently rewrite the school's real bell schedule.
- The period rules apply to what is being added or **retimed**, not to what is already scheduled. A slot whose day/time/course is unchanged is left alone, because setting a period length (or reshaping the bell schedule) instantly makes every timetable built on the old grid non-conforming, and validating those too would leave an admin unable to save any change until every stale class had been retimed in the same sitting.
- **A class may never run across a break.** A double period that reaches into one is really two blocks either side of it, and counting the break as taught time would inflate both hours totals and any absence logged against it. Enforced in the API (`saveTimetable`) as well as the builder. **Private/extra classes are exempt** — being off the period grid is what they are for — as are Saturday/Sunday classes, which already don't follow the grid.
- Hours coverage above is counted in real 60-minute hours; **absences are counted in periods** (`slotPeriods`), so a missed 100-minute class is 2 periods missed. Until `periodMinutes` is set, that falls back to counting 1 per missed slot.

### Timetable versions and the hours maths
A coverage row uses the version of the timetable that was **live when the assignment window closed**: the current one (`archivedAt` null) for a teacher who still holds the course, and the rows archived *at* the handover for one who gave it up. Superseded versions — archived earlier because an admin re-saved — are excluded, so an old version is never counted alongside its replacement.

This deliberately does **not** bound a slot by its `createdAt`. A timetable entered halfway through a term still describes the whole term, and counting only from the day it was typed in would rob teachers of hours they had already taught.
