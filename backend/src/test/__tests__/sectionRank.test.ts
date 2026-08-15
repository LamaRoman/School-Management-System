/**
 * Section ranking — one implementation, one answer (R7)
 *
 * The rank algorithm existed in three places: the PDF report card
 * (`pdf.routes.ts`), the web portal (`report.routes.ts`) and the class mark sheet
 * (`gradeSheet.routes.ts`). Both the report card and the mark sheet get printed and
 * handed out, so where they disagreed a parent could see two different ranks for the
 * same child on the same marks.
 *
 * They disagreed on the divisor when a mark row was **missing entirely** — never
 * entered, as opposed to marked absent:
 *
 *   - the mark sheet averaged over every subject in the grade, scoring a missing row 0
 *   - the report card averaged over only the rows that student happened to have
 *
 * So a student with an incomplete record was ranked on a different basis from their
 * classmates, which inflated their position (R6), and the two documents printed
 * different ranks during marks entry (R3's remainder).
 *
 * Decided 2026-08-14 in favour of the mark sheet's rule: a rank whose divisor changes
 * per student is not a rank. These tests pin that decision and the agreement between
 * the two surfaces.
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
import { computeSectionRanks } from "../../services/rank.service";
import { buildReportCardHtml } from "../../services/pdf.service";

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;
let examTypeId: string;
let subjects: { id: string }[];

/** Every subject entered: 70, 70. Average over 2 subjects = 70%. */
let ram: { id: string };
/** Only one subject entered: 75. Average over 2 subjects = 37.5%, NOT 75%. */
let shyam: { id: string };
/** Ties with Ram on 70% — used to pin tie handling. */
let hari: { id: string };
/** No marks at all for this exam — a mid-year transfer. */
let gita: { id: string };

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({
    schoolName: "Rank Test School",
    schoolCode: "RTS",
    yearBS: "2081",
    gradeName: "Grade V",
    studentName: "Ram",
  });
  adminToken = (await loginAs(ctx.admin.email, ctx.adminPassword)).token;

  ram = ctx.student;
  shyam = await createTestStudent(ctx.section.id, { name: "Shyam", rollNo: 2 });
  hari = await createTestStudent(ctx.section.id, { name: "Hari", rollNo: 3 });
  gita = await createTestStudent(ctx.section.id, { name: "Gita", rollNo: 4 });

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

  subjects = await Promise.all(
    ["Maths", "Science"].map((name, i) =>
      prisma.subject.create({
        data: {
          name,
          fullTheoryMarks: 100,
          fullPracticalMarks: 0,
          passMarks: 35,
          displayOrder: i,
          gradeId: ctx.grade.id,
        },
      })
    )
  );

  const mark = (studentId: string, subjectId: string, theoryMarks: number) =>
    prisma.mark.create({
      data: {
        studentId,
        subjectId,
        examTypeId,
        academicYearId: ctx.year.id,
        theoryMarks,
        practicalMarks: 0,
      },
    });

  await mark(ram.id, subjects[0].id, 70);
  await mark(ram.id, subjects[1].id, 70);

  // Shyam's Science mark has not been entered yet. Under the old report-card rule he
  // averaged 75% over his single row and outranked Ram; under the mark sheet's rule he
  // averages (75 + 0) / 2 = 37.5%.
  await mark(shyam.id, subjects[0].id, 75);

  await mark(hari.id, subjects[0].id, 70);
  await mark(hari.id, subjects[1].id, 70);

  // Gita: nothing entered at all.
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

const gradeSheet = async () => {
  const res = await request(app)
    .get(`/grade-sheet/term?sectionId=${ctx.section.id}&examTypeId=${examTypeId}&academicYearId=${ctx.year.id}`)
    .set("Authorization", authHeader(adminToken));
  expect(res.status).toBe(200);
  return res.body.data;
};

describe("the divisor is every subject in the grade", () => {
  it("does not let an incomplete record outrank a complete one", async () => {
    const { ranks } = await computeSectionRanks(ctx.section.id, examTypeId, ctx.year.id);

    // The regression guard for R6. Dividing by Shyam's own row count gives him 75%
    // and rank 1 — ahead of Ram, on half the papers.
    expect(ranks.get(shyam.id)!.avgPct).toBeCloseTo(37.5, 5);
    expect(ranks.get(ram.id)!.avgPct).toBeCloseTo(70, 5);
    expect(ranks.get(ram.id)!.rank).toBeLessThan(ranks.get(shyam.id)!.rank);
  });

  it("reports the same percentage through the term report", async () => {
    expect((await termReport(shyam.id)).overallPercentage).toBeCloseTo(37.5, 1);
  });
});

