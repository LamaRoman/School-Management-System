/**
 * Student Integration Tests
 *
 * Tests student CRUD, multi-tenancy data isolation, role-based access,
 * search functionality, and input validation.
 */

import request from "supertest";
import {
  app,
  prisma,
  cleanDatabase,
  disconnectDatabase,
  seedSchoolContext,
  createTestSchool,
  createTestUser,
  createTestAcademicYear,
  createTestGrade,
  createTestSection,
  createTestStudent,
  createTestTeacher,
  loginAs,
  authHeader,
} from "../helpers";

// ─── Shared state ───────────────────────────────────────
let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({
    schoolName: "Student Test School",
    schoolCode: "STS",
    yearBS: "2081",
    gradeName: "Grade I",
    sectionName: "A",
    studentName: "Existing Student",
    adminEmail: "admin@studenttest.com",
    adminPassword: "Test@123",
  });
  const loginResult = await loginAs("admin@studenttest.com");
  adminToken = loginResult.token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

// ─── CREATE STUDENT ─────────────────────────────────────────────────────────────

describe("POST /students", () => {
  it("should create a student (admin only)", async () => {
    const res = await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({
        name: "New Student",
        sectionId: ctx.section.id,
        gender: "Female",
        fatherName: "Father Name",
        guardianPhone: "9801234567",
        address: "Kathmandu",
      })
      .expect(201);

    expect(res.body.data.name).toBe("New Student");
    expect(res.body.data.sectionId).toBe(ctx.section.id);
    expect(res.body.data.gender).toBe("Female");
  });

  it("should auto-create a user account for the student", async () => {
    const res = await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({
        name: "Auto Account Student",
        sectionId: ctx.section.id,
      })
      .expect(201);

    // Check that a user account was created for this student
    const user = await prisma.user.findFirst({
      where: { studentId: res.body.data.id },
    });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("STUDENT");
  });

  it("should reject student creation with empty name", async () => {
    await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({
        name: "",
        sectionId: ctx.section.id,
      })
      .expect(400);
  });

  it("should reject student creation with missing sectionId", async () => {
    await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({
        name: "No Section Student",
      })
      .expect(400);
  });

  it("should reject when section belongs to another school", async () => {
    // Create a section in a different school
    const otherSchool = await createTestSchool({ name: "Other School", code: "OS2" });
    const otherYear = await createTestAcademicYear(otherSchool.id, { yearBS: "2081" });
    const otherGrade = await createTestGrade(otherYear.id, { name: "Grade I" });
    const otherSection = await createTestSection(otherGrade.id, { name: "A" });

    await request(app)
      .post("/students")
      .set("Authorization", authHeader(adminToken))
      .send({
        name: "Cross School Student",
        sectionId: otherSection.id,
      })
      .expect(404); // verifySection fails for wrong school
  });
});

// ─── LIST STUDENTS ──────────────────────────────────────────────────────────────

describe("GET /students", () => {
  it("should list students for admin", async () => {
    const res = await request(app)
      .get("/students")
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    // All returned students should have section info
    for (const student of res.body.data) {
      expect(student).toHaveProperty("section");
      expect(student.section).toHaveProperty("grade");
    }
  });

  it("should filter by sectionId", async () => {
    const res = await request(app)
      .get("/students")
      .query({ sectionId: ctx.section.id })
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    for (const student of res.body.data) {
      expect(student.sectionId).toBe(ctx.section.id);
    }
  });

  it("should search by name (case-insensitive)", async () => {
    const res = await request(app)
      .get("/students")
      .query({ search: "existing" })
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((s: any) => s.name === "Existing Student")).toBe(true);
  });

  it("should return empty for non-matching search", async () => {
    const res = await request(app)
      .get("/students")
      .query({ search: "zzz_no_match_zzz" })
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(res.body.data.length).toBe(0);
  });
});

// ─── GET SINGLE STUDENT ─────────────────────────────────────────────────────────

describe("GET /students/:id", () => {
  it("should return student with marks and attendance", async () => {
    const res = await request(app)
      .get(`/students/${ctx.student.id}`)
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(res.body.data.id).toBe(ctx.student.id);
    expect(res.body.data.name).toBe("Existing Student");
    expect(res.body.data).toHaveProperty("section");
    expect(res.body.data).toHaveProperty("marks");
    expect(res.body.data).toHaveProperty("attendances");
  });

  it("should return 404 for non-existent student", async () => {
    await request(app)
      .get("/students/nonexistent-id-12345")
      .set("Authorization", authHeader(adminToken))
      .expect(404);
  });
});

