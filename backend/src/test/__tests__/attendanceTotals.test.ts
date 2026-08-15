/**
 * Attendance totals — recompute correctness and cost (P4, P4a)
 *
 * Saving a day's attendance also rewrites each student's year-to-date totals,
 * the numbers that print on report cards. That recompute used to run two
 * queries per student, each loading every daily row that student had for the
 * whole year and counting them in JavaScript — a cost that grew every month of
 * the school year on the app's highest-frequency write path.
 *
 * These tests pin both halves of the fix: the totals are still right (including
 * the cases a set-based rewrite could plausibly get wrong — re-marking a day,
 * students with nothing marked, other sections' rows), and the cost no longer
 * scales with the class. The cost test compares two class sizes rather than
 * asserting a single number, because a per-student query that only fires
 * sometimes still looks flat at one size — that is exactly how the first pass
 * at the equivalent fix for bulk report cards (P3) slipped through.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  createTestSchool,
  createTestUser,
  createTestAcademicYear,
  createTestGrade,
  createTestSection,
  createTestStudent,
  loginAs,
  authHeader,
} from "../helpers";

let adminToken: string;
let yearId: string;
let smallSectionId: string; // 10 students
let largeSectionId: string; // 40 students
let otherSectionId: string; // 3 students, never touched by the saves below
let smallStudentIds: string[] = [];
let largeStudentIds: string[] = [];
let otherStudentIds: string[] = [];

async function fillSection(sectionId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    ids.push((await createTestStudent(sectionId, { name: `Student ${i}`, rollNo: i })).id);
  }
  return ids;
}

const save = (body: Record<string, unknown>) =>
  request(app).post("/daily-attendance/bulk").set("Authorization", authHeader(adminToken)).send(body);

/** Everyone present, unless a studentId is listed in `absent`. */
const roster = (ids: string[], absent: string[] = []) =>
  ids.map((studentId) => ({
    studentId,
    status: absent.includes(studentId) ? "ABSENT" : "PRESENT",
  }));

const totalsFor = (studentId: string) =>
  prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: yearId } },
  });

// Prisma's client exposes $on but no $off, so subscribing per capture would
// leak a listener each time and eventually trip Node's max-listeners warning.
// One listener is installed for the file instead, writing into whichever
// buffer is open.
let capturing: string[] | null = null;

/** Collects every SQL statement Prisma issues while `run` is in flight. */
async function captureQueries(run: () => Promise<unknown>): Promise<string[]> {
  const seen: string[] = [];
  capturing = seen;
  try {
    await run();
    // Query events arrive from the engine independently of the promise that
    // resolves the request, so give the last few a tick to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    capturing = null;
  }
  return seen;
}

