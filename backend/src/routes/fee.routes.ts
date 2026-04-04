import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../utils/audit";

const router = Router();

const nepaliMonths = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyDiscount(
  amount: number,
  override?: { discountType: string; overrideAmount: number; discountPercent: number | null } | null,
): number {
  if (!override) return amount;
  if (override.discountType === "PERCENTAGE" && override.discountPercent !== null) {
    return amount * (1 - override.discountPercent / 100);
  }
  if (override.discountType === "FLAT") return override.overrideAmount;
  return amount;
}

/** Builds the earliest-exam-month map for a given grade's exam routines. */
function buildExamMonthMap(examRoutines: { examTypeId: string; examDate: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of examRoutines) {
    const parts = r.examDate.split("/");
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10);
      if (!map[r.examTypeId] || m < map[r.examTypeId]) map[r.examTypeId] = m;
    }
  }
  return map;
}

// ─── Shared invoice builder ───────────────────────────────────────────────────
//
// Used by both GET /invoice/:studentId and GET /invoices-bulk so the logic
// lives in exactly one place.

type FeeItem = {
  feeCategoryId: string;
  category: string;
  amount: number;
  paidMonth?: string;
};

type InvoiceResult = {
  student: { name: string; nameNp: string | null; className: string; section: string; rollNo: number | null };
  month: string;
  yearBS: string;
  arrearItems: FeeItem[];
  currentItems: FeeItem[];
  otherItems: FeeItem[];
  monthlyRates: { feeCategoryId: string; category: string; amount: number }[];
  advanceMonths: string[];
  totalArrears: number;
  totalCurrent: number;
  totalOther: number;
  grandTotal: number;
};

async function buildInvoice(
  studentId: string,
  academicYearId: string,
  month: string,
): Promise<InvoiceResult> {
  const monthIndex = nepaliMonths.indexOf(month);
  if (monthIndex === -1) throw new AppError("Invalid month");

  // Fetch everything in parallel
  const [student, academicYear, overrides, payments] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { section: { include: { grade: true } } },
    }),
    prisma.academicYear.findUnique({ where: { id: academicYearId } }),
    prisma.studentFeeOverride.findMany({ where: { studentId, academicYearId } }),
    prisma.feePayment.findMany({ where: { studentId, academicYearId, deletedAt: null } }),
  ]);

  const gradeId = student.section.gradeId;

  // These need gradeId from student, so fetch after
  const [structures, examRoutines] = await Promise.all([
    prisma.feeStructure.findMany({
      where: { gradeId, academicYearId },
      include: { feeCategory: true, examType: true },
    }),
    prisma.examRoutine.findMany({ where: { gradeId } }),
  ]);

  const examMonthMap = buildExamMonthMap(examRoutines);

  // ── Convenience ────────────────────────────────────────────────────────────

  const effectiveAmount = (s: typeof structures[0]): number => {
    const ov = overrides.find(o => o.feeCategoryId === s.feeCategoryId);
    return applyDiscount(s.amount, ov as any);
  };

  const paidForCategory = (feeCategoryId: string, paidMonth?: string): number =>
    payments
      .filter(p =>
        p.feeCategoryId === feeCategoryId &&
        (paidMonth === undefined || p.paidMonth === paidMonth),
      )
      .reduce((sum, p) => sum + p.amount, 0);

  // ── 1. Arrear items — unpaid monthly fees for months BEFORE selected ────────

  const arrearItems: FeeItem[] = [];
  let totalArrears = 0;

  for (const s of structures.filter(s => s.frequency === "MONTHLY")) {
    const amount = effectiveAmount(s);
    for (let m = 0; m < monthIndex; m++) {
      const mName = nepaliMonths[m];
      const paid = paidForCategory(s.feeCategoryId, mName);
      if (paid < amount) {
        const remaining = Math.round(amount - paid);
        arrearItems.push({ feeCategoryId: s.feeCategoryId, category: s.feeCategory.name, amount: remaining, paidMonth: mName });
        totalArrears += remaining;
      }
    }
  }

  // ── 2. Current month items ──────────────────────────────────────────────────

  const currentItems: FeeItem[] = [];
  let totalCurrent = 0;

  for (const s of structures.filter(s => s.frequency === "MONTHLY")) {
    const amount = effectiveAmount(s);
    const paid = paidForCategory(s.feeCategoryId, month);
    if (paid < amount) {
      const remaining = Math.round(amount - paid);
      currentItems.push({ feeCategoryId: s.feeCategoryId, category: s.feeCategory.name, amount: remaining, paidMonth: month });
      totalCurrent += remaining;
    }
  }

  // ── 3. Other items — annual, one-time, and exam fees ───────────────────────

  const otherItems: FeeItem[] = [];
  let totalOther = 0;

  for (const s of structures.filter(s => s.frequency === "ANNUAL" || s.frequency === "ONE_TIME")) {
    const amount = effectiveAmount(s);
    const paid = paidForCategory(s.feeCategoryId);
    if (paid < amount) {
      const remaining = Math.round(amount - paid);
      otherItems.push({ feeCategoryId: s.feeCategoryId, category: s.feeCategory.name, amount: remaining });
      totalOther += remaining;
    }
  }

  for (const s of structures.filter(s => s.frequency === "PER_EXAM" && s.examTypeId)) {
    const examMonth = examMonthMap[s.examTypeId!];
    // Only show if exam has already happened (on or before selected month)
    if (examMonth && examMonth <= monthIndex + 1) {
      const amount = effectiveAmount(s);
      const paid = paidForCategory(s.feeCategoryId);
      if (paid < amount) {
        const remaining = Math.round(amount - paid);
        otherItems.push({
          feeCategoryId: s.feeCategoryId,
          category: `${s.feeCategory.name} (${s.examType?.name})`,
          amount: remaining,
        });
        totalOther += remaining;
      }
    }
  }

  // ── 4. Monthly rates — for advance calculation on the client ───────────────

  const monthlyRates = structures
    .filter(s => s.frequency === "MONTHLY")
    .map(s => ({
      feeCategoryId: s.feeCategoryId,
      category: s.feeCategory.name,
      amount: Math.round(effectiveAmount(s)),
    }));

  // ── 5. Advance months — upcoming unpaid months remaining in the year ────────

  const advanceMonths: string[] = [];
  for (let m = monthIndex + 1; m < nepaliMonths.length; m++) {
    const mName = nepaliMonths[m];
    const fullyPaid = structures
      .filter(s => s.frequency === "MONTHLY")
      .every(s => paidForCategory(s.feeCategoryId, mName) >= effectiveAmount(s));
    if (!fullyPaid) advanceMonths.push(mName);
  }

  return {
    student: {
      name: student.name,
      nameNp: student.nameNp,
      className: student.section.grade.name,
      section: student.section.name,
      rollNo: student.rollNo,
    },
    month,
    yearBS: academicYear?.yearBS ?? "",
    arrearItems,
    currentItems,
    otherItems,
    monthlyRates,
    advanceMonths,
    totalArrears,
    totalCurrent,
    totalOther,
    grandTotal: totalArrears + totalCurrent + totalOther,
    // Note: advance is calculated on the client from monthlyRates + advanceMonths
  };
}

