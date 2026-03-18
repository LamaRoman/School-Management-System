import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Schema reference:
//   FeeCategory { id, name, description?, isActive }
//   FeeStructure { id, feeCategoryId, gradeId, academicYearId, amount, frequency }
//   StudentFeeOverride { id, studentId, feeCategoryId, academicYearId, overrideAmount, reason? }
//   FeePayment { id, studentId, feeCategoryId, academicYearId, amount, paidMonth?, receiptNumber?, paymentDate, paymentMethod?, remarks? }

// Nepali months for monthly fees
const nepaliMonths = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

// ─── FEE CATEGORIES ─────────────────────────────────────

// GET /api/fees/categories
router.get("/categories", authenticate, async (_req, res) => {
  const categories = await prisma.feeCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  res.json({ data: categories });
});

// POST /api/fees/categories
router.post("/categories", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  });
  const data = schema.parse(req.body);
  const category = await prisma.feeCategory.create({ data });
  res.status(201).json({ data: category });
});

// PUT /api/fees/categories/:id
router.put("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  });
  const data = schema.parse(req.body);
  const category = await prisma.feeCategory.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ data: category });
});

// DELETE /api/fees/categories/:id (soft delete)
router.delete("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.feeCategory.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ data: { message: "Category deactivated" } });
});

// ─── FEE STRUCTURE ──────────────────────────────────────

// GET /api/fees/structure?academicYearId=xxx&gradeId=xxx
router.get("/structure", authenticate, async (req, res) => {
  const { academicYearId, gradeId } = req.query;
  const where: any = {};
  if (academicYearId) where.academicYearId = String(academicYearId);
  if (gradeId) where.gradeId = String(gradeId);

  const structures = await prisma.feeStructure.findMany({
    where,
    include: {
      feeCategory: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true } },
    },
    orderBy: [{ grade: { displayOrder: "asc" } }, { feeCategory: { name: "asc" } }],
  });
  res.json({ data: structures });
});

// POST /api/fees/structure/bulk — set fee structure for a grade (replaces existing)
router.post("/structure/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    academicYearId: z.string().min(1),
    gradeId: z.string().min(1),
    entries: z.array(z.object({
      feeCategoryId: z.string().min(1),
      amount: z.number().min(0),
      frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME"]),
    })),
  });

  const { academicYearId, gradeId, entries } = schema.parse(req.body);

  // Delete existing structure for this grade + year
  await prisma.feeStructure.deleteMany({
    where: { academicYearId, gradeId },
  });

  const created = await prisma.$transaction(
    entries.map((e) =>
      prisma.feeStructure.create({
        data: {
          feeCategoryId: e.feeCategoryId,
          gradeId,
          academicYearId,
          amount: e.amount,
          frequency: e.frequency,
        },
      })
    )
  );

  res.status(201).json({ data: { message: `Fee structure saved for ${created.length} categories` } });
});

// ─── STUDENT FEE OVERRIDES ──────────────────────────────

// GET /api/fees/overrides?studentId=xxx&academicYearId=xxx
router.get("/overrides", authenticate, async (req, res) => {
  const { studentId, academicYearId } = req.query;
  const where: any = {};
  if (studentId) where.studentId = String(studentId);
  if (academicYearId) where.academicYearId = String(academicYearId);

  const overrides = await prisma.studentFeeOverride.findMany({
    where,
    include: {
      feeCategory: { select: { id: true, name: true } },
      student: { select: { id: true, name: true } },
    },
  });
  res.json({ data: overrides });
});

// POST /api/fees/overrides
router.post("/overrides", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    feeCategoryId: z.string().min(1),
    academicYearId: z.string().min(1),
    overrideAmount: z.number().min(0),
    reason: z.string().optional(),
  });

  const data = schema.parse(req.body);

  const override = await prisma.studentFeeOverride.upsert({
    where: {
      studentId_feeCategoryId_academicYearId: {
        studentId: data.studentId,
        feeCategoryId: data.feeCategoryId,
        academicYearId: data.academicYearId,
      },
    },
    update: { overrideAmount: data.overrideAmount, reason: data.reason },
    create: data,
  });

  res.json({ data: override });
});

// DELETE /api/fees/overrides/:id
router.delete("/overrides/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.studentFeeOverride.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Override removed" } });
});

// ─── PAYMENTS ───────────────────────────────────────────

// GET /api/fees/payments?studentId=xxx&academicYearId=xxx&feeCategoryId=xxx
router.get("/payments", authenticate, async (req, res) => {
  const { studentId, academicYearId, feeCategoryId } = req.query;
  const where: any = {};
  if (studentId) where.studentId = String(studentId);
  if (academicYearId) where.academicYearId = String(academicYearId);
  if (feeCategoryId) where.feeCategoryId = String(feeCategoryId);

  const payments = await prisma.feePayment.findMany({
    where,
    include: {
      student: { select: { id: true, name: true, rollNo: true } },
      feeCategory: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ data: payments });
});

// POST /api/fees/payments — record a payment
router.post("/payments", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    feeCategoryId: z.string().min(1),
    academicYearId: z.string().min(1),
    amount: z.number().min(0),
    paidMonth: z.string().optional(),
    receiptNumber: z.string().optional(),
    paymentDate: z.string().min(1),
    paymentMethod: z.string().optional(),
    remarks: z.string().optional(),
  });

  const data = schema.parse(req.body);

  // Auto-generate receipt number if not provided
  if (!data.receiptNumber) {
    const count = await prisma.feePayment.count({
      where: { academicYearId: data.academicYearId },
    });
    data.receiptNumber = `RCP-${String(count + 1).padStart(5, "0")}`;
  }

  const payment = await prisma.feePayment.create({
    data,
    include: {
      student: { select: { id: true, name: true } },
      feeCategory: { select: { id: true, name: true } },
    },
  });
  res.status(201).json({ data: payment });
});

