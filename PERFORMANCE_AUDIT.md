# Audit — Zentara Shikshya

Assessment date: 2026-08-14 · Last worked: 2026-08-14 · Scope: `backend/` and `frontend/` only (mobile apps excluded by request)
Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` won't do / not applicable

> Findings are grouped by area and prefixed: **S** = security/tenancy, **R** = report correctness, **W** = workflow gaps (new capability, not a bug), **P** = performance, **F** = frontend, **X** = robustness/cost.

---

## Start here — current state (2026-08-14)

**Week 1 is complete.** All work below is merged to `main` and deployed (Railway auto-deploys on push; `startCommand` is `migrate:prod && node dist/server.js`, so the P2 index migration applied on boot — deploy reported success). F6 is the exception to "deployed" — it is done and verified locally but not yet merged; see its entry.

| Done | What it was | PR |
|---|---|---|
| **R1–R2, R4–R5** | Absent subjects excluded from averages → now count as zero | (earlier) |
| **P1a** | Base64 photos dropped from the roster payload | #7 |
| **S1 + S1a** | Promotion accepted foreign student IDs; loop wasn't transactional | #8 |
| **S2, S3** | Attendance + observations accepted foreign student IDs | #8 |
| **P2** | 7 missing indexes on the hot report/roster/fee queries | #9 |
| **F1, X1** | CORS preflight on every GET; no gzip | #10 |
| **X2, F3** | Health check ignored the DB; 3 pages had no loading state | #11 |
| **F6** | No route error/loading boundaries — any thrown error was a blank white screen | #13 |
| **F4a** | Stale-response races on the six pages where a wrong render becomes a wrong *write* | *unmerged* |

**Suggested next:** **R7 → P3** → **P4 (+P4a)**. Consider **S4** sooner than its Week 3+ slot — F4a's work on `admin/teacher-assignments` showed the missing subject/grade check is the server-side backstop that page needs.

### Corrections found while doing the work — read these before trusting a finding below

The original assessment was mostly accurate, but four items were wrong in ways that changed the work:

1. **P1's "main cause of the lag" claim is unproven.** The dev database has **0 of 261 students with a photo**. The roster payload problem is real *if photos get used*, but it was not causing lag in the data I could see. P1a is still worth having (it removes the landmine); don't assume it sped anything up.
2. **P2 — `daily_attendances` was not unindexed** for the per-student recompute. Its unique constraint leads with `student_id`, so P4's recompute already used an index. The genuine gap was the *dashboard* query (year + date, no student filter).
3. **F3 was 3 pages, not 5** — `accountant/fees` and `accountant/admissions` are one-line re-exports of admin pages that already had loading states. And the two table pages showed the *empty-state message* while loading ("No students in this section"), not a blank table — a stronger match for the reported symptom.
4. **S6b — `School.code` being null is a seed artifact, not a live gap.** See the note under S6b; schools created through the portal always get a code.

### Environment notes for whoever picks this up

- **Two schools in the dev database.** `Shree Himalayan Secondary School` (`default-school`) has the real data — 260 students, 4,186 marks — via `admin@school.edu.np`. `Portal Demo School` is a small hand-built set for testing the parent/student portal (1 student with marks, a linked parent, a teacher); it has **no admin login** since the stale test account was removed. Seed logins are printed by `backend/prisma/seed-all.ts` and `seed-dev.ts`.
- **Verify UI changes in the running app, not just via typecheck.** Several findings here were only caught by clicking through.
- **Dev and test databases are separate** (`nepali_report_card` vs `..._test`). `helpers.ts:21` guards against the suite ever wiping the dev one — it happened once.
- **`.claude/launch.json` is committed** (2026-08-14) — dev-server config for `backend` (port 4000) and `frontend` (port 3000), so the preview tooling starts them the same way for everyone. Per-developer Claude settings (`.claude/settings.local.json`) are gitignored. Fixed a typo in the same pass: `.gitignore` read `*.logbackend/.env.test` on one line, so `*.log` was never actually ignored.
- **Branch hygiene.** Six merged feature branches were pruned locally on 2026-08-14. `fix/accounts-without-logins` was **shipped** the same day (PR #15) once its premise was checked and held: 80 of 261 dev students have no login account. The bug that produced them is **still open** — see **X7**.
- **80 students in the dev database have no login account** and the backfill has not been run against it. Running it needs `DEFAULT_STUDENT_PASSWORD` set in the environment; the script refuses without one.
- **Verifying anything in the teacher or parent portals needs a real login for that role** — an ADMIN can open `/teacher/*` (the layout allows it) but `/teacher-assignments/my` returns no class-teacher sections for them, so every section selector is empty and the page can't be exercised. Seed logins are in `seed-all.ts`.

---

## Read this first — the two headline findings

**1.** ~~Student photos are base64-encoded into the Postgres `students.photo` column and returned in full on every class roster fetch~~ — **PARTLY FIXED 2026-08-14 (P1a), and the premise needs qualifying.** The roster no longer returns `photo`, so the payload problem is gone. But the claim that this was "almost certainly the main cause of the lag" was **never verified and looks wrong**: no student in the dev database has a photo at all, so there were no multi-megabyte rosters to observe. Treat P1b–P1d (photos → S3) as removing a real design flaw before it bites, not as a latency fix. → **P1**

**2.** ~~Absent subjects are silently dropped from report card averages~~ — **✅ FIXED 2026-08-14.** Policy decided as *"an absence counts as zero"*. R1, R2, R4 and R5 all resolved by the one change; R3 partially (see its note). → **R1–R5**

**3.** ~~Three bulk-write endpoints accept student IDs from any school without checking membership (**S1–S3**), one of which can move another school's students into yours~~ — **✅ FIXED 2026-08-14.** All three now batch-verify membership before writing, and the promotion loop is transactional (**S1a**). The remaining tenancy items are **S4–S8**, none of which are destructive cross-school writes.

**Also added since:** a full results-publish workflow (**W1**), automatic fee setup on enrollment (**W2**), an admin-portal declutter — fee management, admissions, grade sheet, observations, and both student-creation bypass routes each move to (or are closed in favor of) the one role that should own them (**W3**) — and a grade-sheet Excel export (**W4**). All designed and agreed 2026-08-14; none built yet.

---

## What's already good (don't break these during cleanup)

- Auth is genuinely solid — algorithm pinning, `jti` blocklist, timing-attack dummy hash, account lockout, short-lived access tokens, weak-JWT-secret startup refusal, refresh-token rotation with a path-scoped cookie.
- The tenancy boundary is real and consistently applied. I checked all 35 route files: `getSchoolId` + `schoolScope.ts` parent-chain verification is used correctly nearly everywhere. `superAdmin` and `masterCalendar` correctly gate at the router level with `router.use(authenticate, authorize("SUPER_ADMIN"))`.
- `verifyStudentAccess` in `report.routes.ts:17` correctly restricts STUDENT to self and PARENT to linked children.
- Fee soft-deletes (`deletedAt: null`) are applied on **every** read path — verified across all 12 call sites.
- Receipt numbering is correctly transactional and atomic per school.
- The grading scale duplication between backend and frontend is **currently in sync** — verified value by value.
- `publicCalendar` correctly filters to `EVENT`/`HOLIDAY`, keeping internal `MEETING`/`EXAM` private.
- `upload.service.ts` is exemplary — sharp resize, webp re-encode, EXIF/GPS stripping, S3. (This is exactly what student photos *should* be using — see **P1**.)
- Puppeteer browser lifecycle (singleton, idle shutdown, `unref()`, mid-render timer cancellation) is careful and well documented.
- `mark.routes.ts:76` and `student.routes.ts:487` both correctly verify that submitted student IDs belong to the target section. They're the model the endpoints in **S1–S3** should copy.

---

# S — Security & cross-school isolation

### [x] S1. Promotion accepts unverified student IDs — can move another school's students into yours

> **FIXED 2026-08-14.** Every `studentId` in `promotions[]` is now batch-verified to belong to `sourceGradeId` within this school before anything is written, using the same `count()`-and-compare pattern as `mark.routes.ts:77`. A batch containing even one foreign id is rejected whole with a 400.
>
> Pinned by `src/test/__tests__/promotion.test.ts` (6 tests), verified to fail 5/6 against the old code. Full suite 151/151. Also confirmed against the running dev app: graduating a real cross-school student now 400s and leaves that student untouched, while a legitimate same-school promotion still succeeds.
**Where:** `backend/src/routes/promotion.routes.ts:284` (`POST /promotion/promote`)

`sourceYearId`, `targetYearId` and `sourceGradeId` are all verified. The `studentId` values inside the `promotions[]` array are **not**:

```
for (const p of promotions) {
  if (p.action === "GRADUATE") {
    await prisma.student.update({ where: { id: p.studentId }, data: { status: "GRADUATED", isActive: false } });
  } ... else {
    await prisma.student.update({ where: { id: p.studentId }, data: { sectionId: targetSection.id, ... } });
  }
}
```

An admin of School A can pass **any student ID in the database** and:
- `GRADUATE` → sets another school's student to `GRADUATED, isActive: false`, making them vanish from their own school's rosters, report cards and fee ledgers. **Destructive cross-tenant write.**
- `PROMOTE` / `RETAIN` → sets `sectionId` to one of School A's sections, **moving another school's student into School A**, where their name, marks and fee records become visible.

`targetSectionId` *is* effectively safe — it's resolved by lookup within `nextGrade.sections` / `sameGrade.sections`, which derive from the verified `targetYearId`. Only the student side is unguarded.

**Fix direction:** batch-verify every `studentId` belongs to `sourceGradeId` in this school before the loop — the same `count()`-and-compare pattern already used in `mark.routes.ts:77`.

- [x] **S1a.** The loop is **not** in a transaction, and `throw new AppError(...)` mid-loop (e.g. "No next grade found") leaves a partial promotion — the first N students already moved with `rollNo: null`, no rollback, no way to tell which. Wrap it, and validate `nextGrade`/`sameGrade` exist *before* mutating anything.

  > **FIXED 2026-08-14** in the same change. The loop now only *plans* updates — resolving the target grade and section, and throwing on anything unresolvable — and the writes go out afterwards in a single `$transaction`. Nothing is written unless every entry in the batch resolves.
  >
  > The atomicity test fails against the old code exactly as this note predicted: a `GRADUATE` ahead of an unpromotable student stayed graduated.

---

### [x] S2. Daily attendance accepts unverified student IDs

> **FIXED 2026-08-14.** Every `studentId` in `records[]` is now verified to belong to `sectionId` before the upsert, same `count()`-and-compare pattern as S1. **This is the F4a backstop** — a page that races and saves against the roster it is no longer showing now gets a clean 400 instead of writing attendance for the wrong class, so F4a is unblocked.
>
> Pinned by `src/test/__tests__/bulkWriteIsolation.test.ts`. Verified live: a foreign student, a wrong-section student, and a mixed batch are all rejected; a legitimate roster still saves and recomputes totals.
**Where:** `backend/src/routes/dailyAttendance.routes.ts:86` (`POST /daily-attendance/bulk`)

`verifySection` and `verifyAcademicYear` are called, and teachers are checked for section assignment — but the `studentId`s inside `records[]` are never checked to belong to that section or school. They go straight into the upsert.

A teacher or admin can write `DailyAttendance` rows for **any student ID in the database**. Those rows then feed the target student's `Attendance` totals and appear on their report card, in another school.

`mark.routes.ts:76–85` does exactly this check correctly. Attendance is the outlier.

**Fix direction:** copy the `mark.routes.ts` membership check — count students matching `{ id: { in: studentIds }, sectionId }` and reject on mismatch.

---

### [x] S3. Observation bulk-save accepts unverified student and category IDs

> **FIXED 2026-08-14.** `academicYearId` is now verified, and all `studentId`s and `categoryId`s are batch-verified to resolve inside this school. Also added the invariant the note below implies but doesn't state: `examType.academicYearId` must equal the submitted `academicYearId`, since both are part of the row's unique key and a mismatched pair writes a row belonging to no coherent (year, exam) combination — the same class of bug as **S4a**.
>
> Confirmed the frontend already sends a matching pair (`teacher/observations/page.tsx:109` sends `selectedSection.academicYearId`, and its exam types are fetched filtered by that same year), so the stricter check doesn't break the existing UI.
>
> Pinned by `src/test/__tests__/bulkWriteIsolation.test.ts`.
**Where:** `backend/src/routes/observation.routes.ts:174` (`POST /observations/results/bulk`)

Only `examTypeId` is verified. `studentId`, `categoryId` and `academicYearId` are all taken on trust and written directly (up to 1000 entries per call).

Allows writing observation grades onto another school's students, which then surface on that school's report cards. Also permits a mismatched `academicYearId`, corrupting the unique key's meaning.

**Fix direction:** verify `academicYearId`, and batch-verify that all `studentId`s and all `categoryId`s resolve within this school.

---

### [ ] S4. Unverified `subjectId` leaks another school's subject names — and permits within-school mismatches
**Where:** three endpoints accept a `subjectId` without calling `verifySubject`, then echo it back via `include`:

- [ ] `backend/src/routes/teacherAssignment.routes.ts:108` — response includes `subject: { select: { name: true } }`
- [ ] `backend/src/routes/homework.routes.ts:98` — response includes `subject: { select: { id: true, name: true } }` (the TEACHER path is indirectly constrained by `isAssignedToSection`; the ADMIN path is not)
- [ ] `backend/src/routes/examRoutine.routes.ts:38` and `:75` — `examTypeId` and `gradeId` are verified, `subjectId` is not

An admin who obtains a foreign `subjectId` gets that school's subject name back in the API response, and creates rows whose foreign keys cross the tenancy boundary.

**Don't just add `verifySubject` — fix the invariant.** Adding `verifySubject(subjectId, schoolId)` closes the leak but is the weaker fix, and leaves a second hole open.

`Subject` belongs to a `Grade` (`schema.prisma:189`), and so does `Section`. The invariant these endpoints actually need is **"the subject belongs to the same grade as the section/grade it's being attached to"** — strictly stronger than school membership, and it closes a bug you have *today, within a single school*:

| Endpoint | Correct check | What's broken without it |
|---|---|---|
| `teacherAssignment.routes.ts:108` | `subject.gradeId === section.gradeId` | A Class 3 Maths subject can be assigned to a Class 9 section. Same school, would pass `verifySubject`. That assignment then **gates mark entry**, so it corrupts who can enter marks for what. |
| `homework.routes.ts:98` | `subject.gradeId === section.gradeId` | Homework appears under a subject the section doesn't study. |
| `examRoutine.routes.ts:38,75` | `subject.gradeId === gradeId` (already an input) | `@@unique([examTypeId, gradeId, subjectId])` happily persists a mismatched pair, and it **prints on the routine**. |
| `gradingPolicy.routes.ts:31` | `examType.academicYearId === grade.academicYearId` | See S4a — this one isn't a security bug at all. |

**Fix direction:** extend `schoolScope.ts` with "X belongs to Y" helpers (e.g. `verifySubjectInGrade(subjectId, gradeId)`, `verifyExamTypeInYear(examTypeId, academicYearId)`) rather than sprinkling `verifySubject` calls. Same file, same style as the existing helpers, and it makes the intent legible at each call site.

- [ ] **S4a. `gradingPolicy.routes.ts:31` — a correctness bug, not a security one.** It verifies `gradeId` but not the `examTypeId` values inside `policies[]`. The needed check is `examType.academicYearId === grade.academicYearId`. A policy referencing an exam type from a **different academic year** would silently produce wrong weighted final results, and nothing would ever flag it.

- [ ] **S4b. Add a regression test for the whole class.** `backend/src/test/__tests__/` already exists. A table-driven test that walks every write endpoint, feeds a foreign-school ID for each FK it accepts, and asserts 404 would catch this permanently. **Worth more than the four patches** — this bug got in four separate times because nothing was checking for it.

---

### [ ] S5. `examTypeId` unscoped in PDF report builders
**Where:** `backend/src/routes/pdf.routes.ts:74`

`examTypeId` goes from the URL straight into `findUniqueOrThrow` with no school scoping, though `verifyExamType` exists and is used elsewhere.

**Not currently exploitable** — the marks query is scoped by student, so a cross-school `examTypeId` returns no marks and 404s. Worth closing anyway: it's an unguarded hole in a boundary you're otherwise rigorous about, and it's one refactor away from mattering.

---

### [ ] S6. Public endpoints serve any school by ID, including deactivated ones
**Where:** `backend/src/routes/publicGallery.routes.ts:7`, `publicCalendar.routes.ts:13`

Neither checks `School.isActive`, nor that the school has registered a `websiteUrl` at all.

The CORS allowlist in `publicOrigins.service.ts` is **not** a security control — CORS only constrains browsers, and `isAllowedPublicOrigin` deliberately returns `true` when there's no `Origin` header (correctly noted in its own comment). So `curl https://<api>/public/gallery/<schoolId>` returns data for any school whose ID is known.

The exposed data is genuinely low-sensitivity (gallery photos, EVENT/HOLIDAY entries — all intended to be public). The real issues are: **a suspended or non-paying school's content keeps being served**, and the code reads as if CORS were protecting it.

This is three separate problems wearing one coat:

- [ ] **S6a. Gating.** `School` has both `galleryPhotos` and `calendarEvents` relations, so this is a where-clause addition, not an extra query — filter on `school: { isActive: true }`. Also require `websiteUrl != null`: it makes "has a public site" the explicit precondition for being publicly served, which is the actual business rule, and stops a school that never set up a website from quietly serving content.

- [ ] **S6b. The identifier — the more interesting one.** Public URLs currently carry the raw cuid `schoolId`: an internal primary key that ends up embedded in the school's public website HTML where anyone can read it. `School.code` already exists and is `@unique` (`schema.prisma:47`). Keying the public routes on `code` instead stops internal IDs leaking into public pages entirely. Catch: `code` is nullable, so it would need to become required for any school with a public site — worth doing as part of the same change rather than later.

  > **Investigated 2026-08-14 — decided to leave as-is until S6b is actually built.** Checked how a school can end up with `code: null`, because the dev DB's main school has one:
  >
  > - **Schools created through the super-admin portal always have a code.** The form initialises `code: ""` and always sends it, and `createSchoolSchema` is `z.string().min(2).max(6).optional()` — `.optional()` permits `undefined`, not `""`, so a blank code is *rejected* rather than stored as null. The `code: data.code ?? null` branch at `superAdmin.routes.ts:118` is only reachable by an API client that omits the key entirely.
  > - **The dev null is a seed artifact.** `seed-all.ts:207` creates `default-school` directly through Prisma with no `code` field, bypassing the API.
  > - **Nothing breaks today.** `fee.routes.ts:648` falls back to `schoolId.slice(-6).toUpperCase()` as the receipt prefix. Uniqueness holds either way — `code` is `@unique` and the fallback derives from the unique `schoolId` — and the per-school counter is atomic.
  >
  > **The one thing to know when S6b is built:** the receipt prefix is read fresh on every payment, so backfilling a `code` onto a school that has *already issued receipts through the API* changes its series mid-stream (`RCP-A1B2C3-000046` → `RCP-SHS-000047`). No duplicates and nothing errors — `receiptNumber` has no unique constraint and the counter keeps climbing — but it's a visible discontinuity on the document accountants reconcile and parents keep. Backfill codes *before* a school starts taking payments, or accept the break deliberately.
  >
  > - [ ] **S6b-i. Minor, unrelated to the migration:** the School Code input on the create-school form (`super-admin/schools/page.tsx:71`) is labelled `*` but has no `required` attribute, unlike School Name and Admin Email beside it. Leaving it blank surfaces a raw zod `String must contain at least 2 character(s)` instead of "School Code is required." Two-character fix, not worth its own PR — fold into whatever touches that form next.

- [ ] **S6c. The comment.** `publicOrigins.service.ts` is honest about returning `true` for no-Origin requests, but the surrounding code reads as though CORS were the gate. Whatever you implement, make the file say plainly that CORS here is browser convenience and the `isActive` filter is the actual boundary — otherwise the next person to touch it makes the same assumption.

Two more worth doing in the same pass, both hitting the cost goal:

- [ ] **S6d. `/public/*` can rate-limit the school's own website.** `app.use("/", apiLimiter)` at 500 req / 15 min **per IP** applies to `/public/*` too. If a school's site is server-rendered, every visitor's request arrives from a single server IP — **the site can rate-limit itself** under quite modest traffic, presenting as an intermittently broken gallery. `/public/*` needs its own limiter with different characteristics.

- [ ] **S6e. Add `Cache-Control` to `/public/*`.** These responses are public and change rarely, and `websiteRevalidate.service.ts` already gives you a revalidation webhook to invalidate on change. Caching them at the school's site and any CDN cuts DB load and Railway egress on what is likely your highest-volume unauthenticated traffic.

---

### [ ] S7. Policy question: TEACHER has full read access to every student in the school
**Where:** `backend/src/routes/report.routes.ts:18` — `if (role === "ADMIN" || role === "TEACHER") return; // full access`

A Class 1 teacher can pull report cards, marks and observation data for Class 10 students they've never taught. `student.routes.ts:197` *does* restrict teachers to their assigned sections for rosters — so the codebase is inconsistent about whether teachers are section-scoped.

This may well be intended for a small school. Flagging so it's a decision rather than an accident, and so the two endpoints get made consistent either way.

> **Note (2026-08-14):** **W3b** decides this for grade sheet and observations specifically — both move to class-teacher-only. `report.routes.ts:18` (the report/PDF access this item was originally about) is broader than that and still open — same underlying question, not yet decided for the rest of the surface.

---

### [ ] S8. No server-side size limit on student photos
**Where:** `backend/src/routes/student.routes.ts:27` — `photo: z.string().optional()`

No `.max()`. The 500KB check exists **only in the browser** (`frontend/src/app/admin/students/page.tsx:165`). The effective server-side cap is `express.json({ limit: "5mb" })`, so a crafted request stores a ~5MB string per student. See **P1** for the storage-design problem this sits on top of.

---

# R — Report card correctness

> All four findings share one root cause: the `isAbsent` early-return hardcodes `gpa: null` / `grade: "NG"`, and the downstream aggregations then disagree about whether to skip it.
>
> **Good news:** `pdf.routes.ts` and `report.routes.ts` are consistent *with each other*, so the web portal and the PDF agree. The disagreements are between different numbers **on the same page**.

### [x] R1. Absent subjects are excluded from GPA and percentage — contradicting the documented rule

> **FIXED 2026-08-14.** Policy decided: **an absence counts as zero**, matching what `CLAUDE.md` already documented. Absent subjects now fall through the normal grading path (null marks read as 0 → E / 0.8) instead of short-circuiting to `gpa: null`, and all six aggregation points average over *every* subject rather than filtering absences out.
>
> Changed in `pdf.routes.ts` (term + annual, both grading styles), `report.routes.ts` (term + annual), `gradeSheet.routes.ts` (term + annual). **Display is unchanged** — "Ab"/"NG" is driven by the `isAbsent` flag in the templates, not by the values, so cards look identical apart from the corrected totals.
>
> Pinned by `src/test/__tests__/absentMarks.test.ts` (5 tests), verified to fail against the old behaviour. Full suite 144/144.
**Where:** `backend/src/routes/pdf.routes.ts:184–190` and `backend/src/routes/report.routes.ts:240–246`

Absent subjects are given `gpa: null` (`pdf.routes.ts:158`). Then:

```
const gpas = marksSubjects.map((s) => s.gpa);
overallGpa = calculateOverallGpa(gpas);                       // filters out nulls → absent EXCLUDED
const gradedSubjects = marksSubjects.filter((s) => !s.isAbsent);
overallPct = ...gradedSubjects... / gradedSubjects.length;    // absent EXCLUDED
```

`CLAUDE.md` states absent marks are *"treated as 0 in every GPA/percentage calculation, so an absent subject still counts toward the average rather than being excluded."* The code does the opposite.

`grading.service.ts:30` is even more direct — it says the NG band was removed specifically so that *"No subject is ever excluded from a GPA average any more. Previously an NG subject had a null grade point and was skipped, which quietly inflated the average of a struggling student."* By hardcoding `gpa: null` for absences, the report builders **reintroduce exactly the bug that comment says was fixed**, bypassing the scale entirely.

**Real-world effect:** a student who skips the exam in their weakest subject gets a *higher* GPA and percentage than one who sits it and scores 20%. On report cards that go home to parents.

**Decide which is right** — the documented rule or the current behaviour — then make code and docs agree. (The Aug 2026 commits `8be3ca8` and `c435c41` deliberately introduced "Ab"/"NG" *display*; whether excluding them from the *average* was intended or a side effect is the open question.)

---

### [x] R2. Rank and percentage on the same report card use different formulas

> **FIXED 2026-08-14** as a consequence of R1. Rank always scored absences as 0; the printed percentage now does too, so the two agree. Covered by the "agrees with the rank it prints beside the percentage" test.
**Where:** rank at `pdf.routes.ts:214–223` and `report.routes.ts:55–70`; percentage at `pdf.routes.ts:186–189`

The rank calculation treats absent as **0** and divides by **all** marks:
```
totalPctSum += calculatePercentage((m.theoryMarks || 0) + (m.practicalMarks || 0), fm);
studentPercentages.push({ studentId: stu.id, avgPct: totalPctSum / stuMarks.length });
```
The percentage printed on the same card **excludes** absent subjects entirely (R1).

So a card can read *"Percentage: 78.5% · Rank: 23rd"* where the rank was derived from an internal average of ~61%. Two numbers on one page, computed on incompatible bases.

---

### [~] R3. Grade sheet rank ≠ report card rank — *absence half fixed, one gap remains*

> **PARTIALLY FIXED 2026-08-14.** The absence-driven divergence is gone: both now score absences as 0.
>
> **Still open:** the two use different denominators when a mark row is *missing entirely* (never entered, as opposed to marked absent). The grade sheet iterates every subject in the grade and scores a missing row as 0; the report card iterates only the student's own mark rows. So during incomplete marks entry the two can still disagree. That's the same root as **R6** and should be closed with it.
**Where:** `backend/src/routes/gradeSheet.routes.ts:89–91` vs `pdf.routes.ts:214–223`

- Grade sheet ranks by `avgPct`, which **excludes** absent subjects.
- Report card ranks by an average that **includes** absent as 0.

For any class containing one absent student, the rank on the class mark sheet and the rank on that student's report card **will differ**. Both are printed and handed out.

---

### [x] R4. Grade sheet's Total and Percentage columns disagree on the same row

> **FIXED 2026-08-14** as a consequence of R1. `totalObtained` / `totalFullMarks` always counted absences as 0 over full marks; `avgPct` now does too. The test asserts `totalObtained / totalFullMarks × 100 === percentage` so a parent checking by hand lands on the printed figure.
**Where:** `backend/src/routes/gradeSheet.routes.ts:86–90`

```
const totalObtained  = subjectResults.reduce((a, s) => a + s.obtained, 0);    // absent counted as 0
const totalFullMarks = subjectResults.reduce((a, s) => a + s.fullMarks, 0);   // absent subject's full marks INCLUDED
const gradedResults  = subjectResults.filter((s) => !s.isAbsent);
const avgPct = gradedResults.reduce(...) / gradedResults.length;              // absent EXCLUDED
```

The Total column is on an absent-as-zero basis; the Percentage column beside it is on an absent-excluded basis. A parent can divide `480 / 800 = 60%` and see the Percentage column claim 68.6%. **Checkable by hand on a printed sheet** — this one generates complaints.

---

### [x] R5. Partial vs full absence are treated differently in the final report

> **FIXED 2026-08-14** as a consequence of R1, exactly as predicted — resolving R1 toward "count as zero" made full absence behave like partial absence automatically. Both now weight in as 0.
**Where:** `backend/src/routes/report.routes.ts:349`

`allTermsAbsent` means a subject is only excluded when the student was absent in **every** term. Absent in one term only → that term correctly weights in as 0 (`:370`).

So the same absence is *"count as zero"* at the term-weighting level and *"exclude"* at the subject-aggregation level. Worth confirming this is deliberate; if R1 is resolved toward "count as zero", this becomes consistent automatically.

---

### [ ] R6. Rank denominator varies by how many marks each student has
**Where:** `pdf.routes.ts:222` and `report.routes.ts` — `avgPct = totalPctSum / stuMarks.length`

The divisor is the number of marks *that student has*. A student missing one subject's mark entry is averaged over 7 subjects while classmates are averaged over 8, inflating their rank. Rankings therefore shift as marks entry progresses, and a rank printed mid-entry won't match one printed after.

May be the intended forgiving reading — confirm and document either way.

---

### [x] R7. De-duplicate the rank calculation

> **DONE 2026-08-14.** `services/rank.service.ts` — `computeSectionRanks(sectionId, examTypeId, academicYearId)` returns a Map for the whole section. Used by all three surfaces: the PDF card, the web portal, and the class mark sheet.
>
> **It was three copies, not two.** `gradeSheet.routes.ts` had a third, and it was the one that disagreed.
>
> **Two decisions were needed, both taken with the school owner rather than assumed:**
>
> 1. **The divisor is every subject in the grade**, with a missing mark scoring 0 — the mark sheet's long-standing rule. The report card used to divide by however many mark rows a student happened to have, so an incomplete record was ranked on a different basis from classmates and came out inflated (**R6**), and the two printed documents disagreed during entry (**R3**'s remainder). A rank whose divisor changes per student is not a rank.
> 2. **The card now lists every subject in the grade**, un-entered ones printed as `—`. This followed necessarily: moving the rank without moving the printed percentage would have recreated **R2** exactly — two numbers on one page on incompatible bases. With both moved, the rows a parent can add up reach the percentage printed at the bottom, which is the hand-checkability **R4** was about.
>
> **`notEntered` is deliberately not `isAbsent`.** They score identically, but "Ab" asserts the student did not turn up, which is a different and possibly untrue claim about a child. Un-entered marks print `—` while still grading 0 in the columns beside them. A card with any un-entered subject also reports its result as **Incomplete** rather than a confident Pass/Fail.
>
> **This closes R3 and R6, and does most of P3.** The bulk PDF route now computes the ranking once per batch instead of rebuilding it per student — see the note under **P3**.
>
> Pinned by 10 tests in `src/test/__tests__/sectionRank.test.ts`; the 3 that exercise the routes were verified to fail against the old code, and the template assertions render the real HTML. Suite 174 → **177**. Also confirmed live on seeded data: for five students in I-A the grade sheet and the term report now return identical rank *and* identical percentage, over identical subject counts.
>
> - [ ] **R7a. Not carried over: `Subject.isOptional` is still ignored everywhere.** It exists on the model and is referenced by no route. A grade with an optional subject now scores every student who does not take it as 0 for it — which the *grade sheet has always done*, so this change does not introduce it, but it does make one shared place where it can finally be fixed properly. Worth closing before any grade starts using optional subjects.

**Where:** `pdf.routes.ts:200–231` (PDF) and `report.routes.ts:39–80` (web) — same algorithm, two copies

`CLAUDE.md` documents this risk class for the grading scale, and that discipline is working — the scale is verifiably in sync. The rank duplication isn't documented anywhere, so nobody knows to keep them aligned.

**Fix direction:** extract `computeSectionRanks(sectionId, examTypeId)` into `services/`, returning a Map. Resolves R2, R3, R6 and the N+1 in **P3** in one move.

---

### [ ] R8. "Last exam" is inferred from array position, not `isFinal`
**Where:** `backend/src/routes/analytics.routes.ts:92` — `const lastExam = examTypes[examTypes.length - 1];`

Ordered by `displayOrder`, so adding a makeup/supplementary exam or reordering exam types silently points the subject-wise pass/fail panel at the wrong exam. No error — just wrong dashboard numbers. The `isFinal` flag already exists on `ExamType`.

---

# W — Workflow gaps (missing capability, not a bug)

> These aren't defects in existing code — they're capabilities the system doesn't have yet. Grouped separately from R/S/P because "fix" isn't the right verb; "build" is. Designed 2026-08-14, not yet built.

### [ ] W1. No results-publish workflow — parents/students see live, possibly-wrong numbers the moment marks entry starts
**Where:** confirmed by code inspection — `ExamType` has no `isPublished`/`isLocked`/`isFinalized` field (only `Notice.isPublished` exists, and that's unrelated). The only gate on `report.routes.ts:166` (the endpoint the parent/student portal calls) is `if (marks.length === 0) return null` — the instant a single subject has one mark saved, a computed percentage/GPA/rank is returned as if final.

**Why this matters:** marks are entered subject-by-subject over days, so "partially entered" isn't an edge case — it's the normal state of every exam for however long entry takes. A parent can open the portal on day one of entry and see a live, silently-shifting number that has nothing to do with the eventual result, with nothing on screen distinguishing it from a finished one. Unlike a printed PDF (a deliberate act an admin chooses to take, and would likely notice a blank subject before handing out), the portal has no human in the loop at all — it's the one surface a wrong number can reach a family completely unsupervised.

**Design agreed with the school owner, not yet built:**

- [ ] **W1a. Class teacher marks a section's exam "complete."** Uses the `isClassTeacher` role that already exists on `TeacherAssignment` — no new permission concept needed. This is a deliberate human action, not something inferred from whether every mark row happens to exist (a heuristic that breaks on `Subject.isOptional` and on students who transferred in mid-year and legitimately have no earlier mark).

- [ ] **W1b. The completeness check is a soft gate, not a hard block and not silence.** Neither extreme is right: silence reintroduces exactly the failure mode this exists to prevent (a forgotten cell in a 30-student × 8-subject grid going unnoticed); a hard block breaks on legitimate gaps (optional subjects, mid-year transfers) and eventually grows an override anyway, which is more complexity than just doing the soft version first. Instead: when the class teacher goes to mark complete, the system names exactly what's missing — *"3 students have no mark for Science"*, *"Ramesh Shrestha — no mark for Health & Population"* — and lets them proceed anyway if the gap is legitimate. Same pattern the codebase already uses elsewhere (`student.routes.ts`'s membership checks report specifically what failed rather than a generic rejection). Ideally surfaced as a running indicator *during* entry ("6 of 8 subjects entered"), not only as a warning at the moment of clicking complete.

- [ ] **W1c. Admin dashboard shows completion status across the whole school** — which grades/sections have been marked complete by their class teacher and which haven't, at a glance, rather than the admin having to check each one individually.

- [ ] **W1d. Publishing is a separate, deliberate admin action from "marked complete."** Two modes: publish everything at once (once every grade is ready), or publish class-wise/grade-wise so a ready grade doesn't have to wait on a slower one.

- [ ] **W1e. Before publish, parents/students see an explicit "Pending" state** — not a computed-but-wrong number, not a blank error.

- [ ] **W1f. Publishing triggers a notice.** `Notice` already has `isPublished`, `targetAudience`, and a `gradeId` field — this is close to built for exactly this ("First Terminal results are out"), just not wired to exam completion yet.

- [ ] **W1g. Teachers are unaffected** — they already have full report visibility today regardless of any of this (see **S7**), and that stays as-is; the gate is specifically for `PARENT`/`STUDENT` roles.

**Modeling note:** this needs a status concept distinct from two fields that already exist and mean something else — `ExamType.isFinal` is about weighting in the annual result, not publish status, and `Notice.isPublished` is about the announcement, not the underlying result data. Likely a new per-(examType, section) status (something like DRAFT → READY → PUBLISHED), tracking who marked it complete and when, separate from whether it's been published — not designed in detail yet.

---

### [ ] W2. Enrolling a student doesn't set up their fees — a second, disconnected manual step
**Where:** `backend/src/routes/admission.routes.ts:209` (`POST /admissions/:id/enroll`)

**Checked, so this is precise rather than assumed:**
- ✅ **The "shows up in class automatically" part already works.** `/enroll` creates the `Student` row with `sectionId` set and `isActive: true` in one step (`:236-251`), and the roster query (`/students?sectionId=`) has no other gate — the student appears in their class roster immediately. Nothing to fix here.
- ❌ **Fee assignment is not connected to enrollment at all.** `StudentFeeAssignment` — the row that actually makes a student owe money — is only ever created by `POST /fees/assignments` (`fee.routes.ts:532`), a fully separate, manual, one-student-at-a-time admin action. Nothing in `/enroll` touches it, even though a `FeeStructure` almost certainly already exists for that grade (`FeeStructure` is keyed by `gradeId` + `academicYearId` + `feeCategoryId` — the school has already told the system "Grade 5 pays 2000/month for tuition" at the grade level). That doesn't propagate to the individual student; the admin has to remember to separately visit Fee Management and re-enter it per new student.

**The real gap, then, isn't "admissions and fees should be one page"** — it's that enrolling a student is a moment where the system already knows enough (the student's grade, the grade's fee structure) to set up their fees, and doesn't.

**Decided 2026-08-14: fully automatic.** `/enroll` should auto-create `StudentFeeAssignment` rows by copying the grade's current `FeeStructure`.

**Checked that this doesn't conflict with overrides/scholarships:** `StudentFeeOverride` is looked up and applied completely independently at invoice-calculation time — `applyDiscount(amount, override)` in `fee.routes.ts:18` takes whatever base amount is currently in effect (assignment or structure) and layers the override on top, fresh, on every invoice build (`fee.routes.ts:70-111`). The override doesn't live inside the assignment record and doesn't care how the assignment was created. So auto-creating the assignment at enrollment is architecturally safe — a scholarship can still be applied the same day, a week later, or any time, exactly as it works for every other student today. The only real consequence is a timing window: between enrollment and whenever an override gets applied, the student's ledger shows the standard amount. Fine for same-day decisions; worth knowing about if financial-aid approval sometimes lags enrollment by longer.

---

### [ ] W3. Admin portal has duplicate screens for work that belongs to one role — declutter to one home per capability
**Where:** confirmed by direct comparison, not assumed:

- **Fees** — `frontend/src/app/accountant/fees/page.tsx` is one line: `export { default } from "@/app/admin/fees/page"`. It's not a second implementation, it's the *same component* mounted at a second URL. Since `accountant/layout.tsx` allows both `ACCOUNTANT` and `ADMIN` roles, an admin today can reach the identical full fee-management screen two different ways.
- **Admissions** — `frontend/src/app/accountant/admissions/page.tsx` is the same pattern: `export { default } from "@/app/admin/admissions/page"`. Same conclusion as fees.
- **Grade sheet** — `admin/grade-sheet/page.tsx` (107 lines) and `teacher/grade-sheet/page.tsx` (102 lines) are two separately-written, near-identical files — not a re-export, genuine duplication.
- **Observations** — `admin/observations/page.tsx` (263 lines) and `teacher/observations/page.tsx` (216 lines) differ by exactly one real capability: toggling a category's `isActive`, which is legitimately admin-only setup (`observation.routes.ts:29,51,82,106` are all `authorize("ADMIN")`). Everything else — entering/viewing observation grades — is duplicated.

**Why:** each of these capabilities is duplicated across two portals instead of living in the one place tied to whoever actually does the work. The accountant processes fees day-to-day; admin's job is oversight, not re-running the same screen. A section's class teacher owns their section's marks and observations; there's no reason any teacher in the building — or the admin — needs a second entry point into the same data.

**Design agreed:**

- [ ] **W3a. Remove `/admin/fees` from the admin sidebar.** `/accountant/fees` (same component, already reachable by `ADMIN` too via that layout's allowed roles) becomes the one operational fee screen. Admin's oversight need is already met by `admin/students/[id]/page.tsx`, which already pulls the fee ledger (paid/unpaid), marks, attendance, and observations into one read-only per-student view (`page.tsx:81-91` — fetches `/fees/student-ledger/`, marks, daily attendance, observations together). Nothing new to build here, just stop linking to the duplicate.

- [ ] **W3b. Remove `/admin/grade-sheet` and `/admin/observations` entirely — no admin-side page left for either.** Grade sheet and observation-entry live only in the teacher portal, and get restricted on the backend to the section's **class teacher specifically** (`TeacherAssignment.isClassTeacher`, which already exists), not any teacher in the school as today. Currently `gradeSheet.routes.ts:16,139` and `observation.routes.ts:174` all just check `authorize("ADMIN", "TEACHER")` with no assignment or class-teacher check at all — any teacher can pull up or grade any section. This closes that specifically for these two features (related to **S7**, which flagged the same gap more broadly).

- [ ] **W3c. Category setup stays admin-only, carved out on its own.** Confirmed 2026-08-14 — removing the whole `admin/observations` page can't take category management with it, since defining categories (`Punctuality`, `Discipline`, etc.) is legitimately admin's job and is already gated `authorize("ADMIN")` server-side. Needs its own small admin screen (or folds into an existing Setup section) — separate from grading, which moves to the class teacher.

- [ ] **W3d. Remove `/admin/admissions` from the admin sidebar.** Same shape as W3a — `accountant/admissions` is the identical component at a second URL. Admissions is accountant's job; remove the duplicate nav entry.

- [ ] **W3e. Remove "+ Add Student" from the admin students page — not cosmetic, this one matters for W2.** `POST /students` (`student.routes.ts:263`) is a second, complete path to create a student that bypasses Admissions entirely — no PENDING → APPROVED step, straight to a live student. Telling detail: the handler already creates a retroactive `Admission` record afterward, `status: "ENROLLED"`, remarked **"Added directly by admin"** (`:302`) — purely for a paper trail, which is a sign this bypass was already understood to sit outside the intended process. The real reason to close it: **W2's auto-fee-assignment hooks into `/admissions/:id/enroll`.** A student created via this button never touches that endpoint, so they'd silently get no fees set up — some students auto-billed correctly, others not, with nothing distinguishing them until someone notices a student was never charged. Removing this button is what makes Admissions the only door a student can enter through, which is what makes W2 actually hold for every student, not most of them.

- [ ] **W3f. `POST /students/bulk` is the same bypass shape, currently dormant — flagged, not urgent.** Checked: no frontend page calls this route today, so it's not an active bug. But it creates students + accounts directly, same as W3e, with no admission and no enrollment step. Not worth touching now — flagged so that if a bulk CSV-import feature gets built later, it's built by extending the Admissions/Enrollment pipeline to handle batches, rather than by reaching for this existing route and quietly reopening the exact gap W3e closes.

---

### [ ] W4. Grade sheet Excel export
**Where:** `frontend/src/components/ui/GradeSheet.tsx:74` — the only export today is `printGradeSheet(data)` (`lib/printUtils.ts`), a browser print-to-PDF, same mechanism used elsewhere in the app. **Checked both `package.json` files — no spreadsheet library (`xlsx`, `exceljs`, or similar) exists anywhere in the project today.** New dependency needed.

**Requested:** grade sheets should also be downloadable as an Excel (`.xlsx`) file, not just printed.

**Design note, not yet decided in detail:** the grade-sheet data is already fully available as JSON on the page — the same `rows`/`subjects` structure that feeds the print HTML — so this likely doesn't need a new backend route at all. A browser-side spreadsheet library (e.g. SheetJS/`xlsx`) can build the workbook directly from data already on screen and trigger a download via `Blob`, mirroring how `printGradeSheet` already turns that same JSON into a rendered format — just producing a `.xlsx` buffer instead of an HTML string. Worth deciding whether this covers only the term view or also the annual/final grade sheet (`grade-sheet/final`), since both presumably want it.

**Sequencing note:** `GradeSheet.tsx` is the shared component behind both `admin/grade-sheet` and `teacher/grade-sheet` today. Once **W3b** removes the admin copy, this only needs building against the teacher-portal (class-teacher-only) version — worth doing after W3b lands rather than before, so it isn't built twice.

---

# P — Backend performance & cost

### [~] P1. Student photos are base64 blobs in Postgres, returned on every roster fetch  ← ~~*biggest single win*~~

> **P1a done 2026-08-14; P1b–P1d still open.** The roster no longer ships photos, which is the cheap half.
>
> **The "biggest single win" label is not supported by evidence.** Checked the dev database: **0 of 261 students have a photo**, so the tens-of-megabytes roster this describes has never actually occurred there. The storage design is still wrong and P1b–d are still worth doing — base64 in Postgres inflates rows ~33%, bloats backups, and can't be cached or resized — but schedule them as *fixing a design flaw*, not as *making the app faster*. If production turns out to have photos loaded, re-measure and re-prioritise.

**Where:** storage `frontend/src/app/admin/students/page.tsx:167` (`readAsDataURL`) → `backend/src/routes/student.routes.ts:286`; retrieval `backend/src/routes/student.routes.ts:215–222`

Photos are read as base64 data URIs and stored directly in the `students.photo` text column. Base64 inflates by ~33%, so a 500KB photo becomes ~667KB of text per row.

The roster endpoint uses `include:` with **no `select:`**, so it returns every column of every student — photos included:

```
const students = await prisma.student.findMany({
  where,
  orderBy: { rollNo: "asc" },
  include: { section: { include: { grade: { select: { name: true } } } } },
});
```

**A 40-student class with photos is tens of megabytes of JSON on one page load** — uncompressed (no compression middleware, **X2**), over a Nepali mobile connection, on a page with no loading indicator (**F3**). That is seconds of blank screen.

It compounds everywhere: `/students?sectionId=` is called by the admin roster, the teacher roster, mark entry, attendance, and several fee pages.

Cost impact too: DB storage, backup size, and Railway egress all scale with it — for data that belongs in object storage at a fraction of the price.

**The right infrastructure already exists.** `upload.service.ts` does S3 + sharp resize + webp + EXIF stripping for gallery photos. Student photos simply don't use it.

**Fix direction, in order:**
- [x] **P1a.** Add `select:` to the roster query excluding `photo` — one-line change, immediate relief, no migration.

  > **DONE 2026-08-14.** `GET /students` now uses an explicit `select:` that omits `photo`; `GET /students/:id` still returns it. Pinned by a test in `student.test.ts` asserting the list has no `photo` property and the detail route does.
  >
  > **Two frontend consumers had to move**, which the original note missed:
  > - The roster thumbnail (`admin/students/page.tsx`) now always renders the initials avatar that was already the no-photo fallback. Photos still show on the student detail page. Restoring roster thumbnails needs **P1b** (real image URLs), not a payload tweak.
  > - The edit dialog read `photo` off the list row, so with the field gone a save would have **wiped the stored photo**. It now lazy-fetches the single student on edit, and `photo` stays `undefined` until that lands — `PUT /students/:id` parses `.partial()`, so an omitted field leaves the column untouched. Guarded against the **F4** stale-response race with an id check.
- [ ] **P1b.** Route student photos through the existing `upload.service.ts` S3 path; store a URL in `photo` instead of a data URI.
- [ ] **P1c.** Backfill/migrate existing base64 rows to S3, then reclaim the space.
- [ ] **P1d.** Add server-side `.max()` validation on the `photo` field (**S8**).

---

### [x] P2. Add missing database indexes

> **FIXED 2026-08-14.** Seven indexes added via `20260814111740_add_performance_indexes` — purely `CREATE INDEX`, no table rewrites, no code change.
>
> **Verified the diagnosis first.** `EXPLAIN ANALYZE` against the dev database confirmed sequential scans on `marks` (by exam+year), `students` (by section) and `fee_payments` (by year), exactly as described below.
>
> **One correction to the table below:** `daily_attendances` is *not* unindexed for the per-student recompute. Its unique constraint is `(student_id, date, academic_year_id)` and `student_id` leads, so the P4 recompute query and the per-section attendance read both already use it — measured as an Index Scan. What genuinely lacked an index was the *dashboard* query (`analytics.routes.ts:169`, `:256`), which filters year+date across every student with no `studentId`, and so could not use that constraint. The added index targets that instead.
>
> **Demonstrated at scale rather than asserted.** Built the volume this item predicts (5 schools × 3 years = **259,200 marks, 10,800 students**) in the test database and measured with and without the indexes:
>
> | Query | Before | After | |
> |---|---|---|---|
> | Grade sheet — marks by exam+year+students | 15.0 ms (parallel seq scan) | 0.117 ms (index) | **128×** |
> | Roster — students by section | 0.063 ms | 0.013 ms | 4.8× |
> | Annual — marks by year+student | 0.029 ms | 0.011 ms | 2.6× |
>
> At *dev* volumes two of the seven aren't used yet — the planner correctly prefers a seq scan when a query returns 43% of a 4,000-row table, or reads a 261-row table. That's expected; the value is the scaling curve above. The other three were already picked up by live app traffic within minutes of the migration (confirmed via `pg_stat_user_indexes`).
>
> Full suite 160/160; grade sheet, roster and dashboard verified rendering correctly in the running app afterwards.

**Where:** `backend/prisma/schema.prisma` — only 3 `@@index` declarations in 863 lines

PostgreSQL doesn't auto-index foreign keys and Prisma doesn't add them. Of the 42 indexes the migrations create, essentially all come from `@@unique` constraints. Unindexed, heavily-queried columns:

| Column | Used by |
|---|---|
| `marks.exam_type_id`, `marks.academic_year_id`, `marks.subject_id` | every report card, grade sheet, analytics load |
| `students.section_id` | every roster, attendance page, mark-entry page |
| `fee_payments.*` (all FKs), `payment_date`, `receipt_number` | every accountant report |
| `daily_attendances.academic_year_id` | attendance totals recompute |
| `consolidated_results.academic_year_id`, `grade_id` | analytics dashboard |
| `subjects.grade_id`, `sections.grade_id`, `grades.academic_year_id` | nearly everything |

The `marks` unique index is `(student_id, subject_id, exam_type_id, academic_year_id)`. A query filtering `WHERE exam_type_id = ? AND academic_year_id = ?` — what every grade sheet does — **cannot use it**, because `student_id` leads. Postgres sequential-scans the whole table.

At one school / one year (~10,000 marks) that's ~10ms and invisible. This is multi-tenant and multi-year: at 5 schools × 3 years you're at 150,000 rows and every report card scans all of them. Linear, silent degradation.

**Hidden second cost:** every relation is `onDelete: Cascade`. Deleting an academic year or student makes Postgres scan every child table unindexed. Deleting a school would be brutal.

**Fix direction:** additive migration — `marks([examTypeId, academicYearId])`, `marks([academicYearId, studentId])`, `students([sectionId, isActive])`, `feePayments([academicYearId, paymentDate])`, `feePayments([studentId, academicYearId])`, `dailyAttendance([academicYearId, date])`. Zero code change, zero risk.

---

### [~] P3. Bulk report-card generation is O(n²)

> **The quadratic half is fixed (2026-08-14, with R7).** The rank block described below — loading every student and every mark in the section, computing the whole class ranking, and keeping one number from it, once per student — now runs **once per batch**. `buildTermReportData` takes an optional precomputed ranking and `GET /pdf/class/term/...` passes it in.
>
> **Still open:** the per-student `buildTermReportData` + `getObservations` calls are still serial (~10 queries × n), and `school` / `academicYear` / `examType` / `reportCardSettings` are still refetched per student. Those are the remaining ~n×10 round trips. The connection-pool concern below stands until they are batched too.
**Where:** `backend/src/routes/pdf.routes.ts:598` and `:644`

Serial loop, one student at a time; each `buildTermReportData` issues ~8 queries and `getObservations` 2 more. **A 40-student class = ~400 sequential DB round trips for one PDF.**

Worse, the rank block (`:200–231`) loads every student and every mark in the section (with a `subject` join), computes the whole class ranking, and discards all but one student's rank — 40 times, producing an identical ranking each time. Roughly 12,800 mark rows loaded and sorted to extract 40 numbers. `school`, `academicYear`, `examType` and `reportCardSettings` are constant across the batch and refetched per student.

**Worst possible timing:** report cards print in class-sized batches at term end. The one week of real load is the one path that scales quadratically.

**Compounding:** `backend/src/utils/prisma.ts` sets `connection_limit=5&pool_timeout=30`. The reasoning in its comment is sound but invalidated by the query count — one class PDF holds a connection for ~400 sequential queries. Two or three teachers printing at once starves the pool; everyone else gets a 30s timeout surfacing as a generic 500.

**Fix direction:** fetch once, compute in memory. This exact pattern is already done well in `gradeSheet.routes.ts:41` and `report.routes.ts:44`. Compute the ranking once (see **R7**), index by `studentId`. ~400 queries → ~6.

**Verify with:** `reportCard.test.ts` (asserts exact PDF page counts) — the refactor changes only how data is gathered, not the HTML, so these should stay green. Page counts won't catch a changed rank, so spot-check ranks separately.

---

### [ ] P4. Daily attendance totals degrade through the school year
**Where:** `backend/src/routes/dailyAttendance.routes.ts:119–135`

```
for (const student of sectionStudents) {
  const dailyRecords = await prisma.dailyAttendance.findMany({ where: { studentId: student.id, academicYearId } });
  const totalDays = dailyRecords.length;   // counted in JS
  await prisma.attendance.upsert({ ... });
}
```

Two sequential queries per student, each loading **every attendance record that student has for the whole year** just to count them.

In Baisakh: 40 students × ~20 records = 800 rows per save. By Chaitra: 40 × ~220 = **8,800 rows loaded and counted in JavaScript every time a teacher taps Save on one day's attendance**, plus 80 sequential round trips against an unindexed column.

This is the highest-frequency write path in the app — every teacher, every section, every morning — and it gets measurably worse each month. Users report this as *"the app got slow after Dashain"*, which is very hard to diagnose after the fact.

**Fix direction:** single `groupBy` on `dailyAttendance` (by `studentId` + `status`), then batch the upserts. 2 queries instead of 80, constant cost, counting done in Postgres.

- [ ] **P4a.** Move the recompute **inside** the `$transaction` at `:86`. Currently outside — a partial failure leaves attendance saved but totals stale and silently wrong on report cards.
- [ ] **P4b.** Decide intended behaviour for transferred/inactive students — the recompute only covers students currently `isActive` in the section, so a student who leaves keeps whatever totals they had at that moment.

---

### [ ] P5. Admin dashboard is the slowest page, and it's the landing page
**Where:** `backend/src/routes/analytics.routes.ts:46` and `:89`

Two sequential loops over grades, one query each — ~12 grades × 2 = **~24 sequential round trips**, plus a full load of every mark for the latest exam across the school, recomputed on **every** dashboard load with no caching, for numbers that change a few times a term.

First screen an admin sees after login. It sets their perception of whether the whole product is fast.

**Fix direction:** batch per-grade queries into `IN`-clause queries, plus a short in-process cache keyed by `schoolId + academicYearId`. Five minutes would remove nearly all of it. (See also **R8** for the correctness bug in the same handler.)

---

### [ ] P6. Cap Puppeteer concurrency
**Where:** `backend/src/services/pdf.service.ts:108`

`generatePdf` calls `browser.newPage()` with no queue or limit. Each page holds 50–100MB for the duration of a render. Five teachers printing class PDFs at term end = five concurrent Chrome pages plus the base browser on a memory-billed Railway instance → OOM kill, every in-flight request dies, precisely during peak week.

**Fix direction:** semaphore capping concurrent `newPage()` at 2–3, queueing rather than failing. Pairs with **P3** — shorter renders drain the queue faster.

---

# F — Frontend: why taps feel laggy

> Root cause is architectural: **58 of 58 pages are `"use client"`**, all data is fetched in `useEffect` after mount, and there's no caching layer. The items below stack multiplicatively — **P1** is the largest single contributor.

### [x] F1. Every API GET costs two network round trips instead of one

> **FIXED 2026-08-14.** `request()` now sets `Content-Type` only when there is a body, matching what `fetchRaw` already did. That makes every GET a "simple" CORS request, which browsers never preflight. `cors()` also gained `maxAge: 86400` so the preflights that legitimately remain (POST/PUT/DELETE) are cached rather than repeated (browsers clamp this — Chrome 2h, Firefox 24h).
>
> **Verified in the browser, not just reasoned about.** Before: every GET was preceded by an `OPTIONS`. After: zero. Proven against `/academic-years`, a URL never requested before in that session — so no preflight cache could be hiding the result. Writes still work: `PUT /students/:id` returns 200 through the real UI path with `Content-Type` intact.
>
> Checked `api.post`/`api.put` always pass a body, and no call site invokes them without one, so no write silently loses its `Content-Type`.

**Where:** `frontend/src/lib/api.ts:63` and `backend/src/app.ts:58`

`request()` sets `Content-Type: application/json` on **every** request, including GETs that have no body:

```
const headers = { "Content-Type": "application/json", ...options.headers };
```

In production `NEXT_PUBLIC_API_URL` points at a separate API subdomain, so every call is cross-origin. That header plus `credentials: "include"` makes even a plain GET a **non-simple CORS request**, forcing a preflight `OPTIONS` first. `app.ts` sets no `maxAge` on `cors()`, so the preflight cache is the browser default (~5s in Chrome) — effectively no caching in normal use.

Real sequence on `/admin/students`:
```
OPTIONS /academic-years/active  →  GET /academic-years/active
OPTIONS /grades?...             →  GET /grades?...
OPTIONS /students?sectionId=... →  GET /students?sectionId=...
```
Six round trips where three would do — on every page in the app.

**Fix direction:** set `Content-Type` only when there's a body; set a long `maxAge` on the backend `cors()`. `fetchRaw` already omits the header, so this makes GETs behave the way that method already does.

---

### [ ] F2. Mount-time request waterfalls
**Where:** representative case `frontend/src/app/admin/students/page.tsx:32–48`

```
useEffect(() => { const year = await api.get("/academic-years/active");
                  const g    = await api.get(`/grades?academicYearId=${year.id}`); ... }, []);
useEffect(() => { api.get(`/students?sectionId=${selectedSection}`) }, [selectedSection]);
```

Three strictly sequential fetches; the second effect can't start until the first resolves *and* React commits the state update. With **F1** unfixed that's 6 round trips, and the last one carries the photo payload from **P1**.

`Promise.all` is used correctly in places (`admin/fees/page.tsx:45`, `teacher/my-class/page.tsx:337`) but the dependent-fetch pattern dominates — and nearly every waterfall in the app starts with the same `/academic-years/active` call.

**Fix direction:** hoist active-year + grades + sections into a shared provider loaded once per session. Reference data that changes ~twice a year, currently refetched on every page visit.

---

### [x] F3. Five pages render an empty table with no loading indicator

> **FIXED 2026-08-14 — but it was three pages, not five.**
>
> **Correction:** `accountant/fees/page.tsx` and `accountant/admissions/page.tsx` are the one-line re-exports described in **W3** — they render `admin/fees` and `admin/admissions`, both of which already have a proper initial loading state (`admin/fees/page.tsx:55`, `admin/admissions/page.tsx:221`). Nothing to fix there.
>
> **Also worse than described on the two table pages.** They didn't render a blank table while loading — they rendered the *empty-state message*: "No students in this section" and "No subjects for this grade". So a slow load didn't look like loading, it looked like an authoritative answer that the class was empty. Both now show a `Loading...` row that takes priority over the empty state.
>
> `admin/certificates` isn't a table at all — it's a certificate preview that stayed blank until `/school` resolved. It now shows a placeholder in the preview box.
>
> - [x] `frontend/src/app/admin/students/page.tsx`
> - [x] `frontend/src/app/admin/subjects/page.tsx`
> - [x] `frontend/src/app/admin/certificates/page.tsx`
> - [-] `frontend/src/app/accountant/fees/page.tsx` — re-export, already covered
> - [-] `frontend/src/app/accountant/admissions/page.tsx` — re-export, already covered
>
> Verified live by throttling `fetch` and sampling the DOM during the request, so these are confirmed to actually appear rather than just to exist in the source. Note `getSchoolInfo` caches at module level (`printUtils.ts:67`), so the certificates placeholder only appears on a first hard load — confirmed by briefly delaying `GET /school`.

**Where:** these have no loading, spinner, or skeleton state at all:

- `frontend/src/app/admin/students/page.tsx` ← also the heaviest payload (**P1**)
- `frontend/src/app/admin/subjects/page.tsx`
- `frontend/src/app/admin/certificates/page.tsx`
- `frontend/src/app/accountant/fees/page.tsx`
- `frontend/src/app/accountant/admissions/page.tsx`

They mount with empty arrays and render an empty table while fetching. Perceptually this is worse than a slower page that shows a spinner — it reads as *"the tap didn't register"*, exactly the symptom described. The other 47 pages do have a loading state, so this is a consistency gap.

---

### [ ] F4. No stale-response guards — the roster can show the wrong class
**Where:** app-wide. **140 `useEffect`s, zero `AbortController`s, zero request-sequence guards.** The only 6 cleanup returns are for timers and event listeners, none for fetches.

Every data-fetching effect is exposed to the out-of-order response race: select section A, quickly select B, and A's slower response can land *after* B's and overwrite state. The UI then shows section B selected while displaying section A's students.

**Why this is more than cosmetic here:** the affected pages include attendance marking and mark entry. A teacher can be looking at a header that says one class and a roster that is another, and save against it. **P1**'s multi-megabyte payloads make slow, overlapping responses much more likely.

**Three approaches, and I'd reject the first two as the primary plan:**

| Approach | Verdict |
|---|---|
| `AbortController` per effect | Correct, but 140 sites, and missing one leaves the bug intact with no signal. Low leverage. |
| "Latest wins" sequence guard (a hook wrapping a ref counter) | Minimal disruption to existing code shape. Fine as a stopgap. |
| **SWR / React Query** | Keyed by URL, so out-of-order responses can't cross-contaminate **by construction**. Also subsumes **F3** (loading states), **F5** (caching/dedup) and part of **F6**. |

Note `api.ts` **cannot** fix this on its own — the race is about which `setState` wins, not about the fetch. It could grow an optional `signal` parameter to support whichever approach you pick, but it isn't the fix.

**Recommended: two phases.**

- [x] **F4a. Phase 1 — fix only the pages where a stale render can produce a bad *write*.** These six have both a section selector and a POST/PUT. Everywhere else the race produces a confusing screen; here it produces wrong data in the database:
  - [x] `frontend/src/app/teacher/attendance/page.tsx` ← highest risk
  - [x] `frontend/src/app/teacher/observations/page.tsx`
  - [x] `frontend/src/app/teacher/students/page.tsx`
  - [x] `frontend/src/app/admin/students/page.tsx`
  - [x] `frontend/src/app/admin/fees/page.tsx`
  - [x] `frontend/src/app/admin/teacher-assignments/page.tsx`

  > **DONE 2026-08-14** via `hooks/useLatestRequest.ts` — the "latest wins" ticket guard, option 2 in the table above. `apply` runs only if no later call was issued and the component is still mounted; a refetch of the *same* key still applies, which is what makes it safe for the reload-after-save pattern.
  >
  > **Reproduced the bug before fixing it, then re-ran the identical test after.** On `/admin/students`, delaying section A's roster by 3s and switching A→B within 120ms: old code ended with **"Section B" highlighted and Section A's students in the table**; with the guard, section B's students stay put. Same timings, same script, only the guard differs.
  >
  > **One guard per stream of requests, not per page.** The ticket counter is shared across every call from one instance, so pointing it at two unrelated fetches makes one silently cancel the other. `admin/fees`' collection tab is the case worth copying: section-change and month-change hit the *same* endpoint and deliberately share one guard, while the ledger fetch gets its own.
  >
  > **The guard alone wasn't enough on the write pages — the stale-data window had to be closed too.** Between switching section and the new data landing, the *previous* section's roster was still rendered and Save was still live, so one tap wrote the old class's students under the new `sectionId`. Every page in this list now clears its collection on key change, tracks a `loading…` flag, and disables the write control while it is set. Superseded responses deliberately do **not** clear that flag, or a slow loser would un-block the button mid-load.
  >
  > **Two findings while doing the work:**
  > 1. `admin/teacher-assignments` was the sharpest case, and not for UI reasons: the subject dropdown is fetched per grade and the form posts whatever `subjectId` is chosen from it. The server does not check the subject belongs to the section's grade (**S4**), so a stale list was a live route to a cross-grade assignment — which then gates who may enter marks for what. **S4 is the backstop this page needs, the way S2 was for attendance.**
  > 2. `teacher/observations` showed *"No observation categories defined for this grade"* while results were loading — the same false-empty-state that **F3** fixed on two other pages, found because clearing state on key change made it appear on every load. Now gated behind the loading flag.
  >
  > **Verified in the teacher portal too**, logged in as a seeded class teacher (`kiran.thapa@school.edu.np`, class teacher of I-A).
  >
  > - **`teacher/attendance`** — each class teacher owns exactly one section in the seed data, so the race key here is the **date**, not the section; the guard covers both since they share one effect. Old code: while a new date was loading, the *previous* date's roster stayed on screen and the superseded response then overwrote state (roster 10 → 0). With the guard: roster is cleared, Save is disabled during load, and the late response changes nothing.
  > - **`teacher/students`** — during load the table shows a `Loading...` row and **Assign Roll Numbers is disabled**; 10 rows render correctly afterwards.
  > - **`teacher/observations`** — the sharpest demonstration of the whole finding, once categories were seeded (see the note under **X8**). Graded one student A+ under *First Terminal* and saved, so the two exams differ observably. Then delayed First Terminal's fetch and switched to *Final*:
  >
  >   | | old code | with guard |
  >   |---|---|---|
  >   | Highlighted exam | Final | Final |
  >   | First cell shows | **A+ — First Terminal's grade** ❌ | blank (Final's) ✅ |
  >
  >   A Save at that moment posts `examTypeId: Final` carrying First Terminal's grades. This is the bad write F4a exists to prevent, reproduced end to end.
  >
  > One caveat on method: an attempt to tag the superseded *attendance* response with a recognisable fake payload did not render as intended, for a reason not chased down. The attendance comparison rests on the state change actually observed (roster 10 → 0 on old code, unchanged with the guard), not on that marker. The observations comparison above needed no such trick and is the stronger evidence.

- [ ] **F4b. Phase 2** — adopt SWR as the default for new and touched pages, migrate the rest opportunistically.

> **Land S2 first — it's the backstop for this bug.**
> The server currently trusts the client's section context: attendance takes `sectionId` plus a `records[]` array and never checks those students are in that section (**S2**). So when the UI races and a teacher saves against the wrong roster, the backend writes it without complaint. **Fixing S2 turns this race from silent data corruption into a clean 400.** That makes S2 the safety net for a class of frontend bug you can't fully eliminate, so it should land *before* the frontend work, not after.
>
> The same logic is why the mark-entry page is already meaningfully safer than the attendance page: `mark.routes.ts:76` has that check and `dailyAttendance.routes.ts` doesn't.

---

### [ ] F5. No client-side cache
**Where:** app-wide — no React Query / SWR; `useMemo`/`useCallback` appear in exactly **1** file of 58

Every navigation refetches from scratch, with no deduplication and no stale-while-revalidate. Returning to a page you were just on is exactly as slow as the first visit — a large part of why navigation *feels* laggy rather than merely being slow once.

**Fix direction:** SWR or React Query with a long `dedupingInterval` for reference data, or a hand-rolled provider. Pairs with **F2**, and solves **F4** as a side effect.

---

### [x] F6. No `error.tsx` / `loading.tsx` route boundaries

> **FIXED 2026-08-14.** One `error.tsx` + `loading.tsx` per route group as described, both thin wrappers over shared `components/ui/RouteError.tsx` and `RouteLoading.tsx` so the six copies can't drift.
>
> **Three boundaries the original note didn't account for, all needed:**
> - **`app/error.tsx`** — a segment's own `error.tsx` cannot catch an error thrown by its *layout*. Every portal layout calls `useAuth()`, so those failures skip the group boundary entirely and would still have been a white screen. This also covers `/` and `/login`, which are in no route group.
> - **`app/global-error.tsx`** — for the root layout itself. Deliberately inline-styled with no imports: it replaces the whole document, so the app's CSS and providers may not be loaded at that point.
> - **`app/loading.tsx`** — same reasoning, covers `/` and `/login`.
>
> **Verified in the running app, not just typechecked.** A temporary throwing page under `/admin` rendered the boundary *inside* `<main>` with the admin sidebar still on screen (so a crash is now confined to the content area, not the whole app); "Back to Dashboard" recovered to a working `/admin`. `loading.tsx` was confirmed by making that page an async server component with a 4s delay and sampling the DOM every 400ms — `Loading...` for four samples, then the page. Temp page removed afterwards; both typechecks clean.
>
> **The error boundary is the natural hook for X3.** `RouteError` does a `console.error` today, which is the only record a client-side crash leaves. Every route-level crash now passes through that one function — wire the error tracker there.
>
> **Not a substitute for F4/F5.** These catch *thrown* errors. A rejected `fetch` inside a `useEffect` that the page swallows into a toast never reaches a boundary — that's still per-page handling.

**Where:** `frontend/src/app/` — zero of either file exist

Without `error.tsx`, an exception in any client page unmounts to a blank white screen — and with no error tracking (**X3**) you never learn it happened.

**Fix direction:** one of each per route group (`admin/`, `teacher/`, `accountant/`, `parent/`, `student/`, `super-admin/`).

---

### [ ] F7. No double-submit protection on the student form
**Where:** `frontend/src/app/admin/students/page.tsx:181` — the submit button has no `disabled` guard and the page has no `saving` state (zero `disabled={` occurrences in the file)

A double-click creates duplicate students. `rollNo` is nullable and the constraint is `@@unique([rollNo, sectionId])` — Postgres treats NULLs as distinct, so duplicate rows with `rollNo: null` are **not** blocked by the database either.

Other pages do guard this (`admin/fees` and `teacher/attendance` both use `disabled={`), so it's a gap rather than a pattern.

---

### [ ] F8. Code-split the print/export helpers
**Where:** `frontend/src/lib/printUtils.ts` (511 lines) and `feePrintUtils.ts` (297 lines)

Statically imported into 6 pages (`admin/fees`, `admin/seating`, `admin/certificates`, `accountant/`, `teacher/exam-routine`, `student/exam-routine`). Large HTML template-string builders used **only** when the user clicks Print, but they ship in each route chunk and must download and parse before the page mounts. There are currently **zero** dynamic imports in the frontend.

**Fix direction:** `await import()` inside the print handlers.

---

### [ ] F9. Native `alert()` used in 7 places instead of the app's toast system
**Where:** `student/report/page.tsx:148`, `admin/exam-routine/page.tsx:224`, `admin/students/page.tsx:165`, `super-admin/schools/[id]/page.tsx:57,70,135,146`

`react-hot-toast` is set up and used everywhere else. `student/report/page.tsx:148` uses a blocking `alert()` for a PDF failure — a real user-facing path.

---

### [ ] F10. First-load auth gate blocks the whole UI
**Where:** `frontend/src/hooks/useAuth.tsx:36` + each role layout, e.g. `admin/layout.tsx:117`

**Not a contributor to link-tap lag** — `/auth/me` runs once per session, and client-side nav between pages doesn't re-authenticate or remount the sidebar. But every hard load, refresh or deep link blocks the entire UI on one round trip (two, with **F1**) before rendering anything, including the fully static sidebar.

**Fix direction:** low priority. Render the shell immediately, gate only the content area.

---

# X — Robustness, observability, cost

### [x] X1. No `compression` middleware

> **FIXED 2026-08-14.** `app.use(compression())` added ahead of the routes.
>
> **The 70–80% estimate below was conservative** — measured against real dev data, these payloads are far more repetitive than typical JSON (the same nested `section`/`grade` object repeats once per student), so they compress much harder:
>
> | Endpoint | Before | After | Saved |
> |---|---|---|---|
> | `/students` (whole school) | 168,069 B | 9,837 B | **94%** |
> | `/grade-sheet/term` | 15,316 B | 1,522 B | 90% |
> | `/grades` | 8,341 B | 1,183 B | 86% |
> | `/students` (one section) | 6,427 B | 1,089 B | 83% |
>
> The report card path is unaffected: verified `GET /pdf/term/...` still returns an uncompressed, valid `application/pdf` (1 page, correct `%PDF-1.4` header) — `compression`'s default filter skips already-compressed types, and its 1KB threshold skips small responses.
>
> **Method note:** don't try to confirm this from the browser with `response.headers.get("content-encoding")` — `Content-Encoding` is not a CORS-safelisted response header, so JS reads `null` cross-origin whether or not compression is on. Measure with curl.

**Where:** `backend/src/app.ts`

No gzip/brotli. Endpoints like `/students`, `/fees/section-overview` and `/grade-sheet` return large JSON; gzip typically cuts JSON 70–80%, and base64 image data (**P1**) compresses poorly but still meaningfully. One `app.use(compression())` line — and it directly reduces Railway egress cost.

### [x] X2. Health check never touches the database

> **FIXED 2026-08-14.** `/health` now runs `SELECT 1` — the cheapest query that proves the pool can hand out a working connection — and returns 503 `{status:"error", database:"unreachable"}` when it can't, instead of a bare 200.
>
> The driver error is deliberately swallowed rather than echoed: this endpoint is unauthenticated and Prisma's connection errors can contain the connection string. Pinned by a test asserting the response body leaks neither the password nor the DB user.
>
> Pinned by `src/test/__tests__/health.test.ts` (4 tests, including a mocked outage and recovery).
>
> **Worth knowing before wiring this to Railway:** nothing in the repo currently configures a `healthcheckPath`, so this is presently for humans and monitoring. If it does become Railway's probe, note the liveness/readiness distinction — a DB blip will now mark the instance unhealthy, which is right for *readiness* (stop routing traffic) but would cause a restart loop if used for *liveness*. Split into `/health/live` and `/health/ready` if that ever matters.

**Where:** `backend/src/app.ts:115` — returns `{status: "ok"}` unconditionally. If Postgres is down, the check passes and Railway keeps routing traffic to a broken instance.

### [ ] X3. No request logging or error tracking
**Where:** `backend/` — no `morgan`/`pino`, no Sentry equivalent; errors go to `console.error` (`errorHandler.ts:19`) into Railway's log buffer

For a production system: when a school reports "report cards were slow this morning", there's no record of which endpoint, how long, or how often. A 500 hit by a parent at 9pm is invisible. This is how you find the *next* problem without reading code.

### [ ] X4. Unbounded auth caches
**Where:** `backend/src/middleware/auth.ts:27` (`activeCache`) and `:49` (`blocklistCache`)

Plain `Map`s, never pruned. Entries expire *logically* (TTL checked on read) but are never *removed*, so both grow for the process lifetime. Slow leak; on a long-running instance it shows as creeping memory.

**Fix direction:** sweep them in the existing hourly `cleanupExpiredAuthRecords`, or bound with an LRU.

### [x] X7. Enrolling a student reports success even when their login account was never created

> **FIXED 2026-08-14.** `/admissions/:id/enroll` now returns `accountCreated` (and an `accountError` when it failed) alongside the enrollment message, and the message itself becomes *"… enrolled in …, but no login account was created."* The admin UI shows that as a 12-second error toast instead of the 3-second success one, which was easy to miss and read as "all fine".
>
> **The enrollment deliberately still succeeds.** The student record is the important part and rolling it back over a login problem is the worse outcome — the change is to stop reporting *unqualified* success, not to start failing.
>
> **The driver error is not echoed back.** Only an `AppError`'s own message is forwarded; anything else becomes a generic string, because this response reaches the browser and Prisma connection errors can carry the connection string. Same reasoning as **X2**'s health check, and pinned by a test asserting neither the password nor `ECONNREFUSED` appears in the body.
>
> - **X7a resolved as a smaller change than expected.** `student.routes.ts` had *already* fixed the dangerous half: account creation happens inside the student's transaction and real failures propagate (`resolveStudentPassword` distinguishes the deliberate production refusal from a genuine bug). What remained was the deliberate skip reporting nothing, so `POST /students` now returns `accountCreated` too and the admin students page warns the same way.
>
> Pinned by 3 tests in `accountProvisioning.test.ts`, verified to fail 3/3 against the old code. Full suite 164 → **167**.

**Where:** `backend/src/routes/admission.routes.ts:253–271` (`POST /admissions/:id/enroll`)

The account-creation block is wrapped in `try { … } catch (err) { console.error(...) }`, and the handler then returns `"<name> enrolled in <grade> Section <x>"` regardless. So a student can be enrolled, reported as enrolled, appear on every roster — and have no way to log in, with nothing surfaced to the admin who did it.

**This already happened, and the evidence is still in the database.** `DEFAULT_STUDENT_PASSWORD` was never set in production; `getStudentDefaultPassword()` correctly refuses the weak fallback there (predictable emails + one shared password is mass account takeover), that throw was swallowed here, and every student enrolled in that window was saved without an account. **The dev database currently has 80 of 261 students with no linked user.**

The repair tool shipped separately (`prisma/backfill-missing-student-accounts.ts`, merged 2026-08-14 — idempotent, refuses to run without the env var). **The repair is not the fix.** As long as this catch is silent, the same divergence recurs on any failure — an unset variable, a duplicate email, a DB blip — and is only discovered when a parent reports the login doesn't work.

**Fix direction:** don't fail the enrollment (the student record is the important part, and rolling it back over an account problem is worse), but stop reporting unqualified success. Return the account outcome in the response payload and surface it in the admin UI — *"Enrolled. Login account could not be created."* — and consider a flag on the student so the gap is queryable rather than living only in a Railway log line.

- [x] **X7a.** Same swallow-and-report-success shape exists wherever else student accounts are auto-created — check `student.routes.ts`'s direct-create path (**W3e**) before that route is removed, since it shares the pattern.

  > **Checked 2026-08-14 — mostly already sound.** That path creates the login inside the student's transaction and lets real failures propagate, so it never produces the accountless student this item is about. Only the *deliberate* skip was silent; it now reports `accountCreated` like enroll does.

---

### [x] X8. No observation categories in any seed — the observation surface can't be exercised

> **FIXED 2026-08-14.** `seed-all.ts` now creates six categories per grade (Punctuality, Discipline, Cleanliness, Class Participation, Homework, Behaviour, each with `nameNp`), upserted on the existing `@@unique([name, gradeId])` so re-running is safe.
>
> Applied to the dev database without re-running the whole seed: **84 rows across 14 grades** (13 in the main school, 1 in Portal Demo). The observations grid now renders 6 columns × 10 students for I-A.
>
> **Found because F4a couldn't be verified without it.** With zero categories, `teacher/observations` and `admin/observations` render an empty grid for every class, the observation block on report cards is always blank, and there is nothing to review or race-test. This is worth having in place before **W3b**/**W3c** move these screens around.