// ─── FEE CATEGORIES ──────────────────────────────────────────────────────────

router.get("/categories", authenticate, async (_req, res) => {
  const categories = await prisma.feeCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  res.json({ data: categories });
});

router.post("/categories", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  });
  const data = schema.parse(req.body);
  const category = await prisma.feeCategory.create({ data: { name: data.name, description: data.description } });
  res.status(201).json({ data: category });
});

router.put("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  });
  const data = schema.parse(req.body);
  const category = await prisma.feeCategory.update({ where: { id: req.params.id }, data });
  res.json({ data: category });
});

router.delete("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.feeCategory.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ data: { message: "Category deactivated" } });
});

// ─── FEE STRUCTURE ────────────────────────────────────────────────────────────

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
      examType: { select: { id: true, name: true } },
    },
    orderBy: { feeCategory: { name: "asc" } },
  });
  res.json({ data: structures });
});

router.post("/structure", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    feeCategoryId: z.string().min(1),
    gradeId: z.string().min(1),
    academicYearId: z.string().min(1),
    amount: z.number().min(0),
    frequency: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME", "PER_EXAM"]),
    examTypeId: z.string().optional(),
  });
  const data = schema.parse(req.body);
  if (data.frequency === "PER_EXAM" && !data.examTypeId) throw new AppError("examTypeId required for PER_EXAM");
  const structure = await prisma.feeStructure.upsert({
    where: {
      feeCategoryId_gradeId_academicYearId_examTypeId: {
        feeCategoryId: data.feeCategoryId,
        gradeId: data.gradeId,
        academicYearId: data.academicYearId,
        examTypeId: data.examTypeId || null,
      },
    },
    update: { amount: data.amount, frequency: data.frequency },
    create: {
      feeCategory: { connect: { id: data.feeCategoryId } },
      grade: { connect: { id: data.gradeId } },
      academicYear: { connect: { id: data.academicYearId } },
      examType: data.examTypeId ? { connect: { id: data.examTypeId } } : undefined,
      amount: data.amount,
      frequency: data.frequency,
    },
    include: {
      feeCategory: { select: { id: true, name: true } },
      examType: { select: { id: true, name: true } },
    },
  });
  res.status(201).json({ data: structure });
});

