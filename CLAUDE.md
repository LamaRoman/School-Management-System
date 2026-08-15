# School Management System (Zentara Shikshya)

A multi-tenant school management platform for Nepali schools (Nursery–Class X): student records, attendance, marks/grading, report cards, fees, admissions, and more. One deployment serves many schools, scoped by `schoolId`.

For setup/run instructions see [README.md](README.md). For backend test setup see [backend/TESTING.md](backend/TESTING.md).

## Repo layout

```
backend/           Express + TypeScript REST API, Prisma ORM, PostgreSQL
frontend/          Next.js + TypeScript web app (admin / teacher / accountant / parent / student / super-admin portals)
mobile-staff/      Expo/React Native app — teachers and accountants
mobile-parent/     Expo/React Native app — parents and students
```

Each has its own `package.json`; there's no root workspace. Install and run each independently.

## Backend (`backend/src/`)

- `routes/` — one file per resource (student, teacher, mark, fee, admission, promotion, seating, gradeSheet, pdf, ...). Most are REST CRUD; `pdf.routes.ts` and `report.routes.ts` assemble report-card data, `gradeSheet.routes.ts` builds whole-class mark sheets.
- `services/grading.service.ts` — single source of truth for the grading scale, percentage→grade/GPA conversion, and pass/fail rules. **Duplicated** in `frontend/src/lib/gradingScale.ts` — change both together or the web UI and PDFs will disagree.
- `services/pdf.service.ts` — renders report card HTML and drives Puppeteer to produce the PDF. Two independent templates: marks-based and credit-grade (`buildCreditGradeReportCardHtml`), selected by `Grade.gradingStyle`. Deliberately not shared code — see comments in that file for why.
- `middleware/auth.ts` — JWT auth (HttpOnly cookie for web, `Authorization: Bearer` for mobile). Roles: `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`, `TEACHER`, `STUDENT`, `PARENT`. `getSchoolId(req)` reads `schoolId` off the JWT and throws if missing — **use it to scope every query**, this is the multi-tenancy boundary.
- `prisma/schema.prisma` — the schema. Key models: `School`, `AcademicYear`, `Grade`, `Section`, `Subject`, `ExamType`, `GradingPolicy`, `Student`, `Teacher`, `Mark`, `ConsolidatedResult`, `Attendance`/`DailyAttendance`, `ReportCardSettings`, `ObservationCategory`/`ObservationResult`, fee models, `Admission`.

## Domain concepts

- **Academic Year → Grade → Section → Student** — standard school hierarchy, all scoped to a `School`.
- **Exam Type** — an exam instance (e.g. "First Terminal", "Final"), carries `isFinal`, paper size (A4/A5), whether rank is shown.
- **Grading Policy** — per-grade weightage % for each exam type, used to compute the weighted annual result from term marks.
- **Mark** — a student's `theoryMarks`/`practicalMarks` for one subject + exam type. Both are nullable; `isAbsent` marks a student as absent for that subject (marks are stored as `null`, rendered as **"Ab"** everywhere — report cards, grade sheets, admin/teacher/student pages — but treated as 0 in every GPA/percentage calculation, so an absent subject still counts toward the average rather than being excluded).
- **Grading style** (`Grade.gradingStyle`) — each grade picks one of two report card styles:
  - `MARKS_BASED` (default) — raw marks, percentage, letter grade (A+ to E), GPA per subject, simple average GPA.
  - `CREDIT_GRADE_BASED` — SEE/NEB-style: each subject has a `creditHour`; theory and practical are graded independently, the overall GPA is credit-hour-weighted. Subjects always require theory marks — practical-only subjects are rejected by validation, since no such subject exists on the school's real grade sheets.
- **Grading scale** — fixed, not configurable per school: A+ (90–100%, GPA 4.0) down to E (0–20%, GPA 0.8), no NG/ungraded band — every percentage down to 0 gets a grade point. D and D+ and below D+ (D, E) are the failing bands (`FAILING_GRADES`); D+ and above pass. This mirrors the school's actual printed grade sheets — see `grading.service.ts` for the full rationale and `gradingScale.test.ts` for the pinned values.
- **Report cards** — generated as PDF via Puppeteer (`pdf.service.ts`), available in color or a genuinely ink-friendly B&W mode (line-art only, no solid fills — schools print these in class-sized batches). A4 and A5 paper sizes, per exam type. Column visibility (pass marks, %, grade, GPA, rank, attendance, remarks, promotion) is configurable per school via `ReportCardSettings`.
- **Promotion** — end-of-year workflow moving students to the next grade/section.
- **Bikram Sambat (BS)** dates are used throughout alongside Gregorian — see `nepali-date-converter` usage.

## Frontend (`frontend/src/app/`)

Role-based route groups: `admin/`, `teacher/`, `accountant/`, `parent/`, `student/`, `super-admin/`. Admin covers academic-years, grades, grading-policy, subjects, sections, exam-types, exam-routine, fees, admissions, promotion, seating, gallery, calendar, notices, observations, staff, report-settings.

`frontend/src/lib/gradingScale.ts` mirrors the backend grading scale for client-side display (student/teacher/admin pages) — keep it in sync with `backend/src/services/grading.service.ts`.

## Working conventions

- Backend and frontend each typecheck independently: `npx tsc --noEmit` in each directory.
- Backend tests: `cd backend && npm test` (needs `.env.test` pointing at a Postgres DB whose name contains "test" — see `backend/TESTING.md`). Report card tests assert exact PDF page counts, so layout changes to `pdf.service.ts` should be checked against `src/test/__tests__/reportCard.test.ts`.
- **Counting a route's queries in a test.** Under `NODE_ENV=test` the Prisma singleton emits query events instead of printing them (`utils/prisma.ts`), so a test can subscribe and count the SQL a route issues. This is how the N+1s on the hot paths stay fixed — see `src/test/__tests__/attendanceTotals.test.ts` for the shape to copy. Two things it does on purpose: it installs **one** listener for the whole file (Prisma has `$on` but no `$off`, so per-measurement subscribing leaks listeners), and it compares **two class sizes** rather than asserting one number — a per-student query that only fires sometimes still looks flat at a single size, which is how the first pass at P3 slipped through.
- Deployment: Railway, `migrate:prod && node dist/server.js` on boot (fails closed if migrations fail).
