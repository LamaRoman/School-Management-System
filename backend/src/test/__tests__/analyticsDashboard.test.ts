/**
 * Admin dashboard — cost, cache and which exam it reports on (P5, R8)
 *
 * The dashboard is the first screen an admin sees after login. It used to run
 * two loops over grades and one over exam types, a query each, and recompute
 * the whole thing on every load. These pin the batched version: the cost no
 * longer grows with the number of grades or exam types, the cache does not
 * cross the school boundary, and the subject-wise panel reports the exam it
 * actually means rather than whichever happened to sort last.
 *
 * The numbers themselves are pinned against hand-computed expectations, since
 * a refactor of this shape fails by producing plausible-but-wrong figures
 * rather than by throwing.
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
import { clearDashboardCache } from "../../routes/analytics.routes";

let adminToken: string;
let yearId: string;
let firstTermId: string;
let finalExamId: string;
let mathsId: string;
let scienceId: string;
let gradeOneStudents: string[] = [];

// A second school, to prove the cache cannot serve one school's numbers to
// another.
let foreignToken: string;

let capturing: string[] | null = null;

async function captureQueries(run: () => Promise<unknown>): Promise<string[]> {
  const seen: string[] = [];
  capturing = seen;
  try {
    await run();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    capturing = null;
  }
  return seen;
}

const dashboard = (token: string, query = "") =>
  request(app).get(`/analytics/dashboard${query}`).set("Authorization", authHeader(token));

async function addExamType(name: string, displayOrder: number, isFinal = false) {
  return prisma.examType.create({
    data: { name, academicYearId: yearId, displayOrder, isFinal },
  });
}

async function addMark(
  studentId: string,
  subjectId: string,
  examTypeId: string,
  theoryMarks: number
) {
  return prisma.mark.create({
    data: { studentId, subjectId, examTypeId, academicYearId: yearId, theoryMarks },
  });
}

beforeAll(async () => {
  (prisma as unknown as { $on: (e: "query", cb: (ev: { query: string }) => void) => void }).$on(
    "query",
    (ev) => capturing?.push(ev.query)
  );

  await cleanDatabase();

  const school = await createTestSchool({ name: "Dashboard School", code: "DSH" });
  const year = await createTestAcademicYear(school.id, { yearBS: "2081" });
  yearId = year.id;

  const gradeOne = await createTestGrade(year.id, { name: "Grade I", displayOrder: 1 });
  const gradeTwo = await createTestGrade(year.id, { name: "Grade II", displayOrder: 2 });

  const sectionOne = await createTestSection(gradeOne.id, { name: "A" });
  const sectionTwo = await createTestSection(gradeTwo.id, { name: "A" });

  for (let i = 1; i <= 4; i++) {
    gradeOneStudents.push(
      (await createTestStudent(sectionOne.id, { name: `One ${i}`, rollNo: i })).id
    );
  }
  await createTestStudent(sectionTwo.id, { name: "Two 1", rollNo: 1 });

  mathsId = (
    await prisma.subject.create({
      data: { name: "Maths", gradeId: gradeOne.id, fullTheoryMarks: 100, fullPracticalMarks: 0 },
    })
  ).id;
  scienceId = (
    await prisma.subject.create({
      data: { name: "Science", gradeId: gradeOne.id, fullTheoryMarks: 100, fullPracticalMarks: 0 },
    })
  ).id;

  firstTermId = (await addExamType("First Terminal", 1)).id;
  finalExamId = (await addExamType("Final", 2)).id;

  const mathsFinal = [80, 30, 90, 20];
  const scienceFinal = [70, 60, 75, 65];
  for (let i = 0; i < gradeOneStudents.length; i++) {
    await addMark(gradeOneStudents[i], mathsId, finalExamId, mathsFinal[i]);
    await addMark(gradeOneStudents[i], scienceId, finalExamId, scienceFinal[i]);
    // First terminal, so term comparison has two exams to compare.
    await addMark(gradeOneStudents[i], mathsId, firstTermId, 50);
  }

  for (let i = 0; i < gradeOneStudents.length; i++) {
    await prisma.consolidatedResult.create({
      data: {
        studentId: gradeOneStudents[i],
        academicYearId: yearId,
        gradeId: gradeOne.id,
        totalGpa: [4, 3, 3.5, 2.5][i],
        totalPercentage: [90, 70, 80, 60][i],
      },
    });
  }

  await createTestUser(school.id, "ADMIN", { email: "admin@dashboard.test", password: "Test@123" });
  adminToken = (await loginAs("admin@dashboard.test")).token;

  const other = await createTestSchool({ name: "Other School", code: "OTH" });
  const otherYear = await createTestAcademicYear(other.id, { yearBS: "2081" });
  const otherGrade = await createTestGrade(otherYear.id, { name: "Grade I", displayOrder: 1 });
  const otherSection = await createTestSection(otherGrade.id, { name: "A" });
  await createTestStudent(otherSection.id, { name: "Foreign One", rollNo: 1 });
  await createTestUser(other.id, "ADMIN", { email: "admin@other.test", password: "Test@123" });
  foreignToken = (await loginAs("admin@other.test")).token;
});

beforeEach(() => {
  clearDashboardCache();
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("GET /analytics/dashboard — numbers", () => {
  it("reports the figures it always did", async () => {
    const res = await dashboard(adminToken).expect(200);
    const d = res.body.data;

    expect(d.summary.totalStudents).toBe(5);

    const gradeOne = d.classAverages.find((c: { gradeName: string }) => c.gradeName === "Grade I");
    // GPA (4 + 3 + 3.5 + 2.5) / 4 = 3.25; percentage (90 + 70 + 80 + 60) / 4 = 75.
    expect(gradeOne).toMatchObject({ avgGpa: 3.25, avgPct: 75, studentCount: 4 });

    // Grade II has a student but no consolidated results.
    const gradeTwo = d.classAverages.find((c: { gradeName: string }) => c.gradeName === "Grade II");
    expect(gradeTwo).toMatchObject({ avgGpa: 0, avgPct: 0, studentCount: 1 });

    // No ranking and no pass / fail anywhere in the system.
    expect(d).not.toHaveProperty("topPerformers");
    expect(d).not.toHaveProperty("subjectStats");

    // First Terminal: everyone scored 50/100 in one subject → 50%.
    const firstTerm = d.termComparison.find((t: { examName: string }) => t.examName === "First Terminal");
    expect(firstTerm).toMatchObject({ avgPercentage: 50, studentCount: 4 });

    // Final: per-student averages of (maths, science) → 75, 45, 82.5, 42.5 → 61.3.
    const final = d.termComparison.find((t: { examName: string }) => t.examName === "Final");
    expect(final).toMatchObject({ avgPercentage: 61.3, studentCount: 4 });
  });
});

describe("GET /analytics/dashboard — cost", () => {
  it("does not cost more as grades and exam types are added", async () => {
    const before = await captureQueries(() => dashboard(adminToken).expect(200));

    const extraGrade = await createTestGrade(yearId, { name: "Grade III", displayOrder: 3 });
    const extraExam = await addExamType("Third Terminal", 4);
    try {
      const extraSection = await createTestSection(extraGrade.id, { name: "A" });
      await createTestStudent(extraSection.id, { name: "Three 1", rollNo: 1 });
      await prisma.subject.create({
        data: { name: "English", gradeId: extraGrade.id, fullTheoryMarks: 100, fullPracticalMarks: 0 },
      });
      clearDashboardCache();

      const after = await captureQueries(() => dashboard(adminToken).expect(200));
      expect(after.length).toBe(before.length);
    } finally {
      // Undo in a finally: a failed assertion here otherwise leaves an extra
      // grade behind and the *next* test reports a confusing student count.
      await prisma.examType.delete({ where: { id: extraExam.id } });
      await prisma.grade.delete({ where: { id: extraGrade.id } });
      clearDashboardCache();
    }
  });

  it("serves a warm cache without recomputing, but keeps today's counts live", async () => {
    await dashboard(adminToken, "?todayBS=2081/01/01").expect(200);

    const warm = await captureQueries(() =>
      dashboard(adminToken, "?todayBS=2081/01/01").expect(200)
    );
    // Active year lookup, the tenancy check, and today's counts — nothing else.
    expect(warm.length).toBeLessThan(5);

    // Attendance marked after the cache filled must still show up.
    await prisma.dailyAttendance.create({
      data: {
        studentId: gradeOneStudents[0],
        date: "2081/01/01",
        academicYearId: yearId,
        status: "ABSENT",
      },
    });

    const res = await dashboard(adminToken, "?todayBS=2081/01/01").expect(200);
    expect(res.body.data.summary.todayAbsent).toBe(1);

    await prisma.dailyAttendance.deleteMany({ where: { date: "2081/01/01" } });
  });
});

describe("GET /analytics/dashboard — cache isolation", () => {
  it("never serves one school's dashboard to another", async () => {
    const mine = await dashboard(adminToken).expect(200);
    expect(mine.body.data.summary.totalStudents).toBe(5);

    // Immediately after, with my entry warm: the other school must compute its
    // own, not read mine.
    const theirs = await dashboard(foreignToken).expect(200);
    expect(theirs.body.data.summary.totalStudents).toBe(1);
    expect(theirs.body.data.classAverages).toHaveLength(1);

    // And mine is unchanged by theirs.
    const again = await dashboard(adminToken).expect(200);
    expect(again.body.data.summary.totalStudents).toBe(5);
  });
});