router.post("/structure/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    academicYearId: z.string().min(1),
    gradeId: z.string().min(1),
    entries: z.array(z.object({
      feeCategoryId: z.string().min(1),
      amount: z.number().min(0),
      frequency: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME", "PER_EXAM"]),
      examTypeId: z.string().optional(),
    })),
  });
  const { academicYearId, gradeId, entries } = schema.parse(req.body);
  await prisma.feeStructure.deleteMany({ where: { academicYearId, gradeId } });
  const created = await prisma.$transaction(
    entries.map(e =>
      prisma.feeStructure.create({
        data: {
          feeCategoryId: e.feeCategoryId,
          gradeId,
          academicYearId,
          amount: e.amount,
          frequency: e.frequency,
          examTypeId: e.examTypeId || null,
        },
      })
    )
  );
  res.status(201).json({ data: { message: `${created.length} fee structure entries saved` } });
});

router.delete("/structure/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.feeStructure.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Deleted" } });
});

// ─── OVERRIDES (Scholarships) ─────────────────────────────────────────────────

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

router.post("/overrides", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    feeCategoryId: z.string().min(1),
    academicYearId: z.string().min(1),
    discountType: z.enum(["FLAT", "PERCENTAGE"]),
    overrideAmount: z.number().min(0).optional(),
    discountPercent: z.number().min(0).max(100).optional(),
    reason: z.string().optional(),
  });
  const data = schema.parse(req.body);
  if (data.discountType === "PERCENTAGE" && !data.discountPercent) throw new AppError("discountPercent required");
  if (data.discountType === "FLAT" && data.overrideAmount === undefined) throw new AppError("overrideAmount required");
  const override = await prisma.studentFeeOverride.upsert({
    where: {
      studentId_feeCategoryId_academicYearId: {
        studentId: data.studentId,
        feeCategoryId: data.feeCategoryId,
        academicYearId: data.academicYearId,
      },
    },
    update: {
      discountType: data.discountType,
      overrideAmount: data.overrideAmount ?? 0,
      discountPercent: data.discountPercent ?? null,
      reason: data.reason ?? null,
    },
    create: {
      studentId: data.studentId,
      feeCategoryId: data.feeCategoryId,
      academicYearId: data.academicYearId,
      discountType: data.discountType,
      overrideAmount: data.overrideAmount ?? 0,
      discountPercent: data.discountPercent ?? null,
      reason: data.reason ?? null,
    },
  });
  res.json({ data: override });
});

router.delete("/overrides/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.studentFeeOverride.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Removed" } });
});

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

