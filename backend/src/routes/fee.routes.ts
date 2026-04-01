import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const nepaliMonths = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

// ─── FEE CATEGORIES ─────────────────────────────────────

router.get("/categories", authenticate, async (_req, res) => {
  const categories = await prisma.feeCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  res.json({ data: categories });
});

router.post("/categories", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({ name: z.string().min(1), description: z.string().optional() });
  const data = schema.parse(req.body);
  const category = await prisma.feeCategory.create({ data });
  res.status(201).json({ data: category });
});

router.put("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({ name: z.string().min(1).optional(), description: z.string().optional(), isActive: z.boolean().optional() });
  const data = schema.parse(req.body);
  const category = await prisma.feeCategory.update({ where: { id: req.params.id }, data });
  res.json({ data: category });
});

router.delete("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.feeCategory.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ data: { message: "Category deactivated" } });
});

// ─── FEE STRUCTURE ──────────────────────────────────────

router.get("/structure", authenticate, async (req, res) => {
  const { academicYearId, gradeId } = req.query;
  const where: any = {};
  if (academicYearId) where.academicYearId = String(academicYearId);
  if (gradeId) where.gradeId = String(gradeId);
  const structures = await prisma.feeStructure.findMany({
    where,
    include: { feeCategory: { select: { id: true, name: true } }, grade: { select: { id: true, name: true } }, examType: { select: { id: true, name: true } } },
    orderBy: { feeCategory: { name: "asc" } },
  });
  res.json({ data: structures });
});

router.post("/structure", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    feeCategoryId: z.string().min(1), gradeId: z.string().min(1), academicYearId: z.string().min(1),
    amount: z.number().min(0), frequency: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME", "PER_EXAM"]),
    examTypeId: z.string().optional(),
  });
  const data = schema.parse(req.body);
  if (data.frequency === "PER_EXAM" && !data.examTypeId) throw new AppError("examTypeId required for PER_EXAM");
  const structure = await prisma.feeStructure.upsert({
    where: { feeCategoryId_gradeId_academicYearId_examTypeId: { feeCategoryId: data.feeCategoryId, gradeId: data.gradeId, academicYearId: data.academicYearId, examTypeId: data.examTypeId || null } },
    update: { amount: data.amount, frequency: data.frequency },
    create: { ...data, examTypeId: data.examTypeId || null },
    include: { feeCategory: { select: { id: true, name: true } }, examType: { select: { id: true, name: true } } },
  });
  res.status(201).json({ data: structure });
});

router.post("/structure/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    academicYearId: z.string().min(1), gradeId: z.string().min(1),
    entries: z.array(z.object({ feeCategoryId: z.string().min(1), amount: z.number().min(0), frequency: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME", "PER_EXAM"]), examTypeId: z.string().optional() })),
  });
  const { academicYearId, gradeId, entries } = schema.parse(req.body);
  await prisma.feeStructure.deleteMany({ where: { academicYearId, gradeId } });
  const created = await prisma.$transaction(
    entries.map((e) => prisma.feeStructure.create({ data: { feeCategoryId: e.feeCategoryId, gradeId, academicYearId, amount: e.amount, frequency: e.frequency, examTypeId: e.examTypeId || null } }))
  );
  res.status(201).json({ data: { message: `${created.length} fee structure entries saved` } });
});

router.delete("/structure/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.feeStructure.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Deleted" } });
});

// ─── OVERRIDES (Scholarships) ───────────────────────────

router.get("/overrides", authenticate, async (req, res) => {
  const { studentId, academicYearId } = req.query;
  const where: any = {};
  if (studentId) where.studentId = String(studentId);
  if (academicYearId) where.academicYearId = String(academicYearId);
  const overrides = await prisma.studentFeeOverride.findMany({ where, include: { feeCategory: { select: { id: true, name: true } }, student: { select: { id: true, name: true } } } });
  res.json({ data: overrides });
});

