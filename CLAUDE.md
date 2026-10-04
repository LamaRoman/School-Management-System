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
- `services/grading.service.ts` — single source of truth for the grading scale and percentage→grade/grade-point conversion, plus the credit-weighted GPA. **Duplicated** in `frontend/src/lib/gradingScale.ts` (the scale only) — change both together or the web UI and PDFs will disagree.
- `services/reportCard.service.ts` — the data behind a report card (`buildTermReportData`, `buildFinalReportData`), shared by the PDF routes, the on-screen preview and the portal / parent-app JSON (`report.routes.ts`), so they cannot disagree.
- `services/pdf.service.ts` — renders the report card HTML (`buildReportCardHtml`) and drives Puppeteer to produce the PDF.
- `middleware/auth.ts` — JWT auth (HttpOnly cookie for web, `Authorization: Bearer` for mobile). Roles: `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`, `TEACHER`, `STUDENT`, `PARENT`. `getSchoolId(req)` reads `schoolId` off the JWT and throws if missing — **use it to scope every query**, this is the multi-tenancy boundary.
- `prisma/schema.prisma` — the schema. Key models: `School`, `AcademicYear`, `Grade`, `Section`, `Subject`, `ExamType`, `GradingPolicy`, `Student`, `Teacher`, `Mark`, `ConsolidatedResult`, `Attendance`/`DailyAttendance`, `ReportCardSettings`, `ObservationCategory`/`ObservationResult`, fee models, `Admission`.

## Domain concepts

- **Academic Year → Grade → Section → Student** — standard school hierarchy, all scoped to a `School`.
- **Exam Type** — an exam instance (e.g. "First Terminal", "Final"), carries `isFinal` and paper size (A4/A5).
- **Grading Policy** — per-grade weightage % for each exam type, used to compute the weighted annual result from term marks.
- **Mark** — a student's `theoryMarks`/`practicalMarks` for one subject + exam type. Both are nullable; `isAbsent` marks a student as absent for that subject (marks are stored as `null`, rendered as **"Ab"** everywhere — report cards, grade sheets, admin/teacher/student pages, parent app — **never as a grade**; a not-yet-entered paper shows "—"). While any paper is absent or not entered the overall GPA shows "—" (the API keeps the number and adds `incomplete: true`). Internally an absent paper is still scored 0 (E / 0.8) in the GPA, so it counts toward the average rather than being excluded — otherwise skipping an exam would raise a student's GPA.
- **Report card** — one design for every school: credit hour + grade point (SEE/NEB style). Each subject has a `creditHour`; theory and practical are graded independently, then a final grade and grade point from the combined marks; the **Grade Points Average is credit-hour-weighted**. Subjects always require theory marks — practical-only subjects are rejected by validation.
- **Grading scale** — fixed, not configurable per school: A+ (90–100%, GPA 4.0) down to E (0–20%, GPA 0.8), no NG/ungraded band — every percentage down to 0 gets a grade point. **There is no pass / fail and no rank** (decided 2026-10-04): no pass marks on subjects, no Result line, no rank on the card, grade sheet or dashboard. The class grade sheet shows each subject's marks (annual: weighted %) and the same credit-weighted GPA as the card. See `grading.service.ts` and `gradingScale.test.ts` for the pinned values.
- **Results publishing** — a section's results for one exam move `DRAFT → READY → PUBLISHED` (`ExamResultStatus`, one row per exam type × section). The section's **class teacher** marks entry complete (READY); an **admin** publishes (PUBLISHED). Only PUBLISHED is visible to `PARENT`/`STUDENT` — in the portal *and* the PDF routes, which allow STUDENT and would otherwise bypass it. Teachers and admins always see everything. The **annual result is derived, not separately published**: it appears once every exam type with weight in the grade's `GradingPolicy` is published for that section. Completeness is reported, never enforced — gaps are legitimate (optional subjects, mid-year transfers), so the teacher is told exactly which marks are missing and may proceed anyway.
- **Report cards** — generated as PDF via Puppeteer (`pdf.service.ts`), available in color or a genuinely ink-friendly B&W mode (line-art only, no solid fills — schools print these in class-sized batches). A4 and A5 paper sizes, per exam type. Column visibility (theory/practical split, final grade, grade point, attendance, remarks, promotion) is configurable per school via `ReportCardSettings`. The web pages show the PDF's own HTML (`?format=html`); the parent app draws the same data natively. **Attendance** prints next to the GPA as present / total days (`examAttendance.service.ts`), counted from the daily register: a term card shows only that term's days (year-to-date minus the previous exam's), the annual card the whole year. It is **frozen when the admin publishes** the exam (`ExamAttendance` rows written by result-status /publish), so a reprint shows the numbers it was released with; before publishing, the preview shows the live count. Unpublish + publish re-freezes; publishing other sections never re-freezes one already out.
- **Promotion** — end-of-year workflow moving students to the next grade/section.
- **Bikram Sambat (BS)** dates are used throughout alongside Gregorian — see `nepali-date-converter` usage.

## Frontend (`frontend/src/app/`)

Role-based route groups: `admin/`, `teacher/`, `accountant/`, `parent/`, `student/`, `super-admin/`. Admin covers academic-years, grades, grading-policy, subjects, sections, exam-types, exam-routine, fees, admissions, promotion, seating, gallery, calendar, notices, observations, staff, report-settings.

`frontend/src/lib/gradingScale.ts` mirrors the backend grading scale for client-side display (student/teacher/admin pages) — keep it in sync with `backend/src/services/grading.service.ts`.

## Working conventions

- Backend and frontend each typecheck independently: `npx tsc --noEmit` in each directory.
- Backend tests: `cd backend && npm test` (needs `.env.test` pointing at a Postgres DB whose name contains "test" — see `backend/TESTING.md`). Report card tests assert exact PDF page counts, so layout changes to `pdf.service.ts` should be checked against `src/test/__tests__/reportCard.test.ts`.
- **Counting a route's queries in a test.** Under `NODE_ENV=test` the Prisma singleton emits query events instead of printing them (`utils/prisma.ts`), so a test can subscribe and count the SQL a route issues. This is how the N+1s on the hot paths stay fixed — see `src/test/__tests__/attendanceTotals.test.ts` for the shape to copy. Two things it does on purpose: it installs **one** listener for the whole file (Prisma has `$on` but no `$off`, so per-measurement subscribing leaks listeners), and it compares **two class sizes** rather than asserting one number — a per-student query that only fires sometimes still looks flat at a single size, which is how the first pass at P3 slipped through.
- Deployment: Railway project `satisfied-heart` (production environment) — the backend service `api` (repo root `/backend`, builds from `backend/railway.json`, deploys on push to `main`) sits next to the `Postgres` service and reaches it over the **private network** (`DATABASE_URL = ${{Postgres.DATABASE_URL}}` → `postgres.railway.internal`). `migrate:prod && node dist/server.js` on boot (fails closed if migrations fail); health check `/health`, so a deploy only takes traffic once it is up. Custom domain `api.school.zentaralabs.com`: DNS is on Vercel (CNAME + `_railway-verify.api.school` TXT — both change if the domain ever moves to another Railway service). Frontend on Vercel.
