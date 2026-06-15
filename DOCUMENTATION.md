# ReportCard System — Project Documentation

> Last updated: 2026-06-15 (Demo tenant + caps · remarks required for all classes · letter grades)
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
| `School` | A single school section (PRIMARY / SECONDARY / UNIVERSITY). Has logo, cover image, subdomain |

### People

| Model | Key Fields |
|-------|-----------|
| `User` | name, email, password, role, schoolId, **masterClassLevel** (CLASS_MASTER only) |
| `Student` | name, studentId, classLevel (e.g. "Form 4 Arts"), guardianName/Phone/Email |

### Academic

| Model | Key Fields |
|-------|-----------|
| `Subject` | name, classLevel, **maxScore** (default 20), **coefficient** (default 1) |
| `ClassLevel` | name, hasStream (bool), order (sort position) |
| `Term` | name, session, startDate, endDate, **isCurrent** (bool) |
| `TeacherSubject` | Junction: which teacher teaches which subject (one teacher per subject per class) |

### Report Cards

| Model | Key Fields |
|-------|-----------|
| `ReportCard` | studentId, termId, status (DRAFT/PUBLISHED), totalScore, **average** (raw X.X e.g. 14.4), **position** (int), remarks |
| `ReportEntry` | reportCardId, subjectId, seq1Score, seq2Score, **score** (avg of both seqs), grade, **remarks** (auto-filled from grading scale) |

### Configuration (per school)

| Model | Purpose |
|-------|---------|
| `GradingScale` | Stores custom grade ranges as JSON |
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
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/students` | List all students |
| POST | `/students` | Create a student |
| PUT | `/students/:id` | Edit a student |
| DELETE | `/students/:id` | Delete a student |
| GET | `/students/class-levels` | Get distinct class levels |

### Subjects
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/subjects` | List subjects (teachers/class masters see only assigned ones) |
| POST | `/subjects` | Create subject (name, classLevel, maxScore, coefficient) |
| PUT | `/subjects/:id` | Edit subject |
| DELETE | `/subjects/:id` | Delete subject + all related report entries |

### Class Levels
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/class-levels` | List all class levels (sorted by order) |
| POST | `/class-levels` | Create a class level |
| PUT | `/class-levels/:id` | Edit class level |
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
| PUT | `/report-cards/:id/entries` | Admin, CLASS_TEACHER, CLASS_MASTER | Save subject marks; auto-fills entry.grade + entry.remarks from grading scale |
| PUT | `/report-cards/:id/remarks` | Admin, VP, CLASS_MASTER | Update general remarks only (admin/VP used when class has no master) |
| PUT | `/report-cards/:id/publish` | Admin, VP | Publish one card — enforces subjects + all sequences + general remarks |
| PUT | `/report-cards/:id/unpublish` | Admin, VP | Unpublish (unlocks for editing) |
| POST | `/report-cards/bulk-publish` | Admin, VP | Publish a whole class; skips + reports students not ready |
| PUT | `/report-cards/:id/grant-edit` · `/revoke-edit` | Admin, VP | Grant/revoke one-time edit on a published card |
| DELETE | `/report-cards/:id` | Admin, VP | Delete a report card |
| GET | `/report-cards/class-overview` | All | Students + card status for a class/term |
| GET | `/report-cards/class-readiness?termId` | Admin, VP | Per-class publish readiness (drives bulk-publish gating) |
| GET | `/report-cards/:id/readiness-detail` | Admin, VP | Which teacher is missing marks / who must write remarks |

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

### Demo Tenant
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/demo/reset` | Wipe & reseed the demo school. Guarded by `x-demo-secret` header (or `?key=`) === env `DEMO_RESET_SECRET`. Returns 503 if the secret is unset. Only ever touches the demo tenant. |
| GET | `/demo/credentials` | Public — returns the demo logins |

See §19 Demo Tenant for the full picture.

---

## 7. Grading & Mark Calculation

### Per-subject marks (teacher fills in)

The teacher fills in marks for **Sequence 1** and **Sequence 2**, both out of the subject's `maxScore` (default 20).

```
Subject average = (Seq1 + Seq2) / 2   →   e.g. 15/20
```

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

### Final (weighted) average

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

### Class position

Shown as ordinal: **1st**, **2nd**, **3rd**, etc.
Auto-recalculated for all students in the same class/term every time any teacher saves marks.

---

## 8. Subjects & Coefficients

Each subject has:
- **Name** — e.g. "Mathematics"
- **Class Level** — selected from existing classes (dropdown)
- **Max Score** — what marks are entered out of (default 20)
- **Coefficient** — weight in the final average (default 1)

**Subject exclusivity**: each subject in a class belongs to exactly one teacher. Assigning it to a new teacher automatically removes it from the previous one. Admin sees a yellow notice listing what was reassigned.

---

## 9. Report Cards Flow

### Who does what

| Step | Who | What |
|------|-----|------|
| 1 | **Admin** | Creates report card explicitly for student + term (or auto-created by teacher on first save) |
| 2 | **CLASS_TEACHER / CLASS_MASTER** | Fills marks (Seq1, Seq2) via marks entry page for their assigned subjects |
| 3 | **API** | Auto-fills per-subject grade + remark from grading scale on every save |
| 4 | **CLASS_MASTER** (or **Admin/VP** if the class has no master) | Adds/edits general remarks for all students in the class |
| 5 | **Admin** | Reviews everything and publishes the report card |

### Publish rules (enforced server-side, single + bulk)