router.post("/overrides", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1), feeCategoryId: z.string().min(1), academicYearId: z.string().min(1),
    discountType: z.enum(["FLAT", "PERCENTAGE"]), overrideAmount: z.number().min(0).optional(),
    discountPercent: z.number().min(0).max(100).optional(), reason: z.string().optional(),
  });
  const data = schema.parse(req.body);
  if (data.discountType === "PERCENTAGE" && !data.discountPercent) throw new AppError("discountPercent required");
  if (data.discountType === "FLAT" && (data.overrideAmount === undefined)) throw new AppError("overrideAmount required");
  const override = await prisma.studentFeeOverride.upsert({
    where: { studentId_feeCategoryId_academicYearId: { studentId: data.studentId, feeCategoryId: data.feeCategoryId, academicYearId: data.academicYearId } },
    update: { discountType: data.discountType, overrideAmount: data.overrideAmount || 0, discountPercent: data.discountPercent || null, reason: data.reason || null },
    create: { studentId: data.studentId, feeCategoryId: data.feeCategoryId, academicYearId: data.academicYearId, discountType: data.discountType, overrideAmount: data.overrideAmount || 0, discountPercent: data.discountPercent || null, reason: data.reason || null },
  });
  res.json({ data: override });
});

router.delete("/overrides/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.studentFeeOverride.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Removed" } });
});

// ─── PAYMENTS ───────────────────────────────────────────

router.get("/payments", authenticate, async (req, res) => {
  const { studentId, academicYearId } = req.query;
  const where: any = {};
  if (studentId) where.studentId = String(studentId);
  if (academicYearId) where.academicYearId = String(academicYearId);
  const payments = await prisma.feePayment.findMany({
    where, include: { student: { select: { id: true, name: true, rollNo: true } }, feeCategory: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ data: payments });
});

router.post("/payments/bulk", authenticate, authorize("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1), academicYearId: z.string().min(1), paymentDate: z.string().min(1),
    paymentMethod: z.string().optional(), remarks: z.string().optional(),
    items: z.array(z.object({ feeCategoryId: z.string().min(1), amount: z.number().min(0), paidMonth: z.string().optional() })),
  });
  const { studentId, academicYearId, paymentDate, paymentMethod, remarks, items } = schema.parse(req.body);
  const count = await prisma.feePayment.count({ where: { academicYearId } });
  const receiptNumber = `RCP-${String(count + 1).padStart(5, "0")}`;
  const created = await prisma.$transaction(
    items.map((item) => prisma.feePayment.create({
      data: { studentId, feeCategoryId: item.feeCategoryId, academicYearId, amount: item.amount, paidMonth: item.paidMonth || null, receiptNumber, paymentDate, paymentMethod: paymentMethod || null, remarks: remarks || null },
    }))
  );
  res.status(201).json({ data: { message: `${created.length} payments recorded`, receiptNumber, totalAmount: items.reduce((s, i) => s + i.amount, 0) } });
});

// ─── SECTION OVERVIEW (for collection tab) ──────────────

function applyDiscount(amount: number, override?: { discountType: string; overrideAmount: number; discountPercent: number | null }): number {
  if (!override) return amount;
  if (override.discountType === "PERCENTAGE" && override.discountPercent !== null) return amount * (1 - override.discountPercent / 100);
  if (override.discountType === "FLAT") return override.overrideAmount;
  return amount;
}