---

### [ ] X5. Parents can't download report card PDFs
**Where:** `backend/src/routes/pdf.routes.ts:516,548` — `authorize("ADMIN", "TEACHER", "STUDENT")` omits `PARENT`

The JSON API (`report.routes.ts`) correctly allows parents via `verifyStudentAccess`, but the PDF routes exclude them. The parent portal currently has no download button, so nothing is visibly broken — but the capability gap is probably unintended. Confirm and align.

### [ ] X6. Smaller items
- [ ] **Pagination** — only one paginated endpoint in the whole API (`fee.routes.ts:592`). `/students` and `/fees/section-overview` are the ones to watch.
- [ ] **Fee search** — `accountantReport.routes.ts:398` uses `contains` + `mode: insensitive` = `ILIKE '%x%'`, unindexable by design. Fine now; trigram index if it slows.
- [ ] **`CLAUDE.md` wording** — *"D and D+ and below D+ (D, E) are the failing bands"* is self-contradictory. Code is unambiguous (`FAILING_GRADES = ["D","E"]`, D+ passes). Fix the sentence — this is the rule people will read docs for. (See also **R1**, where the docs and code genuinely disagree.)

---

## Suggested order

**Week 1 — cheap, high impact, near-zero risk**

| Item | Effort | Why first |
|---|---|---|
| ~~P1a (`select:` excluding photo)~~ | ✅ **done** | Biggest latency win in the project |
| ~~P2 (indexes)~~ | ✅ **done** | Additive migration, compounds as data grows. Measured 128× on the grade-sheet query at 5-school volume |
| ~~F1 (CORS preflight)~~ | ✅ **done** | Halves request count app-wide — verified zero preflights on GETs |
| ~~X1 + X2 (compression, health)~~ | ✅ **done** | X1 measured 83–94% smaller responses; X2 now fails 503 on a dead DB |
| ~~F3 (loading states)~~ | ✅ **done** | Was 3 pages, not 5 — and they showed a false empty state, not a blank one |
| ~~F6 (error/loading boundaries)~~ | ✅ **done** | No more white screens. Needed 3 more boundaries than the item described — layout errors skip the group boundary |

