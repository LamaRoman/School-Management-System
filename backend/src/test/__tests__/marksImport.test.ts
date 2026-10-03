/**
 * Marks import (prisma/import-marks.ts) — the logic behind it.
 *
 * It is meant to be pointed at a production database by hand, so what matters is: a dry run
 * writes nothing, anything ambiguous blocks applying, a second run changes nothing, and other
 * sections / schools are never touched.
 */

import {
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestSection,
  createTestStudent,
} from "../helpers";
import { buildPlan, applyPlan, type ImportData } from "../../services/marksImport.service";

const OPTS = { fullMarks: 50, passMarks: 20 };

let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let otherCtx: Awaited<ReturnType<typeof seedSchoolContext>>;
let sectionId: string;
let examName = "First Terminal";

const DATA: ImportData = {
  subjects: ["English", "Math", "Science", "Nepali", "Social"],
  rows: [
    { rollNo: 1, name: "Aasish Kami", marks: { English: 18, Math: 10, Science: 3, Nepali: 18, Social: 3 } },
    { rollNo: 2, name: "Anisha Budha", marks: { English: 7, Math: 2, Science: 0, Nepali: 8, Social: 0.5 } },
    { rollNo: 3, name: "Sudash Budha", marks: { English: 36, Math: 50, Science: 26, Nepali: 38, Social: 31 } },
  ],
};

const counts = async () => ({
  students: await prisma.student.count(),
  subjects: await prisma.subject.count(),
  marks: await prisma.mark.count(),
});

