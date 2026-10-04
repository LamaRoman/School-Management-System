/**
 * Ranking and percentage rules decided 2026-10-04 (III-A, Manju Shree):
 *   - the overall percentage is total marks over total full marks, not the average of the
 *     subject percentages (they differ once subjects have different full marks);
 *   - only students who passed are ranked; Fail and Incomplete print no rank.
 * Pure rules first, then the term and annual routes end to end.
 */

import request from "supertest";
import {
  app, prisma, cleanDatabase, disconnectDatabase, seedSchoolContext, createTestStudent, loginAs, authHeader,
} from "../helpers";
import { totalMarksPercentage, rankPassedOnly, studentResult } from "../../services/grading.service";
import { computeSectionRanks, computeFinalSectionRanks } from "../../services/rank.service";

describe("totalMarksPercentage", () => {
  it("is total over total, so a 25-mark subject weighs half a 50-mark one", () => {
    // Aasha Rawat, III-A First Terminal: six subjects out of 50 and Computer out of 25.
    const aasha = [[19.5, 50], [14, 50], [21, 50], [43, 50], [16, 25], [26, 50], [24, 50]]
      .map(([got, full]) => ({ percentage: (got / full) * 100, fullMarks: full }));
    expect(totalMarksPercentage(aasha)).toBeCloseTo((163.5 / 325) * 100, 6); // 50.3
    const plainAverage = aasha.reduce((a, s) => a + s.percentage, 0) / aasha.length;
    expect(plainAverage).toBeCloseTo(51.29, 2); // what the old rule printed
  });

  it("is 0 with nothing to count", () => {
    expect(totalMarksPercentage([])).toBe(0);
  });
});

describe("studentResult", () => {
  it("Incomplete beats everything; then a failed subject; then Pass", () => {
    expect(studentResult("A", [{ hasPassed: false }, { isAbsent: true }])).toBe("Incomplete");
    expect(studentResult("A", [{ hasPassed: true }, { notEntered: true }])).toBe("Incomplete");
    expect(studentResult("B", [{ hasPassed: true }, { hasPassed: false }])).toBe("Fail");
    expect(studentResult("B", [{ hasPassed: true }, { hasPassed: true }])).toBe("Pass");
  });

  it("uses the pass mark, not the grade — a D+ (30–39%) below a 40% pass mark is a Fail", () => {
    // 17/50 = 34% = D+, which the credit-hour card used to pass.
    expect(studentResult("", [{ hasPassed: true }, { hasPassed: false }])).toBe("Fail");
  });
});