// ─── UPDATE STUDENT ─────────────────────────────────────────────────────────────

describe("PUT /students/:id", () => {
  it("should update student fields", async () => {
    const res = await request(app)
      .put(`/students/${ctx.student.id}`)
      .set("Authorization", authHeader(adminToken))
      .send({
        name: "Updated Name",
        address: "Pokhara",
      })
      .expect(200);

    expect(res.body.data.name).toBe("Updated Name");
    expect(res.body.data.address).toBe("Pokhara");
  });
});

// ─── DELETE STUDENT ─────────────────────────────────────────────────────────────

describe("DELETE /students/:id", () => {
  let deleteStudentId: string;

  beforeAll(async () => {
    const student = await createTestStudent(ctx.section.id, {
      name: "Delete Me Student",
    });
    deleteStudentId = student.id;
  });

  it("should deactivate a student (admin only)", async () => {
    const res = await request(app)
      .delete(`/students/${deleteStudentId}`)
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    // Verify student is deactivated
    const student = await prisma.student.findUnique({ where: { id: deleteStudentId } });
    expect(student!.isActive).toBe(false);
  });
});

// ─── MULTI-TENANCY ISOLATION ────────────────────────────────────────────────────

describe("Multi-tenancy student isolation", () => {
  let otherAdminToken: string;
  let otherStudentId: string;

  beforeAll(async () => {
    const otherCtx = await seedSchoolContext({
      schoolName: "Isolated School",
      schoolCode: "ISO",
      yearBS: "2081",
      gradeName: "Grade I",
      sectionName: "A",
      studentName: "Other School Student",
      adminEmail: "admin@isolated.com",
      adminPassword: "Test@123",
    });
    otherStudentId = otherCtx.student.id;
    otherAdminToken = (await loginAs("admin@isolated.com")).token;
  });

  it("should not list other school's students", async () => {
    const res = await request(app)
      .get("/students")
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    const hasOtherStudent = res.body.data.some((s: any) => s.id === otherStudentId);
    expect(hasOtherStudent).toBe(false);
  });

  it("should not access other school's student by ID", async () => {
    await request(app)
      .get(`/students/${otherStudentId}`)
      .set("Authorization", authHeader(adminToken))
      .expect(404); // verifyStudent fails for wrong school
  });

  it("should not delete other school's student", async () => {
    await request(app)
      .delete(`/students/${otherStudentId}`)
      .set("Authorization", authHeader(adminToken))
      .expect(404);
  });
});

// ─── ROLE AUTHORIZATION ─────────────────────────────────────────────────────────

describe("Student role authorization", () => {
  let teacherToken: string;

  beforeAll(async () => {
    // Create a teacher with assignment to the test section
    const teacher = await createTestTeacher(ctx.school.id, {
      name: "Section Teacher",
    });
    await createTestUser(ctx.school.id, "TEACHER", {
      email: "teacher@studenttest.com",
      password: "Test@123",
      teacherId: teacher.id,
    });
    // Assign teacher to the test section
    await prisma.teacherAssignment.create({
      data: {
        teacherId: teacher.id,
        sectionId: ctx.section.id,
        isClassTeacher: true,
      },
    });
    teacherToken = (await loginAs("teacher@studenttest.com")).token;
  });

  it("should allow teacher to list students in assigned sections", async () => {
    const res = await request(app)
      .get("/students")
      .set("Authorization", authHeader(teacherToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    // All returned students should be in the teacher's assigned section
    for (const student of res.body.data) {
      expect(student.sectionId).toBe(ctx.section.id);
    }
  });

  it("should deny teacher from creating students", async () => {
    await request(app)
      .post("/students")
      .set("Authorization", authHeader(teacherToken))
      .send({
        name: "Teacher Created Student",
        sectionId: ctx.section.id,
      })
      .expect(403);
  });

  it("should deny teacher from deleting students", async () => {
    // Create a student to try to delete
    const student = await createTestStudent(ctx.section.id, { name: "Undeletable" });

    await request(app)
      .delete(`/students/${student.id}`)
      .set("Authorization", authHeader(teacherToken))
      .expect(403);
  });

  it("should deny unauthenticated access", async () => {
    await request(app)
      .get("/students")
      .expect(401);
  });
});