// GET /api/fees/section-overview — summary per student: paid up to which month, months pending
router.get("/section-overview", authenticate, async (req, res) => {
  const { sectionId, academicYearId, currentMonth } = req.query;
  if (!sectionId || !academicYearId) throw new AppError("sectionId and academicYearId required");

  const monthIndex = currentMonth ? nepaliMonths.indexOf(String(currentMonth)) : 9; // default Magh (index 9)
  const monthsUpTo = monthIndex + 1; // number of months elapsed

  const section = await prisma.section.findUniqueOrThrow({ where: { id: String(sectionId) }, include: { grade: true } });

  const structures = await prisma.feeStructure.findMany({
    where: { gradeId: section.gradeId, academicYearId: String(academicYearId) },
    include: { feeCategory: true, examType: true },
  });

  // Get exam routine dates to determine which exams have happened
  const examRoutines = await prisma.examRoutine.findMany({
    where: { gradeId: section.gradeId },
    include: { examType: true },
  });

  // Determine which exam types have happened (earliest exam date month <= currentMonth)
  const examMonthMap: Record<string, number> = {};
  for (const routine of examRoutines) {
    const dateParts = routine.examDate.split("/");
    if (dateParts.length >= 2) {
      const month = parseInt(dateParts[1], 10);
      if (!examMonthMap[routine.examTypeId] || month < examMonthMap[routine.examTypeId]) {
        examMonthMap[routine.examTypeId] = month;
      }
    }
  }

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true, status: "ACTIVE" },
    orderBy: { rollNo: "asc" },
  });

  const overrides = await prisma.studentFeeOverride.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, academicYearId: String(academicYearId) },
  });

  const payments = await prisma.feePayment.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, academicYearId: String(academicYearId) },
  });

  const overview = students.map((student) => {
    const studentOverrides = overrides.filter((o) => o.studentId === student.id);
    const studentPayments = payments.filter((p) => p.studentId === student.id);

    let totalDueUpToNow = 0;
    let totalPaid = 0;

    // Calculate monthly fee paid months
    const paidMonths = new Set(studentPayments.filter((p) => p.paidMonth).map((p) => p.paidMonth));

    // Monthly: due = amount × monthsUpTo
    for (const s of structures) {
      const override = studentOverrides.find((o) => o.feeCategoryId === s.feeCategoryId);
      const baseAmount = applyDiscount(s.amount, override as any);

      if (s.frequency === "MONTHLY") {
        totalDueUpToNow += baseAmount * monthsUpTo;
      } else if (s.frequency === "ANNUAL" || s.frequency === "ONE_TIME") {
        totalDueUpToNow += baseAmount;
      } else if (s.frequency === "PER_EXAM" && s.examTypeId) {
        const examMonth = examMonthMap[s.examTypeId];
        if (examMonth && examMonth <= monthsUpTo) {
          totalDueUpToNow += baseAmount;
        }
      }
    }

    totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);

    // Determine "paid up to" month for monthly fees
    let paidUpTo = "—";
    const monthlyStructures = structures.filter((s) => s.frequency === "MONTHLY");
    if (monthlyStructures.length > 0) {
      // Find the latest month that has been fully paid
      // A month is "paid" if payments with that paidMonth exist for all monthly categories
      for (let m = nepaliMonths.length - 1; m >= 0; m--) {
        const monthName = nepaliMonths[m];
        const monthPayments = studentPayments.filter((p) => p.paidMonth === monthName);
        if (monthPayments.length > 0) {
          const totalPaidThisMonth = monthPayments
            .filter((p) => monthlyStructures.some((ms) => ms.feeCategoryId === p.feeCategoryId))
            .reduce((sum, p) => sum + p.amount, 0);
          if (totalPaidThisMonth > 0) {
            paidUpTo = monthName;
            break;
          }
        }
      }
    }

    const pendingMonths = Math.max(0, monthsUpTo - (paidUpTo !== "—" ? nepaliMonths.indexOf(paidUpTo) + 1 : 0));

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

  res.json({ data: { grade: section.grade.name, section: section.name, currentMonth: nepaliMonths[monthIndex], students: overview } });
});

// ─── STUDENT FEE LEDGER (month-wise grid) ───────────────