beforeAll(async () => {
  // The client is configured with `emit: "event"` for queries under NODE_ENV=test.
  (prisma as unknown as { $on: (e: "query", cb: (ev: { query: string }) => void) => void }).$on(
    "query",
    (ev) => capturing?.push(ev.query)
  );

  await cleanDatabase();

  const school = await createTestSchool({ name: "Attendance School", code: "ATT" });
  const year = await createTestAcademicYear(school.id, { yearBS: "2081" });
  yearId = year.id;

  const grade = await createTestGrade(year.id, { name: "Grade I", displayOrder: 1 });
  smallSectionId = (await createTestSection(grade.id, { name: "A" })).id;
  largeSectionId = (await createTestSection(grade.id, { name: "B" })).id;
  otherSectionId = (await createTestSection(grade.id, { name: "C" })).id;

  smallStudentIds = await fillSection(smallSectionId, 10);
  largeStudentIds = await fillSection(largeSectionId, 40);
  otherStudentIds = await fillSection(otherSectionId, 3);

  await createTestUser(school.id, "ADMIN", { email: "admin@attendance.test", password: "Test@123" });
  adminToken = (await loginAs("admin@attendance.test")).token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("POST /daily-attendance/bulk — totals recompute", () => {
  it("counts present and absent days across several days", async () => {
    const [first, second] = smallStudentIds;

    await save({
      sectionId: smallSectionId,
      date: "2081/01/01",
      academicYearId: yearId,
      records: roster(smallStudentIds, [first]),
    }).expect(200);

    await save({
      sectionId: smallSectionId,
      date: "2081/01/02",
      academicYearId: yearId,
      records: roster(smallStudentIds, [first, second]),
    }).expect(200);

    expect(await totalsFor(first)).toMatchObject({ totalDays: 2, presentDays: 0, absentDays: 2 });
    expect(await totalsFor(second)).toMatchObject({ totalDays: 2, presentDays: 1, absentDays: 1 });
    expect(await totalsFor(smallStudentIds[2])).toMatchObject({
      totalDays: 2,
      presentDays: 2,
      absentDays: 0,
    });
  });

  it("re-marking a day corrects the totals instead of double-counting it", async () => {
    const [first] = smallStudentIds;

    // 2081/01/01 was saved above with this student absent. Correct it.
    await save({
      sectionId: smallSectionId,
      date: "2081/01/01",
      academicYearId: yearId,
      records: roster(smallStudentIds),
    }).expect(200);

    expect(await totalsFor(first)).toMatchObject({ totalDays: 2, presentDays: 1, absentDays: 1 });

    const dailyRows = await prisma.dailyAttendance.count({
      where: { studentId: first, academicYearId: yearId },
    });
    expect(dailyRows).toBe(2);
  });

  it("gives an active student with nothing marked a zeroed totals row", async () => {
    const newcomer = await createTestStudent(smallSectionId, { name: "Newcomer", rollNo: 99 });

    // Save a day that deliberately leaves the newcomer out of records[].
    await save({
      sectionId: smallSectionId,
      date: "2081/01/03",
      academicYearId: yearId,
      records: roster(smallStudentIds),
    }).expect(200);

    expect(await totalsFor(newcomer.id)).toMatchObject({
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
    });
  });

  it("leaves other sections' totals alone", async () => {
    for (const id of otherStudentIds) {
      expect(await totalsFor(id)).toBeNull();
    }
  });

  it("writes the day and its totals in one transaction", async () => {
    const queries = await captureQueries(() =>
      save({
        sectionId: smallSectionId,
        date: "2081/01/04",
        academicYearId: yearId,
        records: roster(smallStudentIds),
      }).expect(200)
    );

    const begin = queries.findIndex((q) => q === "BEGIN");
    const commit = queries.findIndex((q) => q === "COMMIT");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);

    const inside = queries.slice(begin, commit);
    // Both writes must be on the same side of that boundary: a totals rewrite
    // outside it can fail on its own and leave the day saved with stale totals
    // that then print on a report card.
    expect(inside.filter((q) => q.includes("INSERT INTO daily_attendances"))).toHaveLength(1);
    expect(inside.filter((q) => q.includes("INSERT INTO attendances"))).toHaveLength(1);
  });

  it("costs the same for a class of 40 as for a class of 10", async () => {
    const small = await captureQueries(() =>
      save({
        sectionId: smallSectionId,
        date: "2081/01/05",
        academicYearId: yearId,
        records: roster(smallStudentIds),
      }).expect(200)
    );

    const large = await captureQueries(() =>
      save({
        sectionId: largeSectionId,
        date: "2081/01/05",
        academicYearId: yearId,
        records: roster(largeStudentIds),
      }).expect(200)
    );

    expect(large.length).toBe(small.length);
  });

  it("never reads daily rows back into the process to count them", async () => {
    // This is the half a query count cannot see. The old recompute issued a
    // fixed two queries per student, so counting alone stays flat as the year
    // goes on — but one of those two loaded every daily row that student had
    // for the whole year and counted them in JavaScript. By Chaitra that is
    // ~8,800 rows over the wire on every save, which is what "the app got slow
    // after Dashain" actually was. Counting now happens in Postgres, so no
    // SELECT against daily_attendances should appear at all.
    const queries = await captureQueries(() =>
      save({
        sectionId: largeSectionId,
        date: "2081/01/06",
        academicYearId: yearId,
        records: roster(largeStudentIds),
      }).expect(200)
    );

    const reads = queries.filter(
      (q) => q.startsWith("SELECT") && q.includes("daily_attendances")
    );
    expect(reads).toEqual([]);
  });

  it("keeps the totals right after a month of history, at unchanged cost", async () => {
    const before = await captureQueries(() =>
      save({
        sectionId: largeSectionId,
        date: "2081/02/01",
        academicYearId: yearId,
        records: roster(largeStudentIds),
      }).expect(200)
    );

    for (let day = 2; day <= 22; day++) {
      await save({
        sectionId: largeSectionId,
        date: `2081/02/${String(day).padStart(2, "0")}`,
        academicYearId: yearId,
        records: roster(largeStudentIds, day % 3 === 0 ? [largeStudentIds[0]] : []),
      }).expect(200);
    }

    const after = await captureQueries(() =>
      save({
        sectionId: largeSectionId,
        date: "2081/02/23",
        academicYearId: yearId,
        records: roster(largeStudentIds),
      }).expect(200)
    );

    expect(after.length).toBe(before.length);

    // And the totals are still right after all that history.
    const totals = await totalsFor(largeStudentIds[0]);
    const dailyRows = await prisma.dailyAttendance.count({
      where: { studentId: largeStudentIds[0], academicYearId: yearId },
    });
    expect(totals?.totalDays).toBe(dailyRows);
    expect((totals?.presentDays ?? 0) + (totals?.absentDays ?? 0)).toBe(dailyRows);
  });

  it("takes the last entry when a student appears twice in one batch", async () => {
    const [first] = smallStudentIds;

    await save({
      sectionId: smallSectionId,
      date: "2081/03/01",
      academicYearId: yearId,
      records: [
        { studentId: first, status: "PRESENT" },
        { studentId: first, status: "ABSENT", remarks: "left early" },
      ],
    }).expect(200);

    const row = await prisma.dailyAttendance.findFirstOrThrow({
      where: { studentId: first, date: "2081/03/01" },
    });
    expect(row.status).toBe("ABSENT");
    expect(row.remarks).toBe("left early");
  });
});