A report card can only be published when **ALL** of these are true — checked in the API, not just the UI:

1. The class has at least one **subject**.
2. **Every subject has both sequences filled** (Seq1 AND Seq2) — i.e. every teacher has filled their marks. A subject with no assigned teacher still blocks until its marks are entered.
3. The report card has **general remarks** — **required for every class** (updated 2026-06-15; previously only classes with a class master).

The bulk **"Publish Class"** action checks the whole class: the dropdown button is disabled until every student passes, and the API reports per-student `issues` (missing sequences / missing remarks / no subjects) for any it skips.

### Who writes general remarks

- Class **has** a class master → only that master writes the general remarks (as before).
- Class has **no** class master → **SCHOOL_ADMIN / VICE_PRINCIPAL** write the general remarks themselves, on the report-card detail page (a "Save Remarks" box appears). This keeps every class publishable.

### Admin view

The admin report card detail page is **read-only for marks**. Admin sees subject scores, letter grades, coefficients, per-subject remarks, general remarks, average, and position, and can **Publish**. Admin/VP can also **write the general remarks** when the class has no class master (otherwise remarks are master-only).

### Marks entry (teacher / class master)

- Go to: Classes → select class → select subject → select sequence
- **Sequence labels are term-aware** (Cameroon system): Term 1 → Seq 1/2, Term 2 → Seq 3/4, Term 3 → Seq 5/6. Data still stores in `seq1Score`/`seq2Score`; only the displayed label changes (derived from the term name — see `lib/sequences.ts`, web + mobile).
- Marks are entered one student per row, out of the subject's maxScore
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

### Display format on printed card
- **Grade column**: shows the remark text (e.g. "Good") from the grading scale
- **Average**: shown as `14.4` (no /20)
- **Position**: shown as `3rd` (ordinal)
- Grade badges: squared corners (not circular)

### Section-type defaults (Primary / Secondary / University)
A school with **no saved report-card design** starts from a layout tailored to its `school.type` (`getDefaultLayoutForType`). Admins edit & save from there. The three are fully independent:

| Section | Tailored defaults |
|---------|-------------------|
| **Primary** | Teal theme · "PRIMARY SCHOOL REPORT CARD" · **Pupil** labels · summary boxes **Conduct / Attendance / No. on Roll** · "Class Teacher's Comment" · **Class Teacher + Head Teacher** signatures |
| **Secondary** | Current look — Seq 1/2 · coefficients · /20 average · position · class-master remarks |
| **University** | Navy theme · "STUDENT SEMESTER REPORT" · **Matric No / Programme / Semester** · **CA + Exam** columns · **GPA / CGPA / Total Credits** summary · **Course Adviser / HOD / Dean** signatures |

Hand-filled fields (Conduct, Attendance, GPA, CGPA, Credits) render as `—` placeholders — design only, no change to grade calculation.

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
| Marks entry | `/report-cards/class/:class/:subjectId` | CLASS_TEACHER, CLASS_MASTER |
| Card Design | `/report-card-design` | Admin |
| Class List Design | `/class-list-design` | Admin (desktop-only) |
| Grading Scale | `/grading-scale` | Admin |
| Class Master | `/class-master` | CLASS_MASTER |
| Teachers | `/teachers` | Admin |
| Settings | `/settings` | Admin |
| SuperAdmin | `/superadmin` | SUPERADMIN only |

---

## 17. Mobile App Screens

| Screen | File | Who | Description |
|--------|------|-----|-------------|
| Login | `login.tsx` | All | Email + password |
| Home (SuperAdmin) | `(tabs)/index.tsx` | SUPERADMIN | Red header, 4 stat cards (schools/groups/students/active), "Manage Schools" button |
| Home (teacher/master) | `(tabs)/index.tsx` | CLASS_TEACHER, CLASS_MASTER | School banner; purple "Manage Remarks" for CLASS_MASTER, blue "Enter My Classes" for CLASS_TEACHER |
| Home (admin) | `(tabs)/index.tsx` | SCHOOL_ADMIN, VICE_PRINCIPAL | Dashboard stats cards |
| Schools | `(tabs)/schools.tsx` | SUPERADMIN | All schools grouped by ParentSchool; toggle active/inactive per group/section; FAB to create standalone school |
| Classes | `(tabs)/report-cards.tsx` | Teachers, Class Master | Class list; tapping navigates to subjects screen |
| Class subjects | `class/[classLevel].tsx` | CLASS_TEACHER, CLASS_MASTER | Subjects + sequence selector; CLASS_MASTER sees purple "Add/Edit General Remarks" banner at top |
| Marks entry | `marks/[subjectId].tsx` | CLASS_TEACHER, CLASS_MASTER | Enter marks; **REMARK** column (squared badges), grading scale from API, no stale remarks on save |
| Class Master remarks | `class-master/[classLevel].tsx` | CLASS_MASTER | Students list with averages + card status; bottom sheet modal to edit per-student general remarks |
| Report card detail | `report-card/[id].tsx` | CLASS_TEACHER, CLASS_MASTER | Grading scale loaded; per-subject badge shows remark + color (squared); summary: Average (X.X), Grade (remark), Position (ordinal) |
| Students | `(tabs)/students.tsx` | SCHOOL_ADMIN, VICE_PRINCIPAL | Admin student list |

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
| **Admin is read-only for marks** | Admin cannot edit marks. Admin/VP CAN write general remarks when the class has no master. Mobile admin remarks-writing not yet implemented. |
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