describe("the report card and the class mark sheet agree", () => {
  it("gives every student the same rank on both documents", async () => {
    const sheet = await gradeSheet();
    const sheetRanks = new Map<string, number>(
      sheet.rows.map((r: any) => [r.studentId, r.rank])
    );

    // This is the finding in one assertion: same marks, same exam, two printed
    // documents, and before R7 these could differ for a student mid-entry.
    for (const student of [ram, shyam, hari]) {
      const report = await termReport(student.id);
      expect(report.rank).toBe(sheetRanks.get(student.id));
    }
  });
});

describe("ties and unranked students", () => {
  it("shares a rank on equal percentages and skips the next position", async () => {
    const { ranks } = await computeSectionRanks(ctx.section.id, examTypeId, ctx.year.id);

    // Ram and Hari both average 70%, so both are 1st and the next distinct
    // percentage takes 3rd — standard competition ranking.
    expect(ranks.get(ram.id)!.rank).toBe(1);
    expect(ranks.get(hari.id)!.rank).toBe(1);
    expect(ranks.get(shyam.id)!.rank).toBe(3);
  });

  it("counts the whole class in totalStudents, including students with no marks", async () => {
    const { totalStudents } = await computeSectionRanks(ctx.section.id, examTypeId, ctx.year.id);
    expect(totalStudents).toBe(4);
  });

  it("marks a student with no marks as unranked rather than genuinely last", async () => {
    const { ranks } = await computeSectionRanks(ctx.section.id, examTypeId, ctx.year.id);

    // She does sort last in the raw ranking, which is what the class mark sheet
    // wants — but `hasAnyMarks` is what stops the report card telling a mid-year
    // transfer she came last in a class she has not sat an exam in.
    expect(ranks.get(gita.id)!.rank).toBe(4);
    expect(ranks.get(gita.id)!.hasAnyMarks).toBe(false);

    // The term report never gets that far for her: a student with no marks at all
    // has no report to show, which is pre-existing behaviour and unchanged here.
    const res = await request(app)
      .get(`/reports/term/${gita.id}/${examTypeId}`)
      .set("Authorization", authHeader(adminToken));
    expect(res.status).toBe(404);
  });
});

describe("the printed rows add up to the printed percentage", () => {
  it("lists every subject in the grade, including one with no marks entered", async () => {
    const report = await termReport(shyam.id);

    // R4's hand-checkability: a parent adding up the rows on the card must land on
    // the figure printed at the bottom. That only holds if the un-entered subject
    // is on the card at all.
    expect(report.subjects).toHaveLength(2);
    const science = report.subjects.find((s: any) => s.subjectName === "Science");
    expect(science.notEntered).toBe(true);
    expect(science.isAbsent).toBe(false); // not the same claim — she wasn't absent
    expect(science.totalMarks).toBe(0);

    const mean =
      report.subjects.reduce((a: number, s: any) => a + s.percentage, 0) / report.subjects.length;
    expect(report.overallPercentage).toBeCloseTo(mean, 1);
    expect(report.overallPercentage).toBeCloseTo(37.5, 1);
  });
});

/**
 * The printed card must distinguish "absent" from "not entered yet". They score the
 * same (0), but "Ab" asserts the student did not turn up, which is a different and
 * potentially untrue claim about a child. Rendered straight from the template so the
 * assertion is on the HTML that actually goes to Puppeteer.
 */
