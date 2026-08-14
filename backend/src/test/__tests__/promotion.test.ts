/**
 * Promotion Integration Tests
 *
 * Covers POST /promotion/promote: cross-school student isolation, within-school
 * grade membership, and all-or-nothing behaviour when a batch is partly invalid.
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

// School A — the school doing the promoting
let sourceYearId: string;
let targetYearId: string;
let srcGradeId: string;
let srcSectionId: string;
let nextSectionId: string;
let sameSectionId: string;

// A top grade in School A with no next grade in the target year, used to make a
// promotion fail partway through a batch.
let topGradeId: string;
let topSectionId: string;

// School B — an unrelated school whose students must be untouchable
let foreignStudentId: string;
let foreignSectionId: string;

beforeAll(async () => {
  await cleanDatabase();

  const schoolA = await createTestSchool({ name: "Promotion School A", code: "PSA" });
  const sourceYear = await createTestAcademicYear(schoolA.id, { yearBS: "2081" });
  const targetYear = await createTestAcademicYear(schoolA.id, { yearBS: "2082", isActive: false });
  sourceYearId = sourceYear.id;
  targetYearId = targetYear.id;

  const srcGrade = await createTestGrade(sourceYear.id, { name: "Grade I", displayOrder: 1 });
  const srcSection = await createTestSection(srcGrade.id, { name: "A" });
  srcGradeId = srcGrade.id;
  srcSectionId = srcSection.id;

  // Target year mirrors the source: same grade (for retention) + next grade (for promotion)
  const sameGrade = await createTestGrade(targetYear.id, { name: "Grade I", displayOrder: 1 });
  sameSectionId = (await createTestSection(sameGrade.id, { name: "A" })).id;
  const nextGrade = await createTestGrade(targetYear.id, { name: "Grade II", displayOrder: 2 });
  nextSectionId = (await createTestSection(nextGrade.id, { name: "A" })).id;

  // Highest grade — deliberately has no displayOrder+1 counterpart in the target year
  const topGrade = await createTestGrade(sourceYear.id, { name: "Grade X", displayOrder: 10 });
  topGradeId = topGrade.id;
  topSectionId = (await createTestSection(topGrade.id, { name: "A" })).id;

  await createTestUser(schoolA.id, "ADMIN", {
    email: "admin@promotiontest.com",
    password: "Test@123",
  });
  adminToken = (await loginAs("admin@promotiontest.com")).token;

  // School B, entirely separate
  const schoolB = await createTestSchool({ name: "Promotion School B", code: "PSB" });
  const foreignYear = await createTestAcademicYear(schoolB.id, { yearBS: "2081" });
  const foreignGrade = await createTestGrade(foreignYear.id, { name: "Grade I", displayOrder: 1 });
  const foreignSection = await createTestSection(foreignGrade.id, { name: "A" });
  foreignSectionId = foreignSection.id;
  foreignStudentId = (await createTestStudent(foreignSection.id, { name: "Foreign Student" })).id;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

const promote = (body: Record<string, unknown>) =>
  request(app).post("/promotion/promote").set("Authorization", authHeader(adminToken)).send(body);

describe("POST /promotion/promote — student membership", () => {
  it("refuses to graduate a student belonging to another school", async () => {
    await promote({
      sourceYearId,
      targetYearId,
      sourceGradeId: srcGradeId,
      promotions: [{ studentId: foreignStudentId, action: "GRADUATE" }],
    }).expect(400);

    const foreign = await prisma.student.findUniqueOrThrow({ where: { id: foreignStudentId } });
    expect(foreign.status).toBe("ACTIVE");
    expect(foreign.isActive).toBe(true);
  });

  it("refuses to pull another school's student into one of our sections", async () => {
    await promote({
      sourceYearId,
      targetYearId,
      sourceGradeId: srcGradeId,
      promotions: [{ studentId: foreignStudentId, action: "PROMOTE" }],
    }).expect(400);

    const foreign = await prisma.student.findUniqueOrThrow({ where: { id: foreignStudentId } });
    expect(foreign.sectionId).toBe(foreignSectionId);
  });

  it("refuses a student from a different grade in the same school", async () => {
    const otherGradeStudent = await createTestStudent(topSectionId, { name: "Wrong Grade" });

    await promote({
      sourceYearId,
      targetYearId,
      sourceGradeId: srcGradeId,
      promotions: [{ studentId: otherGradeStudent.id, action: "PROMOTE" }],
    }).expect(400);

    const after = await prisma.student.findUniqueOrThrow({ where: { id: otherGradeStudent.id } });
    expect(after.sectionId).toBe(topSectionId);
  });

  it("rejects the whole batch when only one student is foreign", async () => {
    const ours = await createTestStudent(srcSectionId, { name: "Legitimate Student" });

    await promote({
      sourceYearId,
      targetYearId,
      sourceGradeId: srcGradeId,
      promotions: [
        { studentId: ours.id, action: "PROMOTE" },
        { studentId: foreignStudentId, action: "GRADUATE" },
      ],
    }).expect(400);

    const after = await prisma.student.findUniqueOrThrow({ where: { id: ours.id } });
    expect(after.sectionId).toBe(srcSectionId);
  });
});

describe("POST /promotion/promote — atomicity", () => {
  it("writes nothing when a later entry in the batch cannot be resolved", async () => {
    // Grade X has no next grade in the target year, so the PROMOTE fails. The
    // GRADUATE ahead of it must not survive.
    const toGraduate = await createTestStudent(topSectionId, { name: "Graduating Student" });
    const toPromote = await createTestStudent(topSectionId, { name: "Unpromotable Student" });

    await promote({
      sourceYearId,
      targetYearId,
      sourceGradeId: topGradeId,
      promotions: [
        { studentId: toGraduate.id, action: "GRADUATE" },
        { studentId: toPromote.id, action: "PROMOTE" },
      ],
    }).expect(400);

    const graduated = await prisma.student.findUniqueOrThrow({ where: { id: toGraduate.id } });
    expect(graduated.status).toBe("ACTIVE");
    expect(graduated.isActive).toBe(true);
  });
});

describe("POST /promotion/promote — happy path", () => {
  it("promotes, retains and graduates students in one batch", async () => {
    const promoteMe = await createTestStudent(srcSectionId, { name: "Promote Me", rollNo: 11 });
    const retainMe = await createTestStudent(srcSectionId, { name: "Retain Me", rollNo: 12 });
    const graduateMe = await createTestStudent(srcSectionId, { name: "Graduate Me", rollNo: 13 });

    const res = await promote({
      sourceYearId,
      targetYearId,
      sourceGradeId: srcGradeId,
      promotions: [
        { studentId: promoteMe.id, action: "PROMOTE" },
        { studentId: retainMe.id, action: "RETAIN" },
        { studentId: graduateMe.id, action: "GRADUATE" },
      ],
    }).expect(200);

    expect(res.body.data).toMatchObject({ promoted: 1, retained: 1, graduated: 1 });

    const promoted = await prisma.student.findUniqueOrThrow({ where: { id: promoteMe.id } });
    expect(promoted.sectionId).toBe(nextSectionId);
    expect(promoted.status).toBe("ACTIVE");
    expect(promoted.rollNo).toBeNull();

    const retained = await prisma.student.findUniqueOrThrow({ where: { id: retainMe.id } });
    expect(retained.sectionId).toBe(sameSectionId);
    expect(retained.status).toBe("ACTIVE");

    const graduated = await prisma.student.findUniqueOrThrow({ where: { id: graduateMe.id } });
    expect(graduated.status).toBe("GRADUATED");
    expect(graduated.isActive).toBe(false);
  });
});