router.get("/student-ledger/:studentId", authenticate, async (req, res) => {
  const { studentId } = req.params;
  const { academicYearId } = req.query;
  if (!academicYearId) throw new AppError("academicYearId required");

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const structures = await prisma.feeStructure.findMany({
    where: { gradeId: student.section.gradeId, academicYearId: String(academicYearId) },
    include: { feeCategory: true, examType: true },
  });

  const overrides = await prisma.studentFeeOverride.findMany({
    where: { studentId, academicYearId: String(academicYearId) },
  });

  const payments = await prisma.feePayment.findMany({
    where: { studentId, academicYearId: String(academicYearId) },
    orderBy: { createdAt: "desc" },
  });

  // Get exam routine months
  const examRoutines = await prisma.examRoutine.findMany({
    where: { gradeId: student.section.gradeId },
    include: { examType: true },
  });

  const examMonthMap: Record<string, { month: number; name: string }> = {};
  for (const routine of examRoutines) {
    const parts = routine.examDate.split("/");
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10);
      if (!examMonthMap[routine.examTypeId] || m < examMonthMap[routine.examTypeId].month) {
        examMonthMap[routine.examTypeId] = { month: m, name: routine.examType.name };
      }
    }
  }

  // Build monthly grid — includes MONTHLY fees + PER_EXAM fees in their exam month
  const monthlyFees = structures.filter((s) => s.frequency === "MONTHLY");
  const examFeeStructures = structures.filter((s) => s.frequency === "PER_EXAM");

  const monthGrid = nepaliMonths.map((month, idx) => {
    const monthNum = idx + 1;
    const monthPayments = payments.filter((p) => p.paidMonth === month);
    let due = 0;
    const categories: { categoryId: string; categoryName: string; amount: number; paid: number; isExamFee?: boolean }[] = [];

    // Monthly fees
    for (const s of monthlyFees) {
      const override = overrides.find((o) => o.feeCategoryId === s.feeCategoryId);
      const amount = applyDiscount(s.amount, override as any);
      const paid = monthPayments.filter((p) => p.feeCategoryId === s.feeCategoryId).reduce((sum, p) => sum + p.amount, 0);
      due += amount;
      categories.push({ categoryId: s.feeCategoryId, categoryName: s.feeCategory.name, amount: Math.round(amount), paid: Math.round(paid) });
    }

    // Exam fees — add to the month when exam happens
    for (const s of examFeeStructures) {
      if (!s.examTypeId) continue;
      const examInfo = examMonthMap[s.examTypeId];
      if (examInfo && examInfo.month === monthNum) {
        const override = overrides.find((o) => o.feeCategoryId === s.feeCategoryId);
        const amount = applyDiscount(s.amount, override as any);
        // Exam fee payments may have paidMonth set to the exam month, or null
        const paid = payments.filter((p) => p.feeCategoryId === s.feeCategoryId && (p.paidMonth === month || (!p.paidMonth && s.examTypeId))).reduce((sum, p) => sum + p.amount, 0);
        due += amount;
        categories.push({ categoryId: s.feeCategoryId, categoryName: `${s.feeCategory.name} (${examInfo.name})`, amount: Math.round(amount), paid: Math.round(paid), isExamFee: true });
      }
    }

    const totalPaid = categories.reduce((s, c) => s + c.paid, 0);
    return {
      month,
      monthIndex: monthNum,
      totalDue: Math.round(due),
      totalPaid,
      status: totalPaid >= due ? "PAID" : totalPaid > 0 ? "PARTIAL" : "UNPAID",
      categories,
    };
  });

  // One-time and annual fees
  const fixedFees = structures.filter((s) => s.frequency === "ANNUAL" || s.frequency === "ONE_TIME").map((s) => {
    const override = overrides.find((o) => o.feeCategoryId === s.feeCategoryId);
    const amount = applyDiscount(s.amount, override as any);
    const paid = payments.filter((p) => p.feeCategoryId === s.feeCategoryId && !p.paidMonth).reduce((sum, p) => sum + p.amount, 0);
    return { categoryId: s.feeCategoryId, categoryName: s.feeCategory.name, frequency: s.frequency, amount: Math.round(amount), paid: Math.round(paid), status: paid >= amount ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID" };
  });

  // Recent payments
  const recentPayments = payments.slice(0, 20).map((p) => ({
    id: p.id, category: structures.find((s) => s.feeCategoryId === p.feeCategoryId)?.feeCategory.name || "Unknown",
    amount: p.amount, paidMonth: p.paidMonth, paymentDate: p.paymentDate,
    receiptNumber: p.receiptNumber, paymentMethod: p.paymentMethod,
  }));

  res.json({
    data: {
      student: { id: student.id, name: student.name, rollNo: student.rollNo, className: student.section.grade.name, section: student.section.name },
      monthGrid, fixedFees, recentPayments,
    },
  });
});