describe("rankPassedOnly", () => {
  it("ranks only Pass, shares ties and skips the next position", () => {
    const ranks = rankPassedOnly([
      { studentId: "fail-top", pct: 90, result: "Fail" },
      { studentId: "a", pct: 70, result: "Pass" },
      { studentId: "b", pct: 70, result: "Pass" },
      { studentId: "c", pct: 60, result: "Pass" },
      { studentId: "absent", pct: 65, result: "Incomplete" },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(3);
    expect(ranks.get("fail-top")).toBeNull();
    expect(ranks.get("absent")).toBeNull();
  });
});

describe("routes", () => {
  let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
  let token: string;
  let termId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await cleanDatabase();
    ctx = await seedSchoolContext({ schoolName: "Rank Rules School", schoolCode: "RRS", yearBS: "2083", gradeName: "III", studentName: "Topper" });
    token = (await loginAs(ctx.admin.email, ctx.adminPassword)).token;
    ids.topper = ctx.student.id; // highest percentage, but fails Computer
    ids.second = (await createTestStudent(ctx.section.id, { name: "Second", rollNo: 2 })).id;
    ids.third = (await createTestStudent(ctx.section.id, { name: "Third", rollNo: 3 })).id;
    ids.absent = (await createTestStudent(ctx.section.id, { name: "Absent", rollNo: 4 })).id;

    const english = await prisma.subject.create({ data: { name: "English", fullTheoryMarks: 50, passMarks: 20, gradeId: ctx.grade.id, displayOrder: 1 } });
    const computer = await prisma.subject.create({ data: { name: "Computer", fullTheoryMarks: 25, passMarks: 10, gradeId: ctx.grade.id, displayOrder: 2 } });
    const term = await prisma.examType.create({ data: { name: "First Terminal", academicYearId: ctx.year.id, displayOrder: 1, showRank: true } });
    termId = term.id;
    await prisma.examType.create({ data: { name: "Final", academicYearId: ctx.year.id, displayOrder: 2, isFinal: true, showRank: true } });
    await prisma.gradingPolicy.create({ data: { gradeId: ctx.grade.id, examTypeId: term.id, weightagePercent: 100 } });

    const mark = (studentId: string, subjectId: string, theoryMarks: number | null, isAbsent = false) =>
      prisma.mark.create({ data: { studentId, subjectId, examTypeId: term.id, academicYearId: ctx.year.id, theoryMarks, practicalMarks: 0, isAbsent } });
    await mark(ids.topper, english.id, 50); await mark(ids.topper, computer.id, 9);   // 59/75 = 78.7%, Computer < 10 → Fail
    await mark(ids.second, english.id, 40); await mark(ids.second, computer.id, 20);  // 60/75 = 80.0% → Pass
    await mark(ids.third, english.id, 30);  await mark(ids.third, computer.id, 15);   // 45/75 = 60.0% → Pass
    await mark(ids.absent, english.id, 45); await mark(ids.absent, computer.id, null, true); // Incomplete
  }, 60000);

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  const get = (url: string) => request(app).get(url).set("Authorization", authHeader(token)).expect(200).then((r) => r.body.data);

  it("term: the report's percentage is total over total", async () => {
    // Average of subject %s would be (80 + 80) / 2 = 80 for Second as well, but Topper
    // shows the difference: (100 + 36) / 2 = 68 averaged vs 59/75 = 78.7 by total.
    expect((await get(`/reports/term/${ids.topper}/${termId}`)).overallPercentage).toBe(78.7);
    expect((await get(`/reports/term/${ids.second}/${termId}`)).overallPercentage).toBe(80);
  });

  it("term: only students who passed are ranked, on the report card and the grade sheet alike", async () => {
    const { ranks } = await computeSectionRanks(ctx.section.id, termId, ctx.year.id);
    expect(ranks.get(ids.second)!.rank).toBe(1);
    expect(ranks.get(ids.third)!.rank).toBe(2);
    expect(ranks.get(ids.topper)!.rank).toBeNull();
    expect(ranks.get(ids.absent)!.rank).toBeNull();

    const sheet = await get(`/grade-sheet/term?sectionId=${ctx.section.id}&examTypeId=${termId}&academicYearId=${ctx.year.id}`);
    for (const row of sheet.rows) {
      const card = await get(`/reports/term/${row.studentId}/${termId}`);
      expect(card.rank ?? null).toBe(row.rank);
      expect(card.overallPercentage).toBe(row.percentage);
      // Absent student: flagged so every screen shows "—" for %, GPA and grade.
      expect(card.incomplete).toBe(row.studentId === ids.absent);
      expect(row.incomplete).toBe(row.studentId === ids.absent);
    }
    expect(sheet.totalStudents).toBe(4);
  });

  it("annual: one ranking for the annual report card and the annual grade sheet", async () => {
    const { ranks } = await computeFinalSectionRanks(ctx.section.id, ctx.year.id);
    expect(ranks.get(ids.second)!.rank).toBe(1);
    expect(ranks.get(ids.third)!.rank).toBe(2);
    expect(ranks.get(ids.topper)!.rank).toBeNull();

    const sheet = await get(`/grade-sheet/final?sectionId=${ctx.section.id}&academicYearId=${ctx.year.id}`);
    for (const row of sheet.rows) {
      const card = await get(`/reports/final/${row.studentId}/${ctx.year.id}`);
      expect(card.rank ?? null).toBe(row.rank);
      expect(card.overallPercentage).toBe(row.percentage);
    }
  });
});