describe("the report card template", () => {
  const card = (subjectOverrides: any) =>
    buildReportCardHtml(
      {
        school: { name: "Rank Test School" },
        student: { name: "Shyam", className: "V", section: "A", rollNo: 2 },
        academicYear: "2081",
        examType: "First Terminal",
        paperSize: "A4",
        isTermReport: true,
        gradingStyle: "MARKS_BASED",
        hasPracticalSubjects: false,
        overallPercentage: 37.5,
        overallGpa: 2.2,
        overallGrade: "C",
        subjects: [
          {
            subjectName: "Maths",
            fullMarks: 100,
            passMarks: 35,
            theoryMarks: 75,
            practicalMarks: 0,
            totalMarks: 75,
            percentage: 75,
            grade: "A",
            gpa: 3.6,
            hasPassed: true,
            isAbsent: false,
            notEntered: false,
          },
          {
            subjectName: "Science",
            fullMarks: 100,
            passMarks: 35,
            theoryMarks: 0,
            practicalMarks: 0,
            totalMarks: 0,
            percentage: 0,
            grade: "E",
            gpa: 0.8,
            hasPassed: false,
            ...subjectOverrides,
          },
        ],
      },
      "color"
    );

  it("prints an em dash for a subject with no marks entered, not 'Ab'", () => {
    const html = card({ isAbsent: false, notEntered: true });
    const scienceRow = html.split("<tr").find((r) => r.includes("Science"))!;

    expect(scienceRow).toContain("—");
    expect(scienceRow).not.toContain(">Ab<");
    // The columns beside it still show the real 0-score grade — it counts, it just
    // does not claim she was absent.
    expect(scienceRow).toContain("E");
  });

  it("still prints 'Ab' for a genuine absence", () => {
    const html = card({ isAbsent: true, notEntered: false });
    const scienceRow = html.split("<tr").find((r) => r.includes("Science"))!;
    expect(scienceRow).toContain("Ab");
  });

  it("calls the result Incomplete while any subject is unentered", () => {
    expect(card({ isAbsent: false, notEntered: true })).toContain("Incomplete");
    // ...and does not once every subject is in.
    expect(card({ isAbsent: false, notEntered: false })).not.toContain("Incomplete");
  });
});

/**
 * R7a — optional subjects.
 *
 * `Subject.isOptional` has existed on the model, been settable from the admin UI, and
 * been read by no results calculation. Once R7 started scoring every subject in the
 * grade, a student who does not take an elective would have been given 0 for it in
 * their percentage, GPA and rank.
 *
 * There is no per-student subject enrollment in the schema, so "has no mark row" is
 * the only available signal. The rule: required + no mark = not entered yet (scores
 * 0); optional + no mark = not taken (excluded entirely).
 */