**Week 2 — correctness (decide, then fix together)**

| Item | Effort | Why |
|---|---|---|
| ~~R1 (absent-in-average policy)~~ | ✅ **done** | Decided as count-as-zero; R2, R4, R5 fell out with it |
| ~~R7 (single rank function)~~ | ✅ **done** | Was three copies, not two. Resolved R3's remainder + R6, and did the quadratic half of P3 |
| ~~R4 (grade sheet totals)~~ | ✅ **done** | Resolved by R1 |
| ~~**S1, S2, S3**~~ (unverified student IDs) | ✅ **done** | All three closed (S1 with S1a). **F4a is now unblocked** — S2's membership check is in place as its backstop. |

**Week 3+ — structural**

| Item | Effort | Notes |
|---|---|---|
| ~~F4a (race guards on the 6 write pages)~~ | ✅ **done** | `useLatestRequest` guard + closing the stale-data window on each write control |
| P4 (attendance `groupBy`) + P4a | ~half day | |
| P3 (bulk PDF batching) | 1–2 days | Depends on R7 |
| P6 (Puppeteer cap) | ~2 hrs | |
| P5 (analytics cache) + R8 | ~half day | Same handler, do together |
| S4 + S4a + S4b (grade-consistency invariant) | ~half day | S4b test is worth more than the patches |
| S6a–S6e (public routes) | ~half day | S6b needs a `code` migration |
| X3 (logging + error tracking) | ~half day | |
| ~~X7 (enroll reports success on account failure)~~ | ✅ **done** | Repair shipped in #15; the silent failure behind it is now closed too |
| P1b–P1d (photos → S3) + S8 | 1–2 days | |
| F2 + F5 + F4b (SWR migration) | 1–2 days | Subsumes F3, F4b, F5, part of F6 |
| S5, F7–F10, X4, X5, X6 | as capacity allows | |
| **W1** (results-publish workflow) | 3–5 days | Design agreed, not scoped in detail. New feature, not a fix — plan separately from the bug-fix items above |
| **W2** (enrollment → fee setup) | half day – 1 day | Decided: fully automatic, confirmed compatible with overrides. Ready to scope. |
| **W3a + W3d** (remove duplicate admin fees + admissions pages) | ~1 hr | Both are one-line re-exports — just delete two nav links |
| **W3e** (remove "+ Add Student" bypass) | ~1 hr | Do alongside W2 — this is what makes W2 hold for every student |
| **W3b** (grade-sheet/observations → class teacher only) | ~1 day | Also resolves **S7** for these two routes specifically |
| **W3c** (standalone category-setup screen) | ~half day | Small admin-only screen, split out before W3b removes the page it currently lives in |
| **W3f** (flag `/students/bulk`) | 0 — already flagged | Nothing to schedule; note stands until a bulk-import feature is proposed |
| **W4** (grade sheet Excel export) | ~1 day | Do after **W3b** — build once, against the teacher-only version |