router.get("/payments", authenticate, async (req, res) => {
  const { studentId, academicYearId } = req.query;
  const where: any = { deletedAt: null };
  if (studentId) where.studentId = String(studentId);
  if (academicYearId) where.academicYearId = String(academicYearId);
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

router.post("/payments/bulk", authenticate, authorize("ADMIN", "ACCOUNTANT"), async (req, res) => {
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

  if (items.length === 0) throw new AppError("At least one payment item required");

  // Atomic receipt generation: interactive transaction ensures no two requests
  // can read the same count before either has written its payments.
  const { created, receiptNumber } = await prisma.$transaction(async (tx) => {
    const count = await tx.feePayment.count({ where: { academicYearId } });
    const receipt = `RCP-${String(count + 1).padStart(5, "0")}`;

    const results = [];
    for (const item of items) {
      const p = await tx.feePayment.create({
        data: {
          studentId,
          feeCategoryId: item.feeCategoryId,
          academicYearId,
          amount: item.amount,
          paidMonth: item.paidMonth ?? null,
          receiptNumber: receipt,
          paymentDate,
          paymentMethod: paymentMethod ?? null,
          remarks: remarks ?? null,
        },
      });
      results.push(p);
    }

    return { created: results, receiptNumber: receipt };
  });

  const userId = req.user!.userId;
  for (const p of created) {
    await logAudit({
      userId,
      action: "PAYMENT_CREATED",
      entity: "FeePayment",
      entityId: p.id,
      detail: { receiptNumber, amount: p.amount, paidMonth: p.paidMonth },
      ipAddress: req.ip,
    });
  }
  res.status(201).json({
    data: {
      message: `${created.length} payments recorded`,
      receiptNumber,
      totalAmount: items.reduce((s, i) => s + i.amount, 0),
    },
  });
});

// ─── SOFT DELETE PAYMENT ──────────────────────────────────────────────────────
router.delete("/payments/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const payment = await prisma.feePayment.findUnique({ where: { id: req.params.id } });
  if (!payment) throw new AppError("Payment not found", 404);
  if (payment.deletedAt) throw new AppError("Payment already deleted", 400);
  await prisma.feePayment.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  await logAudit({
    userId: req.user!.userId,
    action: "PAYMENT_DELETED",
    entity: "FeePayment",
    entityId: req.params.id,
    detail: { receiptNumber: payment.receiptNumber, amount: payment.amount },
    ipAddress: req.ip,
  });
  res.json({
    data: {
      message: "Payment soft-deleted. Record preserved for audit trail.",
      paymentId: req.params.id,
      receiptNumber: payment.receiptNumber,
    },
  });
});

// ─── SECTION OVERVIEW ─────────────────────────────────────────────────────────

router.get("/section-overview", authenticate, async (req, res) => {
  const { sectionId, academicYearId, currentMonth } = req.query;
  if (!sectionId || !academicYearId) throw new AppError("sectionId and academicYearId required");

  const monthIndex = currentMonth ? nepaliMonths.indexOf(String(currentMonth)) : 9;
  if (monthIndex === -1) throw new AppError("Invalid currentMonth");
  const monthsUpTo = monthIndex + 1;

  const [section, students] = await Promise.all([
    prisma.section.findUniqueOrThrow({ where: { id: String(sectionId) }, include: { grade: true } }),
    prisma.student.findMany({
      where: { sectionId: String(sectionId), isActive: true, status: "ACTIVE" },
      orderBy: { rollNo: "asc" },
    }),
  ]);

  const studentIds = students.map(s => s.id);

  const [structures, examRoutines, overrides, payments] = await Promise.all([
    prisma.feeStructure.findMany({
      where: { gradeId: section.gradeId, academicYearId: String(academicYearId) },
      include: { feeCategory: true, examType: true },
    }),
    prisma.examRoutine.findMany({ where: { gradeId: section.gradeId } }),
    prisma.studentFeeOverride.findMany({
      where: { studentId: { in: studentIds }, academicYearId: String(academicYearId) },
    }),
    prisma.feePayment.findMany({
      where: { studentId: { in: studentIds }, academicYearId: String(academicYearId), deletedAt: null },
    }),
  ]);

  const examMonthMap = buildExamMonthMap(examRoutines);

  const overview = students.map(student => {
    const studentOverrides = overrides.filter(o => o.studentId === student.id);
    const studentPayments = payments.filter(p => p.studentId === student.id);

    let totalDueUpToNow = 0;
    const monthlyStructures = structures.filter(s => s.frequency === "MONTHLY");

    for (const s of structures) {
      const ov = studentOverrides.find(o => o.feeCategoryId === s.feeCategoryId);
      const baseAmount = applyDiscount(s.amount, ov as any);

      if (s.frequency === "MONTHLY") {
        totalDueUpToNow += baseAmount * monthsUpTo;
      } else if (s.frequency === "ANNUAL" || s.frequency === "ONE_TIME") {
        totalDueUpToNow += baseAmount;
      } else if (s.frequency === "PER_EXAM" && s.examTypeId) {
        const examMonth = examMonthMap[s.examTypeId];
        if (examMonth && examMonth <= monthsUpTo) totalDueUpToNow += baseAmount;
      }
    }

    const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);

    // Latest month that has any monthly fee payment recorded
    let paidUpTo = "—";
    for (let m = nepaliMonths.length - 1; m >= 0; m--) {
      const mName = nepaliMonths[m];
      const hasPayment = studentPayments.some(
        p => p.paidMonth === mName && monthlyStructures.some(ms => ms.feeCategoryId === p.feeCategoryId)
      );
      if (hasPayment) { paidUpTo = mName; break; }
    }

    const paidUpToIndex = paidUpTo !== "—" ? nepaliMonths.indexOf(paidUpTo) + 1 : 0;
    const pendingMonths = Math.max(0, monthsUpTo - paidUpToIndex);

    return {
      id: student.id,
      name: student.name,
      rollNo: student.rollNo,
      totalDueUpToNow: Math.round(totalDueUpToNow),
      totalPaid: Math.round(totalPaid),
      balance: Math.round(totalDueUpToNow - totalPaid),
      paidUpTo,
      pendingMonths,
    };
  });

  res.json({
    data: {
      grade: section.grade.name,
      section: section.name,
      currentMonth: nepaliMonths[monthIndex],
      students: overview,
    },
  });
});