describe("optional subjects are not scored against a student who does not take them", () => {
  let optionalSubjectId: string;

  beforeAll(async () => {
    const optional = await prisma.subject.create({
      data: {
        name: "Optional Music",
        fullTheoryMarks: 100,
        fullPracticalMarks: 0,
        passMarks: 35,
        displayOrder: 9,
        isOptional: true,
        gradeId: ctx.grade.id,
      },
    });
    optionalSubjectId = optional.id;

    // Hari is enrolled in it and did well. Ram and Shyam are not enrolled at all.
    // Enrollment — not the presence of a mark — is what decides whether the subject
    // counts for a student.
    await prisma.studentOptionalSubject.create({
      data: { studentId: hari.id, subjectId: optional.id },
    });
    await prisma.mark.create({
      data: {
        studentId: hari.id,
        subjectId: optional.id,
        examTypeId,
        academicYearId: ctx.year.id,
        theoryMarks: 90,
        practicalMarks: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.studentOptionalSubject.deleteMany({ where: { subjectId: optionalSubjectId } });
    await prisma.mark.deleteMany({ where: { subjectId: optionalSubjectId } });
    await prisma.subject.delete({ where: { id: optionalSubjectId } });
  });

  it("leaves the elective out of the divisor for students who do not take it", async () => {
    const { ranks } = await computeSectionRanks(ctx.section.id, examTypeId, ctx.year.id);

    // Ram is still averaged over his two real subjects — 70%, unchanged. Scoring the
    // elective as a zero would have dropped him to (70+70+0)/3 = 46.7%.
    expect(ranks.get(ram.id)!.avgPct).toBeCloseTo(70, 5);
  });

  it("counts the elective for the student who does take it", async () => {
    const { ranks } = await computeSectionRanks(ctx.section.id, examTypeId, ctx.year.id);
    // Hari: (70 + 70 + 90) / 3
    expect(ranks.get(hari.id)!.avgPct).toBeCloseTo((70 + 70 + 90) / 3, 5);
  });

  it("keeps the elective off the report card of a student who does not take it", async () => {
    const ramCard = await termReport(ram.id);
    expect(ramCard.subjects.map((s: any) => s.subjectName)).not.toContain("Optional Music");
    expect(ramCard.overallPercentage).toBeCloseTo(70, 1);

    const hariCard = await termReport(hari.id);
    expect(hariCard.subjects.map((s: any) => s.subjectName)).toContain("Optional Music");
  });

  it("still counts a REQUIRED subject with no mark as zero, unlike an optional one", async () => {
    // Shyam's Science (required, unentered) still drags him down; the elective he does
    // not take does not. This is the distinction the whole rule rests on.
    const card = await termReport(shyam.id);
    expect(card.subjects.map((s: any) => s.subjectName).sort()).toEqual(["Maths", "Science"]);
    expect(card.overallPercentage).toBeCloseTo(37.5, 1);
  });
});

/**
 * The reason StudentOptionalSubject exists.
 *
 * Inferring "does not take this elective" from the absence of a mark row cannot tell
 * a genuine non-enrollment apart from an elective whose mark is merely late. Under
 * that heuristic a late mark silently dropped the subject out of the student's
 * divisor, quietly raising their percentage — R6's inflation, scoped to electives.
 * With explicit enrollment, an enrolled student with no mark yet scores 0 like any
 * other subject, and only a genuine non-enrollment is excluded.
 */
describe("an enrolled elective with no mark yet still scores zero", () => {
  let optionalSubjectId: string;

  beforeAll(async () => {
    const optional = await prisma.subject.create({
      data: {
        name: "Optional Art",
        fullTheoryMarks: 100,
        fullPracticalMarks: 0,
        passMarks: 35,
        displayOrder: 10,
        isOptional: true,
        gradeId: ctx.grade.id,
      },
    });
    optionalSubjectId = optional.id;

    // Ram is enrolled but his mark has not been entered. Nothing else changes.
    await prisma.studentOptionalSubject.create({
      data: { studentId: ram.id, subjectId: optional.id },
    });
  });

  afterAll(async () => {
    await prisma.studentOptionalSubject.deleteMany({ where: { subjectId: optionalSubjectId } });
    await prisma.subject.delete({ where: { id: optionalSubjectId } });
  });

  it("counts it as zero rather than dropping it from the divisor", async () => {
    const { ranks } = await computeSectionRanks(ctx.section.id, examTypeId, ctx.year.id);

    // (70 + 70 + 0) / 3 = 46.67. The old mark-presence heuristic would have excluded
    // the unmarked elective and left him on 70 — better than the classmates he is
    // actually tied with, for a paper nobody has marked.
    expect(ranks.get(ram.id)!.avgPct).toBeCloseTo((70 + 70 + 0) / 3, 5);

    // Hari is not enrolled in this one, so he is untouched at 70.
    expect(ranks.get(hari.id)!.avgPct).toBeCloseTo(70, 5);
  });

  it("shows the enrolled-but-unmarked elective on the card as not entered", async () => {
    const card = await termReport(ram.id);
    const art = card.subjects.find((s: any) => s.subjectName === "Optional Art");
    expect(art).toBeDefined();
    expect(art.notEntered).toBe(true);
    expect(art.isAbsent).toBe(false);

    // And it is absent from the card of a student who does not take it.
    const hariCard = await termReport(hari.id);
    expect(hariCard.subjects.map((s: any) => s.subjectName)).not.toContain("Optional Art");
  });
});

/**
 * The enrollment API and the guards around it.
 */
describe("optional subject enrollment API", () => {
  let optionalSubjectId: string;
  let otherGradeSubjectId: string;

  beforeAll(async () => {
    const optional = await prisma.subject.create({
      data: {
        name: "Optional Computer",
        fullTheoryMarks: 100,
        fullPracticalMarks: 0,
        passMarks: 35,
        displayOrder: 11,
        isOptional: true,
        gradeId: ctx.grade.id,
      },
    });
    optionalSubjectId = optional.id;

    // An optional subject belonging to a DIFFERENT grade, to prove the guard.
    const otherGrade = await prisma.grade.create({
      data: { name: "Grade VI", displayOrder: 6, academicYearId: ctx.year.id },
    });
    const foreign = await prisma.subject.create({
      data: {
        name: "Foreign Optional",
        fullTheoryMarks: 100,
        fullPracticalMarks: 0,
        passMarks: 35,
        displayOrder: 1,
        isOptional: true,
        gradeId: otherGrade.id,
      },
    });
    otherGradeSubjectId = foreign.id;
  });

  afterAll(async () => {
    await prisma.studentOptionalSubject.deleteMany({ where: { subjectId: optionalSubjectId } });
    await prisma.subject.delete({ where: { id: optionalSubjectId } });
  });

  const setOptional = (studentId: string, subjectIds: string[]) =>
    request(app)
      .put(`/students/${studentId}/optional-subjects`)
      .set("Authorization", authHeader(adminToken))
      .send({ subjectIds });

  it("lists the grade's optional subjects with an enrolment flag", async () => {
    const res = await request(app)
      .get(`/students/${ram.id}/optional-subjects`)
      .set("Authorization", authHeader(adminToken));
    expect(res.status).toBe(200);

    const names = res.body.data.map((s: any) => s.name);
    expect(names).toContain("Optional Computer");
    // Compulsory subjects are not choices and must not appear.
    expect(names).not.toContain("Maths");
    expect(res.body.data.find((s: any) => s.name === "Optional Computer").isEnrolled).toBe(false);
  });

  it("enrols and un-enrols, replacing the whole set", async () => {
    expect((await setOptional(ram.id, [optionalSubjectId])).status).toBe(200);
    expect(
      await prisma.studentOptionalSubject.count({ where: { studentId: ram.id, subjectId: optionalSubjectId } })
    ).toBe(1);

    expect((await setOptional(ram.id, [])).status).toBe(200);
    expect(await prisma.studentOptionalSubject.count({ where: { studentId: ram.id } })).toBe(0);
  });

  it("rejects a subject from another grade", async () => {
    const res = await setOptional(ram.id, [otherGradeSubjectId]);
    expect(res.status).toBe(400);
    expect(await prisma.studentOptionalSubject.count({ where: { studentId: ram.id } })).toBe(0);
  });

  it("rejects a compulsory subject — enrolment is not a thing for those", async () => {
    const res = await setOptional(ram.id, [subjects[0].id]);
    expect(res.status).toBe(400);
  });

  it("refuses marks for a student not enrolled in the optional subject", async () => {
    const res = await request(app)
      .post("/marks/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        subjectId: optionalSubjectId,
        examTypeId,
        academicYearId: ctx.year.id,
        marks: [{ studentId: shyam.id, theoryMarks: 80, practicalMarks: 0, isAbsent: false }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error || res.body.message).toMatch(/not enrolled/i);
  });

  it("accepts marks once the student is enrolled", async () => {
    await setOptional(shyam.id, [optionalSubjectId]);
    const res = await request(app)
      .post("/marks/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        subjectId: optionalSubjectId,
        examTypeId,
        academicYearId: ctx.year.id,
        marks: [{ studentId: shyam.id, theoryMarks: 80, practicalMarks: 0, isAbsent: false }],
      });
    expect(res.status).toBe(200);

    await prisma.mark.deleteMany({ where: { subjectId: optionalSubjectId } });
    await setOptional(shyam.id, []);
  });

  it("narrows the roster to enrolled students when a subjectId is given", async () => {
    await setOptional(hari.id, [optionalSubjectId]);

    const all = await request(app)
      .get(`/students?sectionId=${ctx.section.id}`)
      .set("Authorization", authHeader(adminToken));
    const forOptional = await request(app)
      .get(`/students?sectionId=${ctx.section.id}&subjectId=${optionalSubjectId}`)
      .set("Authorization", authHeader(adminToken));

    expect(all.body.data.length).toBe(4);
    expect(forOptional.body.data.map((s: any) => s.id)).toEqual([hari.id]);

    // A compulsory subject is taken by everyone, so the filter is a no-op there.
    const forCompulsory = await request(app)
      .get(`/students?sectionId=${ctx.section.id}&subjectId=${subjects[0].id}`)
      .set("Authorization", authHeader(adminToken));
    expect(forCompulsory.body.data.length).toBe(4);

    await setOptional(hari.id, []);
  });
});
