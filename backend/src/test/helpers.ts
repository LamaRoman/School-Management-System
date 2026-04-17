/**
 * Test Helpers for Zentara Shikshya Backend
 *
 * Provides:
 * - cleanDatabase()      — truncates all tables between test suites
 * - Factory functions     — create test entities with sensible defaults
 * - loginAs()            — authenticate via supertest and return tokens
 * - authHeader()         — build Authorization header from token
 */

import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../app";
import prisma from "../utils/prisma";

// ─── Database cleanup ───────────────────────────────────
// Truncate all tables in reverse-FK order. Uses raw SQL for speed.
// This runs between test suites (beforeAll), NOT between individual tests,
// to keep the test suite fast.

export async function cleanDatabase(): Promise<void> {
  // Order matters: children before parents to avoid FK violations.
  // $transaction ensures atomicity.
  await prisma.$transaction([
    // Auth / security tables
    prisma.tokenBlocklist.deleteMany(),
    prisma.loginAttempt.deleteMany(),
    prisma.refreshToken.deleteMany(),

    // Audit
    prisma.auditLog.deleteMany(),

    // Fee tables
    prisma.feePayment.deleteMany(),
    prisma.studentFeeAssignment.deleteMany(),
    prisma.studentFeeOverride.deleteMany(),
    prisma.feeStructure.deleteMany(),
    prisma.receiptCounter.deleteMany(),
    prisma.feeCategory.deleteMany(),

    // Parent-student links
    prisma.parentStudent.deleteMany(),

    // Academic tables
    prisma.seatAllocation.deleteMany(),
    prisma.examRoom.deleteMany(),
    prisma.examRoutine.deleteMany(),
    prisma.observationResult.deleteMany(),
    prisma.observationCategory.deleteMany(),
    prisma.dailyAttendance.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.consolidatedResult.deleteMany(),
    prisma.mark.deleteMany(),
    prisma.homework.deleteMany(),
    prisma.admission.deleteMany(),
    prisma.notice.deleteMany(),
    prisma.gradingPolicy.deleteMany(),
    prisma.teacherAssignment.deleteMany(),

    // Core entities (must come after their dependents)
    prisma.user.deleteMany(),
    prisma.student.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.section.deleteMany(),
    prisma.examType.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.teacher.deleteMany(),
    prisma.reportCardSettings.deleteMany(),
    prisma.academicYear.deleteMany(),
    prisma.school.deleteMany(),
  ]);
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

// ─── Factory functions ──────────────────────────────────
// Every factory returns the created Prisma record.
// All take optional overrides so tests can customize specific fields.

let schoolCounter = 0;

export async function createTestSchool(overrides: Partial<{
  name: string;
  code: string;
  address: string;
}> = {}) {
  schoolCounter++;
  return prisma.school.create({
    data: {
      name: overrides.name ?? `Test School ${schoolCounter}`,
      code: overrides.code ?? `TS${schoolCounter}`,
      address: overrides.address ?? "Kathmandu",
    },
  });
}

export async function createTestUser(
  schoolId: string | null,
  role: "SUPER_ADMIN" | "ADMIN" | "ACCOUNTANT" | "TEACHER" | "STUDENT" | "PARENT",
  overrides: Partial<{
    email: string;
    password: string;
    isActive: boolean;
    studentId: string;
    teacherId: string;
  }> = {},
) {
  const email = overrides.email ?? `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const plainPassword = overrides.password ?? "Test@123";
  const hashedPassword = await bcrypt.hash(plainPassword, 4); // low rounds for speed

  return prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role,
      schoolId,
      isActive: overrides.isActive ?? true,
      studentId: overrides.studentId ?? undefined,
      teacherId: overrides.teacherId ?? undefined,
    },
  });
}

export async function createTestAcademicYear(
  schoolId: string,
  overrides: Partial<{
    yearBS: string;
    isActive: boolean;
  }> = {},
) {
  return prisma.academicYear.create({
    data: {
      schoolId,
      yearBS: overrides.yearBS ?? "2081",
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createTestGrade(
  academicYearId: string,
  overrides: Partial<{
    name: string;
    displayOrder: number;
  }> = {},
) {
  return prisma.grade.create({
    data: {
      name: overrides.name ?? "Grade I",
      displayOrder: overrides.displayOrder ?? 1,
      academicYearId,
    },
  });
}

export async function createTestSection(
  gradeId: string,
  overrides: Partial<{ name: string }> = {},
) {
  return prisma.section.create({
    data: {
      name: overrides.name ?? "A",
      gradeId,
    },
  });
}

export async function createTestStudent(
  sectionId: string,
  overrides: Partial<{
    name: string;
    rollNo: number;
    gender: string;
  }> = {},
) {
  return prisma.student.create({
    data: {
      name: overrides.name ?? "Test Student",
      sectionId,
      rollNo: overrides.rollNo ?? undefined,
      gender: overrides.gender ?? "Male",
    },
  });
}

export async function createTestFeeCategory(
  schoolId: string,
  overrides: Partial<{
    name: string;
    description: string;
  }> = {},
) {
  return prisma.feeCategory.create({
    data: {
      schoolId,
      name: overrides.name ?? `Fee Category ${Date.now()}`,
      description: overrides.description ?? undefined,
    },
  });
}

export async function createTestTeacher(
  schoolId: string,
  overrides: Partial<{
    name: string;
    email: string;
  }> = {},
) {
  return prisma.teacher.create({
    data: {
      schoolId,
      name: overrides.name ?? "Test Teacher",
      email: overrides.email ?? undefined,
    },
  });
}

// ─── Auth helpers ───────────────────────────────────────

/**
 * Login via supertest and return { token, refreshToken, cookies, body }.
 * The `cookies` string can be set on subsequent requests to use cookie auth.
 */
export async function loginAs(email: string, password: string = "Test@123") {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password })
    .expect(200);

  const token: string = res.body.data.token;
  const refreshToken: string | undefined = res.body.data.refreshToken;

  // Extract Set-Cookie headers for cookie-based auth
  const cookies = res.headers["set-cookie"];

  return { token, refreshToken, cookies, body: res.body.data };
}

/**
 * Build an Authorization header value.
 */
export function authHeader(token: string): string {
  return `Bearer ${token}`;
}

// ─── Seed a full school context ─────────────────────────
// Creates school → academic year → grade → section → student → admin user.
// Returns everything needed for most integration tests.

export async function seedSchoolContext(overrides: Partial<{
  schoolName: string;
  schoolCode: string;
  yearBS: string;
  gradeName: string;
  sectionName: string;
  studentName: string;
  adminEmail: string;
  adminPassword: string;
}> = {}) {
  const school = await createTestSchool({
    name: overrides.schoolName,
    code: overrides.schoolCode,
  });
  const year = await createTestAcademicYear(school.id, {
    yearBS: overrides.yearBS,
  });
  const grade = await createTestGrade(year.id, {
    name: overrides.gradeName,
  });
  const section = await createTestSection(grade.id, {
    name: overrides.sectionName,
  });
  const student = await createTestStudent(section.id, {
    name: overrides.studentName,
  });

  const adminPassword = overrides.adminPassword ?? "Test@123";
  const admin = await createTestUser(school.id, "ADMIN", {
    email: overrides.adminEmail,
    password: adminPassword,
  });

  return { school, year, grade, section, student, admin, adminPassword };
}

// Re-export for convenience
export { app, prisma };