// ─── STUDENT FEE LEDGER ───────────────────────────────────────────────────────

router.get("/student-ledger/:studentId", authenticate, async (req, res) => {
  const { studentId } = req.params;
  const { academicYearId } = req.query;
  if (!academicYearId) throw new AppError("academicYearId required");

  const [student, structures, overrides, payments, examRoutines] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { section: { include: { grade: true } } },
    }),
    // Structures fetched after student for gradeId — sequential is acceptable here
    // because we can't parallelise without gradeId. Handled below.
    Promise.resolve(null as any), // placeholder
    prisma.studentFeeOverride.findMany({ where: { studentId, academicYearId: String(academicYearId) } }),
    prisma.feePayment.findMany({
      where: { studentId, academicYearId: String(academicYearId), deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    Promise.resolve(null as any), // placeholder
  ]);

  const gradeId = student.section.gradeId;

  const [gradeStructures, gradeExamRoutines] = await Promise.all([
    prisma.feeStructure.findMany({
      where: { gradeId, academicYearId: String(academicYearId) },
      include: { feeCategory: true, examType: true },
    }),
    prisma.examRoutine.findMany({ where: { gradeId }, include: { examType: true } }),
  ]);

  // Build exam month map with name included for display
  const examMonthNameMap: Record<string, { month: number; name: string }> = {};
  for (const r of gradeExamRoutines) {
    const parts = r.examDate.split("/");
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10);
      if (!examMonthNameMap[r.examTypeId] || m < examMonthNameMap[r.examTypeId].month) {
        examMonthNameMap[r.examTypeId] = { month: m, name: r.examType.name };
      }
    }
  }

  const monthlyFees = gradeStructures.filter(s => s.frequency === "MONTHLY");
  const examFeeStructures = gradeStructures.filter(s => s.frequency === "PER_EXAM");

  const monthGrid = nepaliMonths.map((month, idx) => {
    const monthNum = idx + 1;
    const monthPayments = payments.filter(p => p.paidMonth === month);
    let due = 0;
    const categories: {
      categoryId: string;
      categoryName: string;
      amount: number;
      paid: number;
      isExamFee?: boolean;
    }[] = [];

    // Monthly fees
    for (const s of monthlyFees) {
      const ov = overrides.find(o => o.feeCategoryId === s.feeCategoryId);
      const amount = applyDiscount(s.amount, ov as any);
      const paid = monthPayments
        .filter(p => p.feeCategoryId === s.feeCategoryId)
        .reduce((sum, p) => sum + p.amount, 0);
      due += amount;
      categories.push({ categoryId: s.feeCategoryId, categoryName: s.feeCategory.name, amount: Math.round(amount), paid: Math.round(paid) });
    }

    // Exam fees — only in the month the exam occurs
    for (const s of examFeeStructures) {
      if (!s.examTypeId) continue;
      const examInfo = examMonthNameMap[s.examTypeId];
      if (!examInfo || examInfo.month !== monthNum) continue;

      const ov = overrides.find(o => o.feeCategoryId === s.feeCategoryId);
      const amount = applyDiscount(s.amount, ov as any);
      // FIX: only count payments explicitly tied to this exam month — avoids double-counting
      const paid = payments
        .filter(p => p.feeCategoryId === s.feeCategoryId && p.paidMonth === month)
        .reduce((sum, p) => sum + p.amount, 0);
      due += amount;
      categories.push({
        categoryId: s.feeCategoryId,
        categoryName: `${s.feeCategory.name} (${examInfo.name})`,
        amount: Math.round(amount),
        paid: Math.round(paid),
        isExamFee: true,
      });
    }

    const totalPaid = categories.reduce((s, c) => s + c.paid, 0);
    const totalDue = Math.round(due);
    return {
      month,
      monthIndex: monthNum,
      totalDue,
      totalPaid,
      status: totalPaid >= totalDue ? "PAID" : totalPaid > 0 ? "PARTIAL" : "UNPAID",
      categories,
    };
  });

  // Annual / one-time fees
  const fixedFees = gradeStructures
    .filter(s => s.frequency === "ANNUAL" || s.frequency === "ONE_TIME")
    .map(s => {
      const ov = overrides.find(o => o.feeCategoryId === s.feeCategoryId);
      const amount = applyDiscount(s.amount, ov as any);
      // Fixed fees have no paidMonth
      const paid = payments
        .filter(p => p.feeCategoryId === s.feeCategoryId && !p.paidMonth)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        categoryId: s.feeCategoryId,
        categoryName: s.feeCategory.name,
        frequency: s.frequency,
        amount: Math.round(amount),
        paid: Math.round(paid),
        status: paid >= amount ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
      };
    });

  // Recent payments (20 most recent)
  const recentPayments = payments.slice(0, 20).map(p => ({
    id: p.id,
    category: gradeStructures.find(s => s.feeCategoryId === p.feeCategoryId)?.feeCategory.name ?? "Unknown",
    amount: p.amount,
    paidMonth: p.paidMonth,
    paymentDate: p.paymentDate,
    receiptNumber: p.receiptNumber,
    paymentMethod: p.paymentMethod,
  }));

  res.json({
    data: {
      student: {
        id: student.id,
        name: student.name,
        rollNo: student.rollNo,
        className: student.section.grade.name,
        section: student.section.name,
      },
      monthGrid,
      fixedFees,
      recentPayments,
    },
  });
});

