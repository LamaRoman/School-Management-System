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
      data: { name: "Maths", gradeId: gradeOne.id, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40 },
    })
  ).id;
  scienceId = (
    await prisma.subject.create({
      data: { name: "Science", gradeId: gradeOne.id, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40 },
    })
  ).id;

  firstTermId = (await addExamType("First Terminal", 1)).id;
  finalExamId = (await addExamType("Final", 2)).id;

  // Final exam, Maths: 80, 30, 90, 20 → 2 pass / 2 fail at passMarks 40.
  const mathsFinal = [80, 30, 90, 20];
  // Final exam, Science: all comfortably passing.
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

    expect(d.topPerformers[0]).toMatchObject({ rank: 1, percentage: 90, gradeName: "Grade I" });

    const maths = d.subjectStats.find((s: { subjectName: string }) => s.subjectName === "Maths");
    expect(maths).toMatchObject({ totalStudents: 4, passed: 2, failed: 2, passRate: 50 });

    // First Terminal: everyone scored 50/100 in one subject → 50%.
    const firstTerm = d.termComparison.find((t: { examName: string }) => t.examName === "First Terminal");
    expect(firstTerm).toMatchObject({ avgPercentage: 50, studentCount: 4 });

    // Final: per-student averages of (maths, science) → 75, 45, 82.5, 42.5 → 61.3.
    const final = d.termComparison.find((t: { examName: string }) => t.examName === "Final");
    expect(final).toMatchObject({ avgPercentage: 61.3, studentCount: 4 });
  });
});

describe("GET /analytics/dashboard — R8/R8a: which exam the pass/fail panel is about", () => {
  afterEach(async () => {
    await prisma.examType.updateMany({ where: { academicYearId: yearId }, data: { isFinal: false } });
    await prisma.examType.deleteMany({ where: { academicYearId: yearId, name: "Makeup" } });
    clearDashboardCache();
  });

  it("names the exam it used", async () => {
    // Final has 8 marks entered (Maths + Science × 4 students) against First
    // Terminal's 4 (Maths only) — Final wins on marks entered here, same as
    // it would have under the old displayOrder rule, but for a different
    // reason (see the next test, where the two rules disagree).
    const res = await dashboard(adminToken).expect(200);
    expect(res.body.data.subjectStatsExam).toEqual({ name: "Final" });
  });

  it("picks the exam with the most marks entered, not the one flagged final or sorting last (R8a)", async () => {
    // Owner decision (2026-08-17): report on whichever exam the school has
    // actually finished entering, not the Final — a Final sitting at a
    // fraction entered for most of the year used to make this panel report
    // pass rates over a sliver of the cohort. Flag Final isFinal and give it
    // the higher displayOrder, exactly as in real data, then give First
    // Terminal strictly more marks via a temporary subject — the panel must
    // still follow the marks, not the flag or the order.
    await prisma.examType.update({ where: { id: finalExamId }, data: { isFinal: true } });

    const mathsSubject = await prisma.subject.findUniqueOrThrow({
      where: { id: mathsId },
      select: { gradeId: true },
    });
    const extraSubject = await prisma.subject.create({
      data: { name: "Social", gradeId: mathsSubject.gradeId, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40 },
    });
    try {
      // First Terminal: 4 (Maths, existing) + 4 (Science, new) + 4 (Social, new) = 12, vs Final's 8.
      for (const sid of gradeOneStudents) {
        await addMark(sid, scienceId, firstTermId, 55);
        await addMark(sid, extraSubject.id, firstTermId, 60);
      }
      clearDashboardCache();

      const res = await dashboard(adminToken).expect(200);
      expect(res.body.data.subjectStatsExam).toEqual({ name: "First Terminal" });
    } finally {
      await prisma.mark.deleteMany({ where: { subjectId: extraSubject.id } });
      await prisma.mark.deleteMany({ where: { examTypeId: firstTermId, subjectId: scienceId } });
      await prisma.subject.delete({ where: { id: extraSubject.id } });
      clearDashboardCache();
    }
  });

  it("a low-volume makeup exam added after the final does not hijack the panel", async () => {
    // A supplementary exam sorting last, with almost nothing entered, must
    // not outrank Final just because display order once decided this.
    const makeup = await addExamType("Makeup", 3);
    await addMark(gradeOneStudents[1], mathsId, makeup.id, 45);
    clearDashboardCache();

    const res = await dashboard(adminToken).expect(200);
    expect(res.body.data.subjectStatsExam).toEqual({ name: "Final" });

    const maths = res.body.data.subjectStats.find(
      (s: { subjectName: string }) => s.subjectName === "Maths"
    );
    expect(maths).toMatchObject({ totalStudents: 4, passed: 2, failed: 2 });
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
        data: { name: "English", gradeId: extraGrade.id, fullTheoryMarks: 100, fullPracticalMarks: 0, passMarks: 40 },
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
    expect(theirs.body.data.topPerformers).toHaveLength(0);

    // And mine is unchanged by theirs.
    const again = await dashboard(adminToken).expect(200);
    expect(again.body.data.summary.totalStudents).toBe(5);
  });
});
