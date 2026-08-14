/**
 * Bulk-write isolation tests (S2, S3)
 *
 * Both endpoints verify their scalar ids but historically took the ids *inside*
 * their array payloads on trust, letting a caller write rows onto students
 * belonging to another school. These pin the membership checks.
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

// School A
let yearId: string;
let sectionAId: string;
let sectionBId: string;
let studentAId: string;
let studentBId: string; // same school, different section
let examTypeId: string;
let categoryId: string;

// A second year in School A, with its own exam type — for the mismatch check
let otherYearId: string;
let otherYearExamTypeId: string;

// School B — untouchable
let foreignStudentId: string;
let foreignCategoryId: string;

beforeAll(async () => {
  await cleanDatabase();

  const schoolA = await createTestSchool({ name: "Bulk School A", code: "BSA" });
  const year = await createTestAcademicYear(schoolA.id, { yearBS: "2081" });
  yearId = year.id;

  const grade = await createTestGrade(year.id, { name: "Grade I", displayOrder: 1 });
  sectionAId = (await createTestSection(grade.id, { name: "A" })).id;
  sectionBId = (await createTestSection(grade.id, { name: "B" })).id;
  studentAId = (await createTestStudent(sectionAId, { name: "Student A", rollNo: 1 })).id;
  studentBId = (await createTestStudent(sectionBId, { name: "Student B", rollNo: 1 })).id;

  examTypeId = (await prisma.examType.create({
    data: { name: "First Terminal", academicYearId: year.id, displayOrder: 1 },
  })).id;
  categoryId = (await prisma.observationCategory.create({
    data: { name: "Punctuality", gradeId: grade.id },
  })).id;

  // Second year in the same school
  const otherYear = await createTestAcademicYear(schoolA.id, { yearBS: "2082", isActive: false });
  otherYearId = otherYear.id;
  otherYearExamTypeId = (await prisma.examType.create({
    data: { name: "First Terminal", academicYearId: otherYear.id, displayOrder: 1 },
  })).id;

  await createTestUser(schoolA.id, "ADMIN", { email: "admin@bulktest.com", password: "Test@123" });
  adminToken = (await loginAs("admin@bulktest.com")).token;

  // School B
  const schoolB = await createTestSchool({ name: "Bulk School B", code: "BSB" });
  const foreignYear = await createTestAcademicYear(schoolB.id, { yearBS: "2081" });
  const foreignGrade = await createTestGrade(foreignYear.id, { name: "Grade I", displayOrder: 1 });
  const foreignSection = await createTestSection(foreignGrade.id, { name: "A" });
  foreignStudentId = (await createTestStudent(foreignSection.id, { name: "Foreign Student" })).id;
  foreignCategoryId = (await prisma.observationCategory.create({
    data: { name: "Punctuality", gradeId: foreignGrade.id },
  })).id;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

// ─── S2: daily attendance ───────────────────────────────

describe("POST /daily-attendance/bulk — student membership", () => {
  const save = (body: Record<string, unknown>) =>
    request(app).post("/daily-attendance/bulk").set("Authorization", authHeader(adminToken)).send(body);

  it("refuses attendance for a student from another school", async () => {
    await save({
      sectionId: sectionAId,
      date: "2081/01/01",
      academicYearId: yearId,
      records: [{ studentId: foreignStudentId, status: "ABSENT" }],
    }).expect(400);

    const written = await prisma.dailyAttendance.count({ where: { studentId: foreignStudentId } });
    expect(written).toBe(0);
  });

  it("refuses attendance for a student in a different section of the same school", async () => {
    // This is the client-side race backstop: the page shows section A but saves
    // a roster from section B.
    await save({
      sectionId: sectionAId,
      date: "2081/01/02",
      academicYearId: yearId,
      records: [{ studentId: studentBId, status: "ABSENT" }],
    }).expect(400);

    const written = await prisma.dailyAttendance.count({ where: { studentId: studentBId } });
    expect(written).toBe(0);
  });

  it("rejects the whole batch when only one record is foreign", async () => {
    await save({
      sectionId: sectionAId,
      date: "2081/01/03",
      academicYearId: yearId,
      records: [
        { studentId: studentAId, status: "PRESENT" },
        { studentId: foreignStudentId, status: "ABSENT" },
      ],
    }).expect(400);

    const written = await prisma.dailyAttendance.count({
      where: { studentId: studentAId, date: "2081/01/03" },
    });
    expect(written).toBe(0);
  });

  it("still saves a legitimate roster and recomputes totals", async () => {
    await save({
      sectionId: sectionAId,
      date: "2081/01/04",
      academicYearId: yearId,
      records: [{ studentId: studentAId, status: "PRESENT" }],
    }).expect(200);

    const row = await prisma.dailyAttendance.findFirstOrThrow({
      where: { studentId: studentAId, date: "2081/01/04" },
    });
    expect(row.status).toBe("PRESENT");

    const totals = await prisma.attendance.findFirstOrThrow({
      where: { studentId: studentAId, academicYearId: yearId },
    });
    expect(totals.presentDays).toBe(1);
  });
});

// ─── S3: observations ───────────────────────────────────

describe("POST /observations/results/bulk — student and category membership", () => {
  const save = (body: Record<string, unknown>) =>
    request(app).post("/observations/results/bulk").set("Authorization", authHeader(adminToken)).send(body);

  it("refuses to grade a student from another school", async () => {
    await save({
      examTypeId,
      academicYearId: yearId,
      entries: [{ studentId: foreignStudentId, categoryId, grade: "A" }],
    }).expect(400);

    expect(await prisma.observationResult.count({ where: { studentId: foreignStudentId } })).toBe(0);
  });

  it("refuses a category belonging to another school", async () => {
    await save({
      examTypeId,
      academicYearId: yearId,
      entries: [{ studentId: studentAId, categoryId: foreignCategoryId, grade: "A" }],
    }).expect(400);

    expect(await prisma.observationResult.count({ where: { categoryId: foreignCategoryId } })).toBe(0);
  });

  it("refuses an exam type from a different academic year than the one given", async () => {
    await save({
      examTypeId: otherYearExamTypeId,
      academicYearId: yearId,
      entries: [{ studentId: studentAId, categoryId, grade: "A" }],
    }).expect(400);

    expect(
      await prisma.observationResult.count({ where: { examTypeId: otherYearExamTypeId } }),
    ).toBe(0);
  });

  it("rejects the whole batch when only one entry is foreign", async () => {
    await save({
      examTypeId,
      academicYearId: yearId,
      entries: [
        { studentId: studentAId, categoryId, grade: "A" },
        { studentId: foreignStudentId, categoryId, grade: "B" },
      ],
    }).expect(400);

    expect(await prisma.observationResult.count({ where: { studentId: studentAId } })).toBe(0);
  });

  it("still saves a legitimate batch", async () => {
    await save({
      examTypeId,
      academicYearId: yearId,
      entries: [{ studentId: studentAId, categoryId, grade: "A" }],
    }).expect(200);

    const row = await prisma.observationResult.findFirstOrThrow({
      where: { studentId: studentAId, categoryId, examTypeId, academicYearId: yearId },
    });
    expect(row.grade).toBe("A");
  });
});