// ─── RECEIPT ──────────────────────────────────────────────────────────────────

router.get("/receipt/:receiptNumber", authenticate, async (req, res) => {
  const [payments, school] = await Promise.all([
    prisma.feePayment.findMany({
      where: { receiptNumber: req.params.receiptNumber },
      include: {
        student: { include: { section: { include: { grade: true } } } },
        feeCategory: true,
      },
    }),
    prisma.school.findFirst(),
  ]);

  if (payments.length === 0) throw new AppError("Receipt not found", 404);

  const first = payments[0];
  res.json({
    data: {
      receiptNumber: req.params.receiptNumber,
      school: school ?? {},
      student: {
        name: first.student.name,
        className: first.student.section.grade.name,
        section: first.student.section.name,
        rollNo: first.student.rollNo,
      },
      paymentDate: first.paymentDate,
      paymentMethod: first.paymentMethod,
      remarks: first.remarks,
      items: payments.map(p => ({ category: p.feeCategory.name, amount: p.amount, paidMonth: p.paidMonth })),
      totalAmount: payments.reduce((s, p) => s + p.amount, 0),
    },
  });
});

// ─── MONTHS ───────────────────────────────────────────────────────────────────

router.get("/months", authenticate, (_req, res) => {
  // Returns a plain array — mobile client expects string[]
  res.json({ data: nepaliMonths });
});

// ─── INVOICE ──────────────────────────────────────────────────────────────────

// GET /api/fees/invoice/:studentId
// Returns grouped fee items: arrears (mandatory) + current month + other + advance support data.
router.get("/invoice/:studentId", authenticate, async (req, res) => {
  const { academicYearId, month } = req.query;
  if (!academicYearId || !month) throw new AppError("academicYearId and month required");

  const invoice = await buildInvoice(req.params.studentId, String(academicYearId), String(month));
  const school = await prisma.school.findFirst();

  res.json({ data: { school: school ?? {}, ...invoice } });
});

// ─── INVOICES BULK ────────────────────────────────────────────────────────────

// GET /api/fees/invoices-bulk
// FIX: was using fragile internal HTTP self-fetch — now calls buildInvoice directly.
router.get("/invoices-bulk", authenticate, async (req, res) => {
  const { sectionId, academicYearId, month } = req.query;
  if (!sectionId || !academicYearId || !month) {
    throw new AppError("sectionId, academicYearId, and month required");
  }

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true, status: "ACTIVE" },
    orderBy: { rollNo: "asc" },
  });

  const results = await Promise.allSettled(
    students.map(student => buildInvoice(student.id, String(academicYearId), String(month)))
  );

  const invoices = results
    .filter((r): r is PromiseFulfilledResult<InvoiceResult> => r.status === "fulfilled")
    .map(r => r.value);

  const failed = results.filter(r => r.status === "rejected").length;
  if (failed > 0) console.warn(`[invoices-bulk] ${failed} invoice(s) failed to generate`);

  res.json({ data: invoices });
});

export default router;