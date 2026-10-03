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
| Ran the app | initially **not done** (no iOS Simulator / Android emulator); after the fixes it was run as a web build in a browser — see Status |
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

## Status — fixes applied in this PR

| Finding | Status | How |
| --- | --- | --- |
| H1 exam switch leaks marks | fixed | form rebuilt from scratch per class + exam (`utils/marksForm.ts`, unit-tested) |
| H2 failed load then Save overwrites marks | fixed (app **and web**) | Save only enabled once marks loaded; visible error + Retry; stale responses ignored |
| H3 optional-subject roster | fixed | `/students?...&subjectId=` like the web |
| H4 network error logs the teacher out | fixed | app signs out only on a 401/403 from `/auth/refresh`; opens offline from a cached user; backend keeps a rotated refresh token usable for 30 s (`rotated_at` migration, tested) |
| M1 Notices quick action | fixed | Notices is now a stack screen for teachers |
| M2 attendance locked to today | fixed | previous/next day, no future days, follows midnight, confirm before discarding edits |
| M3 silent load errors | fixed | shared `ErrorState` with Retry on every teacher screen, Notices, and the accountant dashboard (which no longer shows "Rs 0" when the cashbook failed) |
| M4 type errors | fixed | `Colors.error` -> `Colors.danger`; `tsc` is clean |
| M5 tokens in AsyncStorage | fixed | `expo-secure-store`, with one-time migration from the old location |
| Temporary assignments not shown | fixed | "(Temporary)" label + expiry on Mark Entry |
| Device-timezone "today" | fixed | BS "today" computed in Asia/Kathmandu (app only; the web still uses the browser clock) |
| 200-record attendance cap | fixed | backend limit raised to 500 |
| Expo packages a patch behind | fixed | `expo-doctor` 18/18 |
| No tests | partly | 12 unit tests for the mark form, refresh classification and BS date stepping (`npm test`, Node >= 22.18); backend refresh tests added |

### Still open
- **Still not run on a real device or simulator** (none available). After the fixes the app *was* run as a
  web build in a browser against the dev backend with dummy data, and these were verified working:
  sign-in; the dashboard's Notices action (opens a Notices screen); Mark Entry showing a different, correct
  form for each exam (switching to Final, which has marks for only 4 students, shows blanks for everyone
  else and nothing from Second Terminal); with the API stopped, Mark Entry shows "Can't reach the server",
  hides Save, and Retry recovers once the API is back; reloading with the API stopped keeps the teacher signed
  in (cached user) with a dashboard error and Retry; Attendance previous/next day, "Today" tag, next disabled
  on today. **Not exercised:** saving marks/attendance, the unsaved-changes prompt (RN's `Alert` is a no-op on
  web), refresh-token rotation inside the app, secure storage (web falls back to localStorage), keyboard and
  touch behaviour, and anything on iOS/Android. Do a manual pass on a phone before release.
- `eas.json`: the preview profile still points at a LAN address and `extra.eas.projectId` is empty. Both need
  values only the project owner has (Expo account, real API URL).
- Offline mark entry and push notifications are features, not fixes, and are not done. Every screen the web teacher portal has now exists on the phone.
- Web `getTodayBS()` still uses the browser's clock.

## Suggested order

1. H1–H4 and M1 (all small; H1/H3 are a few lines each) — makes the existing four screens safe.
2. M2–M5, `Colors.error`, EAS config — makes it buildable and honest about errors.
3. Run it (iOS Simulator or a device) before trusting any of the above end to end.
4. New features, in this order: Results (mark complete), missing-marks list for class
   teachers, offline drafts for marks, notices, report cards via the share sheet, push.

- **Results screen (class teachers):** added — completeness per subject, Mark complete / Re-open (admin publishes on the web). Verified as a web build against the dev backend: loads, shows missing marks, Mark complete and Re-open round-trip (DB back to DRAFT). Not exercised on a phone.
- **My Students screen (class teachers):** added, read-only — roster in roll order, search, tap for details, tap-to-call guardian. Editing students and assigning roll numbers stay on the web. Verified as a web build against the dev backend (roster, search, expand); tap-to-call not exercised (needs a phone).
- **Exam Routine screen (teachers):** added, read-only — every grade the teacher teaches, per exam, date/day/time, past exams dimmed. Verified as a web build against the dev backend (two exams switched; all dummy dates are in 2082 so everything showed as past).
- **Observations screen (class teachers):** added — one category at a time, big grade buttons, "fill all empty with…", only changed cells are sent, read-back after Save. Verified as a web build against the dev backend (graded two students, saved, DB checked; the dummy rows were left). Like the web, a saved grade can be changed but not cleared. The discard-changes prompt (RN `Alert`) is not exercised on web. Not run on a phone.
- **Report Cards screen (class teachers):** added — the server-made PDF (per student, or the whole class in one) in colour or B&W. **Android:** the app asks the server for a short-lived (90 s) download link and opens it in the phone's browser, which saves the PDF straight into Downloads like any browser download (an app can't write to Downloads itself without a native build, and Android 11+ refuses the top-level Downloads folder in the folder picker — that was tried first and dropped). The link is signed with a key derived from but different to the login key, names exactly one report card PDF, and runs through the normal PDF route as the requesting user when opened, so school scope / teacher ownership / publish gate still apply (22 backend tests). **iPhone:** iOS apps cannot write to Downloads, so the PDF is fetched with the app's login and the share sheet opens (Save to Files). Verified: as a web build against the dev backend (per-student PDF, whole-class B&W) and, for the link, with curl against the dev backend (link → 200 attachment PDF with no login header; link refused as a login token). **Not run on a phone** — the Android browser hand-off and the iPhone share sheet are untested. If the API is plain http (the LAN dev address) Chrome may show an insecure-download warning; production is https. A link can be reused for its 90 seconds (browsers retry downloads), which is why it is short.
- **Accountant Reports (phone):** added Daily Cash Book (date stepper, by method / category, receipts expand to their lines), Fee Defaulters (month and class filters, search, biggest balance first, tap-to-call guardian), Payment History (search by receipt/student, receipts grouped, load more) and Monthly Summary (collected vs expected per month, by category). Money is shown in Nepali lakh grouping (Rs 1,23,456). Verified as a web build against the dev backend as the dummy accountant (a temporary payment I added for the populated cash book was deleted). **Deliberately not on the phone:** printing the cash book, the Fee Discount report and the Student Count report (admin/government paperwork — web only). Tap-to-call not exercised (needs a phone).
