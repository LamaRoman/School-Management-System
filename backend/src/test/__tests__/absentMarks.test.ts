/**
 * Absent-mark handling in results
 *
 * Pins the rule stated in CLAUDE.md: an absent subject is DISPLAYED as "Ab" (never as a
 * grade) but is COUNTED AS ZERO in the GPA — it is never dropped from the denominator.
 *
 * Why this file exists: an earlier revision short-circuited absent subjects to
 * `{ grade: "NG", gpa: null }`, and the GPA average drops nulls, so the subject
 * vanished from the average and a student who SKIPPED an exam scored higher than
 * one who sat it and did badly.
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
 * Two subjects, 100 marks and 4 credit hours each, so the arithmetic is checkable by hand:
 *
 *                     A           B            GPA
 *   Rita (sat both)   80 A 3.6    30 D+ 1.6    (3.6+1.6)/2 = 2.6
 *   Sita (absent B)   80 A 3.6    Ab (0 → 0.8) (3.6+0.8)/2 = 2.2
 *
 * Under the old behaviour Sita's B was dropped entirely, giving her 3.6 — beating
 * Rita despite not sitting the paper. That inversion is the bug.
 */
const RITA_GPA = 2.6;
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
          creditHour: 4,
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

    // The regression guard: dropping the absent subject would give 3.6.
    expect(sitaReport.overallGpa).toBe(SITA_GPA);
    // ...and the screens show "—" for it while the paper is missing.
    expect(sitaReport.incomplete).toBe(true);
  });

  it("scores a student who sat the exam above one who skipped it", async () => {
    const ritaReport = await termReport(rita.id);
    const sitaReport = await termReport(sita.id);

    expect(ritaReport.overallGpa).toBe(RITA_GPA);
    expect(ritaReport.incomplete).toBe(false);
    // The whole point: 30 marks beats not turning up.
    expect(ritaReport.overallGpa).toBeGreaterThan(sitaReport.overallGpa);
  });

  it("flags the absent subject so it prints Ab, and has no rank or pass/fail", async () => {
    const sitaReport = await termReport(sita.id);
    const absent = sitaReport.subjects.find((s: any) => s.subjectName === "Subject B");

    // Counting it as zero must not cost us the display marker — every screen and the
    // PDF print "Ab" off this flag, never the E it is scored as.
    expect(absent.isAbsent).toBe(true);
    expect(absent.gradePoint).toBe(0.8);

    const present = sitaReport.subjects.find((s: any) => s.subjectName === "Subject A");
    expect(present.isAbsent).toBe(false);
    expect(present.finalGrade).toBe("A");

    for (const gone of ["rank", "totalStudents", "result", "overallPercentage", "overallGrade"]) {
      expect(sitaReport).not.toHaveProperty(gone);
    }
    expect(absent).not.toHaveProperty("hasPassed");
  });
});

describe("absent marks in the class grade sheet", () => {
  it("matches the report card", async () => {
    const res = await request(app)
      .get(
        `/grade-sheet/term?sectionId=${ctx.section.id}&examTypeId=${examTypeId}&academicYearId=${ctx.year.id}`,
      )
      .set("Authorization", authHeader(adminToken));
    expect(res.status).toBe(200);

    const rows: any[] = res.body.data.rows;
    const sitaRow = rows.find((r) => r.studentName === "Sita");
    const ritaRow = rows.find((r) => r.studentName === "Rita");

    // Same GPA the report card gives — the two are printed together.
    expect(sitaRow.gpa).toBe(SITA_GPA);
    expect(sitaRow.incomplete).toBe(true);
    expect(ritaRow.gpa).toBe(RITA_GPA);
    expect(ritaRow.incomplete).toBe(false);
    expect(sitaRow.subjects.find((s: any) => s.subjectId === subjectB.id).isAbsent).toBe(true);
    expect(ritaRow).not.toHaveProperty("rank");
    expect(res.body.data).not.toHaveProperty("showRank");
  });
});