beforeEach(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({ schoolName: "Import School", schoolCode: "IMP", yearBS: "2082", gradeName: "UKG" });
  otherCtx = await seedSchoolContext({ schoolName: "Other School", schoolCode: "OTH", yearBS: "2082", gradeName: "UKG", adminEmail: "o@o.test" });
  // The seeded context comes with one dummy student; this class starts empty.
  await prisma.student.deleteMany({});
  sectionId = ctx.section.id;
  await prisma.examType.create({ data: { name: examName, academicYearId: ctx.year.id, displayOrder: 1 } });
  await prisma.examType.create({ data: { name: examName, academicYearId: otherCtx.year.id, displayOrder: 1 } });
  // The grade already has English and Mathematics (full marks 50); Science/Nepali/Social do not exist.
  for (const [i, name] of ["English", "Mathematics"].entries()) {
    await prisma.subject.create({ data: { name, fullTheoryMarks: 50, passMarks: 20, displayOrder: i, gradeId: ctx.grade.id } });
  }
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("dry run (buildPlan)", () => {
  it("reports what would change and writes nothing", async () => {
    const before = await counts();
    const plan = await buildPlan(prisma, { sectionId, examName }, DATA, OPTS);
    expect(await counts()).toEqual(before);

    expect(plan.problems).toEqual([]);
    expect(plan.section).toMatchObject({ label: "UKG-A", school: "Import School" });
    expect(plan.students.map((s) => s.action)).toEqual(["create", "create", "create"]);
    // "Math" finds "Mathematics"; the other three are new
    expect(plan.subjects.map((s) => [s.sheet, s.action, s.name])).toEqual([
      ["English", "existing", "English"],
      ["Math", "existing", "Mathematics"],
      ["Science", "create", "Science"],
      ["Nepali", "create", "Nepali"],
      ["Social", "create", "Social Studies"],
    ]);
    expect(plan.marks).toEqual({ create: 15, update: 0, unchanged: 0 });
  });

  it("names the class teacher(s) of the section", async () => {
    const teacher = await prisma.teacher.create({ data: { schoolId: ctx.school.id, name: "Mina Karki" } });
    await prisma.teacherAssignment.create({ data: { teacherId: teacher.id, sectionId, isClassTeacher: true } });
    const other = await prisma.teacher.create({ data: { schoolId: ctx.school.id, name: "Subject Teacher" } });
    await prisma.teacherAssignment.create({ data: { teacherId: other.id, sectionId, isClassTeacher: false } });
    const plan = await buildPlan(prisma, { sectionId, examName }, DATA, OPTS);
    expect(plan.classTeachers).toEqual(["Mina Karki"]);
  });

  it("fails clearly for an unknown section or exam", async () => {
    await expect(buildPlan(prisma, { sectionId: "nope", examName }, DATA, OPTS)).rejects.toThrow(/No section/);
    await expect(buildPlan(prisma, { sectionId, examName: "Midterm" }, DATA, OPTS)).rejects.toThrow(/No exam called "Midterm"/);
  });
});

describe("apply", () => {
  it("creates the students, subjects and marks, with theory marks and no practical", async () => {
    const done = await applyPlan(prisma, { sectionId, examName }, DATA, OPTS);
    expect(done).toEqual({ subjectsCreated: 3, studentsCreated: 3, marksWritten: 15 });

    const students = await prisma.student.findMany({ where: { sectionId }, orderBy: { rollNo: "asc" } });
    expect(students.map((s) => [s.rollNo, s.name])).toEqual([[1, "Aasish Kami"], [2, "Anisha Budha"], [3, "Sudash Budha"]]);

    const science = await prisma.subject.findFirstOrThrow({ where: { gradeId: ctx.grade.id, name: "Science" } });
    expect(science).toMatchObject({ fullTheoryMarks: 50, fullPracticalMarks: 0, passMarks: 20 });

    const anisha = students[1];
    const social = await prisma.subject.findFirstOrThrow({ where: { gradeId: ctx.grade.id, name: "Social Studies" } });
    const m = await prisma.mark.findFirstOrThrow({ where: { studentId: anisha.id, subjectId: social.id } });
    expect(m).toMatchObject({ theoryMarks: 0.5, practicalMarks: 0, isAbsent: false });
    // a legitimate 0 is stored as 0, not left blank
    const sci = await prisma.mark.findFirstOrThrow({ where: { studentId: anisha.id, subjectId: science.id } });
    expect(sci.theoryMarks).toBe(0);
  });

  it("is idempotent: a second run reports everything as already there and writes nothing new", async () => {
    await applyPlan(prisma, { sectionId, examName }, DATA, OPTS);
    const after1 = await counts();
    const plan2 = await buildPlan(prisma, { sectionId, examName }, DATA, OPTS);
    expect(plan2.students.every((s) => s.action === "exists")).toBe(true);
    expect(plan2.subjects.every((s) => s.action === "existing")).toBe(true);
    expect(plan2.marks).toEqual({ create: 0, update: 0, unchanged: 15 });
    await applyPlan(prisma, { sectionId, examName }, DATA, OPTS);
    expect(await counts()).toEqual(after1);
  });

  it("a corrected mark in the file updates the stored one", async () => {
    await applyPlan(prisma, { sectionId, examName }, DATA, OPTS);
    const fixed: ImportData = { ...DATA, rows: [{ ...DATA.rows[0], marks: { ...DATA.rows[0].marks, English: 19 } }, DATA.rows[1], DATA.rows[2]] };
    const plan = await buildPlan(prisma, { sectionId, examName }, fixed, OPTS);
    expect(plan.marks).toEqual({ create: 0, update: 1, unchanged: 14 });
    await applyPlan(prisma, { sectionId, examName }, fixed, OPTS);
    const eng = await prisma.subject.findFirstOrThrow({ where: { gradeId: ctx.grade.id, name: "English" } });
    const stu = await prisma.student.findFirstOrThrow({ where: { sectionId, rollNo: 1 } });
    expect((await prisma.mark.findFirstOrThrow({ where: { studentId: stu.id, subjectId: eng.id } })).theoryMarks).toBe(19);
  });
});

describe("anything ambiguous blocks applying, and nothing is written", () => {
  const expectBlocked = async (data: ImportData, pattern: RegExp, opts = OPTS) => {
    const before = await counts();
    const plan = await buildPlan(prisma, { sectionId, examName }, data, opts);
    expect(plan.problems.join("\n")).toMatch(pattern);
    await expect(applyPlan(prisma, { sectionId, examName }, data, opts)).rejects.toThrow(/Not applying/);
    expect(await counts()).toEqual(before);
  };

  it("a roll number held by a different student", async () => {
    await createTestStudent(sectionId, { name: "Someone Else", rollNo: 2 });
    await expectBlocked(DATA, /Roll 2 is already "Someone Else"/);
  });

  it("the same student under a different roll number", async () => {
    await createTestStudent(sectionId, { name: "Sudash Budha", rollNo: 9 });
    await expectBlocked(DATA, /"Sudash Budha" is already in this section with roll 9/);
  });

  it("a subject whose full marks differ from the sheet", async () => {
    await prisma.subject.update({ where: { name_gradeId: { name: "English", gradeId: ctx.grade.id } }, data: { fullTheoryMarks: 100 } });
    await expectBlocked(DATA, /English" has full marks 100/);
  });

  it("a mark above full marks, and a negative mark", async () => {
    const bad: ImportData = { ...DATA, rows: [{ ...DATA.rows[0], marks: { ...DATA.rows[0].marks, English: 51, Math: -1 } }, DATA.rows[1], DATA.rows[2]] };
    await expectBlocked(bad, /above full marks 50/);
    await expectBlocked(bad, /not a valid mark/);
  });

  it("a roll number listed twice in the sheet", async () => {
    await expectBlocked({ ...DATA, rows: [DATA.rows[0], { ...DATA.rows[1], rollNo: 1 }] }, /Roll number 1 appears twice/);
  });
});

describe("isolation", () => {
  it("leaves other sections and other schools alone", async () => {
    const otherSection = await createTestSection(ctx.grade.id, { name: "B" });
    const keep = await createTestStudent(otherSection.id, { name: "Keep Me", rollNo: 1 });
    const otherSchoolStudent = await createTestStudent(otherCtx.section.id, { name: "Aasish Kami", rollNo: 1 });
    await applyPlan(prisma, { sectionId, examName }, DATA, OPTS);
    expect(await prisma.mark.count({ where: { studentId: { in: [keep.id, otherSchoolStudent.id] } } })).toBe(0);
    expect(await prisma.student.count({ where: { sectionId: otherSection.id } })).toBe(1);
    expect(await prisma.student.count({ where: { sectionId: otherCtx.section.id } })).toBe(1);
    expect(await prisma.subject.count({ where: { gradeId: otherCtx.grade.id } })).toBe(0);
  });

  it("an exam of another school's year cannot be used", async () => {
    // Only the exam inside this section's own academic year is looked up.
    await prisma.examType.deleteMany({ where: { academicYearId: ctx.year.id } });
    await expect(buildPlan(prisma, { sectionId, examName }, DATA, OPTS)).rejects.toThrow(/No exam called/);
  });
});
