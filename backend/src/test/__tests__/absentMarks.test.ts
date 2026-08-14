/**
 * Absent-mark handling in results
 *
 * Pins the rule stated in CLAUDE.md and in grading.service.ts's own rationale:
 * an absent subject is DISPLAYED as "Ab"/"NG" but is COUNTED AS ZERO in every
 * average — it is never dropped from the denominator.
 *
 * Why this file exists: an earlier revision short-circuited absent subjects to
 * `{ grade: "NG", gpa: null }` and then filtered them out of the overall
 * percentage. calculateOverallGpa drops nulls, so the subject vanished from
 * both averages, and a student who SKIPPED an exam scored higher than one who
 * sat it and failed. The same divergence also made a report card's percentage
 * disagree with its own rank (rank always scored absences as 0) and made the
 * grade sheet's Total column disagree with its Percentage column.
 *
 * The scenario below is the minimal reproduction of that bug. If someone
 * reintroduces the short-circuit, "counts an absence as zero, not as a skip"
 * fails immediately.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestStudent,
  loginAs,
  authHeader,
} from "../helpers";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;
let examTypeId: string;
let subjectA: { id: string };
let subjectB: { id: string };

/** Sat every paper: 80 in A, a poor-but-real 30 in B. */
let rita: { id: string };
/** Identical 80 in A, but absent for B. */
let sita: { id: string };

/*
 * Two subjects, 100 marks each, so the arithmetic is checkable by hand:
 *
 *                     A      B          %              GPA
 *   Rita (sat both)   80     30    (80+30)/2 = 55   (3.6+1.6)/2 = 2.6  -> C+
 *   Sita (absent B)   80     Ab    (80+ 0)/2 = 40   (3.6+0.8)/2 = 2.2  -> C
 *
 * Under the old behaviour Sita's B was dropped entirely, giving her 80% / 3.6
 * — beating Rita despite not sitting the paper. That inversion is the bug.
 */
const RITA_PCT = 55;
const RITA_GPA = 2.6;
const SITA_PCT = 40;
const SITA_GPA = 2.2;

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({
    schoolName: "Absent Marks Test School",
    schoolCode: "AMTS",
    yearBS: "2081",
    gradeName: "Grade X",
    studentName: "Rita",
  });
  adminToken = (await loginAs(ctx.admin.email, ctx.adminPassword)).token;

  rita = ctx.student;
  sita = await createTestStudent(ctx.section.id, { name: "Sita", rollNo: 2 });

  const examType = await prisma.examType.create({
    data: {
      name: "First Terminal",
      academicYearId: ctx.year.id,
      displayOrder: 1,
      paperSize: "A4",
      showRank: true,
    },
  });
  examTypeId = examType.id;

  [subjectA, subjectB] = await Promise.all(
    ["Subject A", "Subject B"].map((name, i) =>
      prisma.subject.create({
        data: {
          name,
          fullTheoryMarks: 100,
          fullPracticalMarks: 0,
          passMarks: 35,
          displayOrder: i,
          gradeId: ctx.grade.id,
        },
      }),
    ),
  );

  const mark = (studentId: string, subjectId: string, theoryMarks: number | null, isAbsent = false) =>
    prisma.mark.create({
      data: { studentId, subjectId, examTypeId, academicYearId: ctx.year.id, theoryMarks, practicalMarks: 0, isAbsent },
    });

  await mark(rita.id, subjectA.id, 80);
  await mark(rita.id, subjectB.id, 30);
  await mark(sita.id, subjectA.id, 80);
  // Absent: marks stored null, flagged. This is what the mark-entry route writes.
  await mark(sita.id, subjectB.id, null, true);
}, 60000);

afterAll(async () => {
  await disconnectDatabase();
});

const termReport = async (studentId: string) => {
  const res = await request(app)
    .get(`/reports/term/${studentId}/${examTypeId}`)
    .set("Authorization", authHeader(adminToken));
  expect(res.status).toBe(200);
  return res.body.data;
};

describe("absent marks in the term report", () => {
  it("counts an absence as zero, not as a skip", async () => {
    const sitaReport = await termReport(sita.id);

    // The regression guard: dropping the absent subject would give 80 / 3.6.
    expect(sitaReport.overallPercentage).toBe(SITA_PCT);
    expect(sitaReport.overallGpa).toBe(SITA_GPA);
  });

  it("ranks a student who sat the exam above one who skipped it", async () => {
    const ritaReport = await termReport(rita.id);
    const sitaReport = await termReport(sita.id);

    expect(ritaReport.overallPercentage).toBe(RITA_PCT);
    expect(ritaReport.overallGpa).toBe(RITA_GPA);

    // The whole point: 30 marks beats not turning up.
    expect(ritaReport.overallPercentage).toBeGreaterThan(sitaReport.overallPercentage);
    expect(ritaReport.overallGpa).toBeGreaterThan(sitaReport.overallGpa);
    expect(ritaReport.rank).toBeLessThan(sitaReport.rank);
  });

  it("still flags the absent subject so the card prints Ab / NG", async () => {
    const sitaReport = await termReport(sita.id);
    const absent = sitaReport.subjects.find((s: any) => s.subjectName === "Subject B");

    // Counting it as zero must not cost us the display marker — pdf.service.ts
    // renders "Ab"/"NG" off this flag, not off the grade or gpa values.
    expect(absent.isAbsent).toBe(true);
    expect(absent.percentage).toBe(0);
    expect(absent.hasPassed).toBe(false);

    // A present subject is unaffected.
    const present = sitaReport.subjects.find((s: any) => s.subjectName === "Subject A");
    expect(present.isAbsent).toBe(false);
    expect(present.percentage).toBe(80);
  });

  it("agrees with the rank it prints beside the percentage", async () => {
    const ritaReport = await termReport(rita.id);
    const sitaReport = await termReport(sita.id);

    // Rank is computed from a separate query that has always scored absences
    // as 0. Now that the printed percentage does too, the ordering the ranks
    // imply must match the ordering the percentages imply.
    const byRank = [ritaReport, sitaReport].sort((a, b) => a.rank - b.rank);
    const byPct = [ritaReport, sitaReport].sort((a, b) => b.overallPercentage - a.overallPercentage);
    expect(byRank.map((r) => r.rank)).toEqual([1, 2]);
    expect(byRank[0].overallPercentage).toBe(byPct[0].overallPercentage);
  });
});

describe("absent marks in the class grade sheet", () => {
  it("matches the report card, and its own Total column", async () => {
    const res = await request(app)
      .get(
        `/grade-sheet/term?sectionId=${ctx.section.id}&examTypeId=${examTypeId}&academicYearId=${ctx.year.id}`,
      )
      .set("Authorization", authHeader(adminToken));
    expect(res.status).toBe(200);

    const rows: any[] = res.body.data.rows;
    const sitaRow = rows.find((r) => r.studentName === "Sita");
    const ritaRow = rows.find((r) => r.studentName === "Rita");

    // Same figures the report card gives — the two are printed together.
    expect(sitaRow.percentage).toBe(SITA_PCT);
    expect(ritaRow.percentage).toBe(RITA_PCT);
    expect(ritaRow.rank).toBeLessThan(sitaRow.rank);

    // A parent can divide the Total column by hand; it has to land on the
    // Percentage column beside it.
    expect(sitaRow.totalObtained).toBe(80);
    expect(sitaRow.totalFullMarks).toBe(200);
    expect((sitaRow.totalObtained / sitaRow.totalFullMarks) * 100).toBe(sitaRow.percentage);
  });
});
