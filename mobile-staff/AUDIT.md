# mobile-staff audit

Audited 2026-10-03 against `main` (a6ce2cc+). Scope: the Expo app in `mobile-staff/`
(teacher + accountant), compared with the web portal and the backend as they are today.

## How it was checked

| Check | Result |
| --- | --- |
| Read every teacher screen, the API client, auth, navigation | done |
| Replayed the app's teacher calls against the running backend with Bearer tokens (login, `/auth/me`, `/teacher-assignments/my`, `/exam-types`, `/students`, `/marks`, `/daily-attendance`, `/homework`, `/notices`, `/auth/refresh`) | response shapes match the app's interfaces |
| Replayed the accountant's read calls | 200s, shapes not compared field-by-field |
| `npm ci` + `tsc --noEmit` | **fails: 3 errors** (finding M4) |
| `expo-doctor` | 3 packages a patch behind (expo, expo-constants, expo-font) |
| Ran the app | **not done** — no iOS Simulator (no `simctl`) and no Android emulator on this machine, so no screen has been seen running |
| Write paths (`/marks/bulk`, `/daily-attendance/bulk`, fee payments) | payloads compared with the backend zod schemas by reading; **not executed** |

The API contract is healthy: every endpoint the app calls exists, with a compatible role guard.
The problems are in the app's logic, not in a drifted API.

## High — can lose or corrupt data, or lock people out

**H1. Switching exam copies the previous exam's marks into the new one.**
`MarksScreen.tsx:82` merges the fetched marks into the *previous* form state
(`setMarks(prev => …)`), overwriting only students who already have a mark for the new exam.
Everyone else keeps the old exam's numbers on screen, and Save posts them against the new
exam. The web page rebuilds the whole map from each fetch, so it does not have this bug.
*Fix:* rebuild the map from scratch (empty for students with no mark), like the web.

**H2. A failed marks load looks like "nothing entered", and Save then overwrites real marks with nulls.**
`MarksScreen.tsx:68` and `:96` swallow the error. The form stays empty, and `handleSave`
posts every student with `theoryMarks: null`. The web page has the same swallow
(`frontend/src/app/teacher/marks/page.tsx`), so fix both.
*Fix:* on load failure show an error and block Save until a load has succeeded; only send
changed rows.

**H3. Optional subjects: the student list is not filtered, so the whole save is rejected.**
`MarksScreen.tsx:46` calls `/students?sectionId=` only. The web adds `&subjectId=` so an
elective lists only enrolled students. `/marks/bulk` rejects the entire request with
"students are not enrolled in this optional subject" if any listed student is not enrolled.
*Fix:* pass `subjectId` (one-line change).

**H4. Flaky network logs the teacher out.**
`client.ts:40` — `tryRefresh` returns `null` on *any* error, including no connectivity, and the
interceptor then clears all stored tokens (`client.ts:70`). Separately, refresh tokens rotate
and the old one is rejected immediately (verified: reusing it returns 401). If the server
rotates but the response is lost on a weak connection, the phone keeps the dead token and the
next refresh fails permanently.
*Fix:* app — only clear tokens on a 401/403 from `/auth/refresh`, never on a network error.
Backend — accept a just-rotated token for a short grace window.

## Medium

- **M1. Dashboard "Notices" quick action goes nowhere.** `DashboardScreen.tsx:37` navigates to
  `Notices`, but `TeacherTabs` has no such screen (only the accountant tabs do).
- **M2. Attendance can only be taken for "today".** `AttendanceScreen.tsx:18`
  `const [date] = useState(getTodayBS())` — no setter, so no backfilling a missed day, and the
  date is frozen at mount (stale after midnight if the app stays open). The web has prev/next.
- **M3. Load errors are invisible.** Most screens `console.error` and render an empty state;
  the accountant dashboard uses `.catch(() => null)`. A teacher on a bad connection sees blank
  screens with no message or retry.
- **M4. Type errors.** `Colors.error` does not exist in `src/theme` (`FeeCollectionScreen.tsx`
  lines 83, 451, 633), so those styles get an undefined colour.
- **M5. Tokens are stored in plain `AsyncStorage`.** Use `expo-secure-store` for the access and
  refresh tokens.

## Low / housekeeping

- `eas.json` preview profile hard-codes a LAN address (`192.168.1.65`); `extra.eas.projectId`
  is empty; the production API URL (`api.school.zentaralabs.com`) is unverified. Evidence
  suggests the app has never been built with EAS or published.
- Temporary assignments (`isTemporary`, `expiresAt` from `/teacher-assignments/my`) are not
  shown or handled.
- "Today" comes from the device clock via `nepali-date-converter`, same as the web, so a phone
  set to another timezone shows the wrong BS date near midnight.
- No tests. No offline support. No push notifications.
- Attendance bulk accepts at most 200 records per request (a section above 200 would fail).
- Expo packages are one patch behind (`npx expo install --check`).

## Coverage compared with the web teacher portal

| Web page | In the app? | Backend ready? |
| --- | --- | --- |
| Dashboard, Attendance, Marks entry, Homework | yes | yes |
| Notices | accountant only | yes (`/notices`) |
| Results (mark entry complete / reopen) | **no** | yes (`/result-status/ready`, `/reopen`) |
| Grade sheet | no | yes (`/grade-sheet/term`, `/final`) |
| My Class report cards / PDFs | no | yes (`/pdf/*`; share/print sheet needed on device) |
| My Students (roll numbers, edit) | no | yes |
| Observations | no | yes (`/observations/results/bulk`) |
| Exam routine | no | yes (`/exam-routine`) |

## Suggested order

1. H1–H4 and M1 (all small; H1/H3 are a few lines each) — makes the existing four screens safe.
2. M2–M5, `Colors.error`, EAS config — makes it buildable and honest about errors.
3. Run it (iOS Simulator or a device) before trusting any of the above end to end.
4. New features, in this order: Results (mark complete), missing-marks list for class
   teachers, offline drafts for marks, notices, report cards via the share sheet, push.
