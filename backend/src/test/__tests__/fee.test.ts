/**
 * Fee Integration Tests
 *
 * Tests fee category CRUD, fee structure assignment, bulk payments,
 * receipt generation, multi-tenancy isolation, and input validation.
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
  createTestFeeCategory,
  loginAs,
  authHeader,
} from "../helpers";

// ─── Shared state ───────────────────────────────────────
let ctx: Awaited<ReturnType<typeof seedSchoolContext>>;
let adminToken: string;

beforeAll(async () => {
  await cleanDatabase();
  ctx = await seedSchoolContext({
    schoolName: "Fee Test School",
    schoolCode: "FTS",
    yearBS: "2081",
    gradeName: "Grade I",
    sectionName: "A",
    studentName: "Ram Bahadur",
    adminEmail: "admin@feetest.com",
    adminPassword: "Test@123",
  });
  const loginResult = await loginAs("admin@feetest.com");
  adminToken = loginResult.token;
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

// ─── FEE CATEGORIES ─────────────────────────────────────────────────────────────

describe("Fee Categories CRUD", () => {
  let categoryId: string;

  it("should create a fee category", async () => {
    const res = await request(app)
      .post("/fees/categories")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Monthly Tuition", description: "Monthly school fees" })
      .expect(201);

    expect(res.body.data.name).toBe("Monthly Tuition");
    expect(res.body.data.schoolId).toBe(ctx.school.id);
    categoryId = res.body.data.id;
  });

  it("should list fee categories for the school", async () => {
    const res = await request(app)
      .get("/fees/categories")
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((c: any) => c.name === "Monthly Tuition")).toBe(true);
  });

  it("should update a fee category", async () => {
    const res = await request(app)
      .put(`/fees/categories/${categoryId}`)
      .set("Authorization", authHeader(adminToken))
      .send({ name: "Monthly Tuition Fee" })
      .expect(200);

    expect(res.body.data.name).toBe("Monthly Tuition Fee");
  });

  it("should soft-delete (deactivate) a fee category", async () => {
    const res = await request(app)
      .delete(`/fees/categories/${categoryId}`)
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(res.body.data.message).toMatch(/deactivated/i);

    // Category should no longer appear in active list
    const listRes = await request(app)
      .get("/fees/categories")
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(listRes.body.data.some((c: any) => c.id === categoryId)).toBe(false);
  });

  it("should reject category creation with empty name", async () => {
    await request(app)
      .post("/fees/categories")
      .set("Authorization", authHeader(adminToken))
      .send({ name: "" })
      .expect(400);
  });
});

// ─── FEE STRUCTURE ──────────────────────────────────────────────────────────────

describe("Fee Structure", () => {
  let structureCategoryId: string;

  beforeAll(async () => {
    const cat = await createTestFeeCategory(ctx.school.id, { name: "Structure Test Fee" });
    structureCategoryId = cat.id;
  });

  it("should create fee structures via bulk endpoint", async () => {
    const res = await request(app)
      .post("/fees/structure/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        academicYearId: ctx.year.id,
        gradeId: ctx.grade.id,
        entries: [
          {
            feeCategoryId: structureCategoryId,
            amount: 2500,
            frequency: "MONTHLY",
          },
        ],
      })
      .expect(201);

    expect(res.body.data.message).toMatch(/1 fee structure/i);
  });

  it("should list fee structures filtered by academic year", async () => {
    const res = await request(app)
      .get("/fees/structure")
      .query({ academicYearId: ctx.year.id })
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject amount exceeding 500,000", async () => {
    const bigCat = await createTestFeeCategory(ctx.school.id, { name: "Too Expensive" });

    await request(app)
      .post("/fees/structure/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        academicYearId: ctx.year.id,
        gradeId: ctx.grade.id,
        entries: [
          {
            feeCategoryId: bigCat.id,
            amount: 600_000,
            frequency: "MONTHLY",
          },
        ],
      })
      .expect(400);
  });
});

// ─── BULK PAYMENTS ──────────────────────────────────────────────────────────────

describe("Bulk Payments + Receipts", () => {
  let paymentCategoryId: string;

  beforeAll(async () => {
    const cat = await createTestFeeCategory(ctx.school.id, { name: "Payment Test Fee" });
    paymentCategoryId = cat.id;
  });

  it("should create bulk payments and generate a receipt number", async () => {
    const res = await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/01/15",
        paymentMethod: "CASH",
        items: [
          { feeCategoryId: paymentCategoryId, amount: 2500, paidMonth: "Baisakh" },
        ],
      })
      .expect(201);

    expect(res.body.data.receiptNumber).toMatch(/^RCP-FTS-/);
    expect(res.body.data.totalAmount).toBe(2500);
  });

  it("should generate unique receipt numbers for each payment", async () => {
    const res1 = await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/02/15",
        items: [{ feeCategoryId: paymentCategoryId, amount: 2500, paidMonth: "Jestha" }],
      })
      .expect(201);

    const res2 = await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/03/15",
        items: [{ feeCategoryId: paymentCategoryId, amount: 2500, paidMonth: "Ashadh" }],
      })
      .expect(201);

    expect(res1.body.data.receiptNumber).not.toBe(res2.body.data.receiptNumber);
  });

  it("should accept multiple items in a single bulk payment", async () => {
    const cat2 = await createTestFeeCategory(ctx.school.id, { name: "Transport Fee" });

    const res = await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/04/15",
        items: [
          { feeCategoryId: paymentCategoryId, amount: 2500, paidMonth: "Shrawan" },
          { feeCategoryId: cat2.id, amount: 1500, paidMonth: "Shrawan" },
        ],
      })
      .expect(201);

    expect(res.body.data.totalAmount).toBe(4000);
    expect(res.body.data.receiptNumber).toBeDefined();
  });

  it("should reject empty items array", async () => {
    await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/05/15",
        items: [],
      })
      .expect(400);
  });

  it("should reject items array exceeding max(50)", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      feeCategoryId: paymentCategoryId,
      amount: 100,
      paidMonth: "Baisakh",
    }));

    await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/05/15",
        items,
      })
      .expect(400);
  });

  it("should reject payment amount exceeding 500,000", async () => {
    await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(adminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/05/15",
        items: [
          { feeCategoryId: paymentCategoryId, amount: 600_000, paidMonth: "Baisakh" },
        ],
      })
      .expect(400);
  });
});

// ─── PAYMENT LISTING + SOFT DELETE ──────────────────────────────────────────────

describe("Payment listing and soft delete", () => {
  it("should list payments for a student", async () => {
    const res = await request(app)
      .get("/fees/payments")
      .query({ studentId: ctx.student.id, academicYearId: ctx.year.id })
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("should soft-delete a payment", async () => {
    // Find a payment to delete
    const payments = await prisma.feePayment.findMany({
      where: { studentId: ctx.student.id, deletedAt: null },
      take: 1,
    });
    expect(payments.length).toBeGreaterThan(0);

    const res = await request(app)
      .delete(`/fees/payments/${payments[0].id}`)
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(res.body.data.message).toMatch(/soft-deleted/i);

    // Verify it's marked as deleted in DB
    const deleted = await prisma.feePayment.findUnique({ where: { id: payments[0].id } });
    expect(deleted!.deletedAt).not.toBeNull();
  });
});

// ─── MULTI-TENANCY ISOLATION ────────────────────────────────────────────────────

describe("Multi-tenancy isolation", () => {
  let otherSchoolAdminToken: string;
  let otherSchoolCategoryId: string;

  beforeAll(async () => {
    // Create a completely separate school
    const otherSchool = await createTestSchool({ name: "Other School", code: "OTH" });
    const otherAdmin = await createTestUser(otherSchool.id, "ADMIN", {
      email: "admin@otherschool.com",
      password: "Test@123",
    });
    // Create a category in the other school
    const otherCat = await createTestFeeCategory(otherSchool.id, { name: "Other School Fee" });
    otherSchoolCategoryId = otherCat.id;

    const loginResult = await loginAs("admin@otherschool.com");
    otherSchoolAdminToken = loginResult.token;
  });

  it("should not see other school's fee categories", async () => {
    const res = await request(app)
      .get("/fees/categories")
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    // Should not contain the other school's category
    const hasOtherCategory = res.body.data.some((c: any) => c.id === otherSchoolCategoryId);
    expect(hasOtherCategory).toBe(false);
  });

  it("should not be able to modify other school's category", async () => {
    // Try to update the first school's category using other school's admin token
    const firstSchoolCategories = await prisma.feeCategory.findMany({
      where: { schoolId: ctx.school.id },
    });

    if (firstSchoolCategories.length > 0) {
      await request(app)
        .put(`/fees/categories/${firstSchoolCategories[0].id}`)
        .set("Authorization", authHeader(otherSchoolAdminToken))
        .send({ name: "Hacked Category" })
        .expect(404); // findFirstOrThrow with wrong schoolId → 404
    }
  });

  it("should not be able to create payments for other school's student", async () => {
    const otherCat = await prisma.feeCategory.findFirst({
      where: { schoolId: ctx.school.id },
    });

    // Other school admin tries to pay for first school's student
    await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(otherSchoolAdminToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/01/15",
        items: [{ feeCategoryId: otherCat?.id, amount: 100 }],
      })
      .expect(404); // verifyStudent fails for wrong school
  });
});

// ─── ROLE AUTHORIZATION ─────────────────────────────────────────────────────────

describe("Fee role authorization", () => {
  let teacherToken: string;
  let accountantToken: string;

  beforeAll(async () => {
    await createTestUser(ctx.school.id, "TEACHER", {
      email: "teacher@feetest.com",
      password: "Test@123",
    });
    await createTestUser(ctx.school.id, "ACCOUNTANT", {
      email: "accountant@feetest.com",
      password: "Test@123",
    });
    teacherToken = (await loginAs("teacher@feetest.com")).token;
    accountantToken = (await loginAs("accountant@feetest.com")).token;
  });

  it("should allow ACCOUNTANT to view fee categories", async () => {
    await request(app)
      .get("/fees/categories")
      .set("Authorization", authHeader(accountantToken))
      .expect(200);
  });

  it("should deny ACCOUNTANT from creating fee categories", async () => {
    await request(app)
      .post("/fees/categories")
      .set("Authorization", authHeader(accountantToken))
      .send({ name: "Accountant Category" })
      .expect(403);
  });

  it("should allow ACCOUNTANT to create payments", async () => {
    const cat = await createTestFeeCategory(ctx.school.id, { name: "Acct Payment Test" });

    const res = await request(app)
      .post("/fees/payments/bulk")
      .set("Authorization", authHeader(accountantToken))
      .send({
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        paymentDate: "2081/06/15",
        items: [{ feeCategoryId: cat.id, amount: 1000, paidMonth: "Kartik" }],
      })
      .expect(201);

    expect(res.body.data.receiptNumber).toBeDefined();
  });

  it("should deny TEACHER from accessing fee endpoints", async () => {
    await request(app)
      .get("/fees/categories")
      .set("Authorization", authHeader(teacherToken))
      .expect(403);
  });
});

// ─── NEPALI MONTHS ──────────────────────────────────────────────────────────────

describe("GET /fees/months", () => {
  it("should return list of Nepali months", async () => {
    const res = await request(app)
      .get("/fees/months")
      .set("Authorization", authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toContain("Baisakh");
    expect(res.body.data).toContain("Chaitra");
    expect(res.body.data.length).toBe(12);
  });
});