// POST /api/fees/payments/bulk — record multiple monthly payments at once
router.post("/payments/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    academicYearId: z.string().min(1),
    paymentDate: z.string().min(1),
    paymentMethod: z.string().optional(),
    remarks: z.string().optional(),
    items: z.array(z.object({
      feeCategoryId: z.string().min(1),
      amount: z.number().min(0),
      paidMonth: z.string().optional(),
    })),
  });

  const { studentId, academicYearId, paymentDate, paymentMethod, remarks, items } = schema.parse(req.body);

  // Generate receipt number
  const count = await prisma.feePayment.count({
    where: { academicYearId },
  });
  const receiptNumber = `RCP-${String(count + 1).padStart(5, "0")}`;

  const created = await prisma.$transaction(
    items.map((item) =>
      prisma.feePayment.create({
        data: {
          studentId,
          feeCategoryId: item.feeCategoryId,
          academicYearId,
          amount: item.amount,
          paidMonth: item.paidMonth || null,
          receiptNumber,
          paymentDate,
          paymentMethod: paymentMethod || null,
          remarks: remarks || null,
        },
      })
    )
  );

  res.status(201).json({
    data: {
      message: `${created.length} payments recorded`,
      receiptNumber,
      totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
    },
  });
});

// ─── DUES REPORT ────────────────────────────────────────

// GET /api/fees/dues?sectionId=xxx&academicYearId=xxx — get fee dues for all students in a section
router.get("/dues", authenticate, async (req, res) => {
  const { sectionId, academicYearId } = req.query;
  if (!sectionId || !academicYearId) {
    throw new AppError("sectionId and academicYearId are required");
  }

  const section = await prisma.section.findUniqueOrThrow({
    where: { id: String(sectionId) },
    include: { grade: true },
  });

  // Get fee structure for this grade
  const structures = await prisma.feeStructure.findMany({
    where: {
      gradeId: section.gradeId,
      academicYearId: String(academicYearId),
    },
    include: { feeCategory: true },
  });

  // Get students
  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true, status: "ACTIVE" },
    orderBy: { rollNo: "asc" },
  });

  // Get overrides for these students
  const overrides = await prisma.studentFeeOverride.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      academicYearId: String(academicYearId),
    },
  });

  // Get all payments for these students
  const payments = await prisma.feePayment.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      academicYearId: String(academicYearId),
    },
  });

  // Calculate dues per student
  const duesReport = students.map((student) => {
    const studentOverrides = overrides.filter((o) => o.studentId === student.id);
    const studentPayments = payments.filter((p) => p.studentId === student.id);

    let totalDue = 0;
    let totalPaid = 0;

    const categoryDues = structures.map((structure) => {
      const override = studentOverrides.find((o) => o.feeCategoryId === structure.feeCategoryId);
      const feeAmount = override ? override.overrideAmount : structure.amount;

      // Calculate total due based on frequency
      let annualDue = 0;
      if (structure.frequency === "MONTHLY") annualDue = feeAmount * 12;
      else if (structure.frequency === "QUARTERLY") annualDue = feeAmount * 4;
      else annualDue = feeAmount; // YEARLY or ONE_TIME

      const paid = studentPayments
        .filter((p) => p.feeCategoryId === structure.feeCategoryId)
        .reduce((sum, p) => sum + p.amount, 0);

      totalDue += annualDue;
      totalPaid += paid;

      return {
        categoryId: structure.feeCategoryId,
        categoryName: structure.feeCategory.name,
        frequency: structure.frequency,
        feeAmount,
        annualDue,
        paid,
        remaining: annualDue - paid,
        hasOverride: !!override,
      };
    });

    return {
      id: student.id,
      name: student.name,
      rollNo: student.rollNo,
      totalDue,
      totalPaid,
      totalRemaining: totalDue - totalPaid,
      categories: categoryDues,
    };
  });

  res.json({
    data: {
      grade: section.grade.name,
      section: section.name,
      students: duesReport,
    },
  });
});

// GET /api/fees/receipt/:paymentId — get receipt data
router.get("/receipt/:receiptNumber", authenticate, async (req, res) => {
  const { receiptNumber } = req.params;

  const payments = await prisma.feePayment.findMany({
    where: { receiptNumber },
    include: {
      student: {
        include: {
          section: {
            include: { grade: true },
          },
        },
      },
      feeCategory: true,
    },
  });

  if (payments.length === 0) {
    throw new AppError("Receipt not found", 404);
  }

  const school = await prisma.school.findFirst();
  const firstPayment = payments[0];

  res.json({
    data: {
      receiptNumber,
      school: school || {},
      student: {
        name: firstPayment.student.name,
        className: firstPayment.student.section.grade.name,
        section: firstPayment.student.section.name,
        rollNo: firstPayment.student.rollNo,
      },
      paymentDate: firstPayment.paymentDate,
      paymentMethod: firstPayment.paymentMethod,
      remarks: firstPayment.remarks,
      items: payments.map((p) => ({
        category: p.feeCategory.name,
        amount: p.amount,
        paidMonth: p.paidMonth,
      })),
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
    },
  });
});

// GET /api/fees/months — return nepali months list
router.get("/months", authenticate, async (_req, res) => {
  res.json({ data: nepaliMonths });
});

export default router;