// ─── RECEIPT ────────────────────────────────────────────

router.get("/receipt/:receiptNumber", authenticate, async (req, res) => {
  const payments = await prisma.feePayment.findMany({
    where: { receiptNumber: req.params.receiptNumber },
    include: { student: { include: { section: { include: { grade: true } } } }, feeCategory: true },
  });
  if (payments.length === 0) throw new AppError("Receipt not found", 404);
  const school = await prisma.school.findFirst();
  const first = payments[0];
  res.json({
    data: {
      receiptNumber: req.params.receiptNumber, school: school || {},
      student: { name: first.student.name, className: first.student.section.grade.name, section: first.student.section.name, rollNo: first.student.rollNo },
      paymentDate: first.paymentDate, paymentMethod: first.paymentMethod, remarks: first.remarks,
      items: payments.map((p) => ({ category: p.feeCategory.name, amount: p.amount, paidMonth: p.paidMonth })),
      totalAmount: payments.reduce((s, p) => s + p.amount, 0),
    },
  });
});

router.get("/months", authenticate, async (_req, res) => { res.json({ data: nepaliMonths }); });

// ─── INVOICE DATA ───────────────────────────────────────

// GET /api/fees/invoice/:studentId — individual invoice for a student
router.get("/invoice/:studentId", authenticate, async (req, res) => {
  const { studentId } = req.params;
  const { academicYearId, month } = req.query;
  if (!academicYearId || !month) throw new AppError("academicYearId and month required");

  const monthIndex = nepaliMonths.indexOf(String(month));
  if (monthIndex === -1) throw new AppError("Invalid month");

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const school = await prisma.school.findFirst();

  const structures = await prisma.feeStructure.findMany({
    where: { gradeId: student.section.gradeId, academicYearId: String(academicYearId) },
    include: { feeCategory: true, examType: true },
  });

  const overrides = await prisma.studentFeeOverride.findMany({
    where: { studentId, academicYearId: String(academicYearId) },
  });

  const payments = await prisma.feePayment.findMany({
    where: { studentId, academicYearId: String(academicYearId) },
  });

  // Exam routine dates
  const examRoutines = await prisma.examRoutine.findMany({ where: { gradeId: student.section.gradeId } });
  const examMonthMap: Record<string, number> = {};
  for (const r of examRoutines) {
    const parts = r.examDate.split("/");
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10);
      if (!examMonthMap[r.examTypeId] || m < examMonthMap[r.examTypeId]) examMonthMap[r.examTypeId] = m;
    }
  }

  const items: { category: string; amount: number; paidMonth?: string; status: string }[] = [];
  let totalDue = 0;
  let totalPaid = 0;

  // Monthly fees for selected month
  for (const s of structures.filter((s) => s.frequency === "MONTHLY")) {
    const override = overrides.find((o) => o.feeCategoryId === s.feeCategoryId);
    const amount = applyDiscount(s.amount, override as any);
    const monthPayments = payments.filter((p) => p.feeCategoryId === s.feeCategoryId && p.paidMonth === String(month));
    const paid = monthPayments.reduce((sum, p) => sum + p.amount, 0);
    totalDue += amount;
    totalPaid += paid;
    items.push({ feeCategoryId: s.feeCategoryId, category: s.feeCategory.name, amount: Math.round(amount), paidMonth: String(month), status: paid >= amount ? "PAID" : "DUE" });
  }

  // Annual/one-time (show if not yet paid)
  for (const s of structures.filter((s) => s.frequency === "ANNUAL" || s.frequency === "ONE_TIME")) {
    const override = overrides.find((o) => o.feeCategoryId === s.feeCategoryId);
    const amount = applyDiscount(s.amount, override as any);
    const paid = payments.filter((p) => p.feeCategoryId === s.feeCategoryId).reduce((sum, p) => sum + p.amount, 0);
    if (paid < amount) {
      const remaining = amount - paid;
      totalDue += remaining;
      items.push({ feeCategoryId: s.feeCategoryId, category: s.feeCategory.name, amount: Math.round(remaining), status: "DUE" });
    }
  }

  // Exam fees (only if exam happened)
  for (const s of structures.filter((s) => s.frequency === "PER_EXAM" && s.examTypeId)) {
    const examMonth = examMonthMap[s.examTypeId!];
    if (examMonth && examMonth <= monthIndex + 1) {
      const override = overrides.find((o) => o.feeCategoryId === s.feeCategoryId);
      const amount = applyDiscount(s.amount, override as any);
      const paid = payments.filter((p) => p.feeCategoryId === s.feeCategoryId).reduce((sum, p) => sum + p.amount, 0);
      if (paid < amount) {
        const remaining = amount - paid;
        totalDue += remaining;
        items.push({ category: `${s.feeCategory.name} (${s.examType?.name})`, amount: Math.round(remaining), status: "DUE" });
      }
    }
  }

  // Previous months arrears
  let arrears = 0;
  for (const s of structures.filter((s) => s.frequency === "MONTHLY")) {
    const override = overrides.find((o) => o.feeCategoryId === s.feeCategoryId);
    const amount = applyDiscount(s.amount, override as any);
    for (let m = 0; m < monthIndex; m++) {
      const mPaid = payments.filter((p) => p.feeCategoryId === s.feeCategoryId && p.paidMonth === nepaliMonths[m]).reduce((sum, p) => sum + p.amount, 0);
      if (mPaid < amount) arrears += (amount - mPaid);
    }
  }

  res.json({
    data: {
      school: school || {},
      student: { name: student.name, nameNp: student.nameNp, className: student.section.grade.name, section: student.section.name, rollNo: student.rollNo },
      month: String(month),
      yearBS: (await prisma.academicYear.findUnique({ where: { id: String(academicYearId) } }))?.yearBS || "",
      items: items.filter((i) => i.status === "DUE"),
      totalDue: Math.round(totalDue),
      totalPaid: Math.round(totalPaid),
      arrears: Math.round(arrears),
      grandTotal: Math.round(totalDue + arrears - totalPaid),
    },
  });
});

// GET /api/fees/invoices-bulk — invoice data for all students in a section
router.get("/invoices-bulk", authenticate, async (req, res) => {
  const { sectionId, academicYearId, month } = req.query;
  if (!sectionId || !academicYearId || !month) throw new AppError("sectionId, academicYearId, and month required");

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true, status: "ACTIVE" },
    orderBy: { rollNo: "asc" },
  });

  const invoices = [];
  for (const student of students) {
    try {
      // Reuse individual invoice logic by calling internal
      const response = await fetch(`http://localhost:${process.env.PORT || 4000}/api/fees/invoice/${student.id}?academicYearId=${academicYearId}&month=${month}`, {
        headers: { authorization: req.headers.authorization || "" },
      });
      const json = await response.json();
      if (json.data) invoices.push(json.data);
    } catch (err) {
      console.error(`[invoices-bulk] Failed to generate invoice for student ${student.id}:`, err);
    }
  }

  res.json({ data: invoices });
});

export default router;