**Dependency notes**
- ~~**S2 → F4a.**~~ S2 ✅ **done 2026-08-14** — the backstop is in place, so F4a can proceed whenever.
- **R7 → P3.** Extracting one rank function is what makes the bulk PDF batching tractable.
- **R1 → R2, R3, R4, R5.** Decide the absent-in-average policy once; the other three follow from it.
- **P5 + R8** are the same handler — one visit.
- **F5 → F3, F4b, F6.** Adopting a fetching library resolves several frontend items at once, which is why the standalone fixes for those are scoped to "cheap now, migrate later."
- **W3e → W2.** Closing the "+Add Student" bypass is what guarantees W2's auto-fee-assignment actually fires for every student — do them together, W3e first or same PR.
- **W3b → W4.** Build the Excel export once, against the teacher-only grade-sheet page W3b leaves behind, not against the admin copy that's about to be deleted.

---

## If you only do three things

All three original picks are done: ~~P1a~~, ~~R1~~, ~~S1~~ — ✅ **2026-08-14**. So are ~~**F6**~~ (closing Week 1) and ~~**F4a**~~.

**The next three, in order:**

1. **R7 → P3** — extract one `computeSectionRanks()`. It resolves R3's remainder and R6, and is what makes the bulk-PDF batching in P3 tractable. P3 is the one that bites at term end, when whole classes are printed at once.
2. **P4 (+P4a)** — the attendance `groupBy`. Highest-frequency write path in the app and it gets measurably worse every month of the school year.
3. **S4 (+S4a, S4b)** — promoted from Week 3+. F4a made the case concrete: `admin/teacher-assignments` posts a `subjectId` the server never checks against the section's grade, and that assignment is what gates mark entry. S4b's table-driven test is still the highest-value piece.

**Then:** P4 (+P4a), P5+R8 together, P6, S4–S8, X3, and the F2/F5 caching migration that subsumes F3/F4b/part of F6.

**Not started at all:** the **W** items (W1–W4) — these are new features, not fixes, and want their own planning pass rather than being picked off this list.

---

## What "done" means here

Every item marked ✅ above was: implemented, typechecked in both projects, covered by a test where the behaviour was testable, **verified against the old code to confirm the test actually fails without the fix**, exercised in the running app where it was user-visible, merged, and deployed. Test count went 144 → **164** over this pass.

Where a finding turned out to be wrong or overstated, the correction is recorded inline under that item rather than quietly fixed — see the four listed at the top.
