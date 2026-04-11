import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { verifyAcademicYear } from "../utils/schoolScope";

const router = Router();

const ADMIN_OR_ACCOUNTANT = authorize("ADMIN", "ACCOUNTANT");

const nepaliMonths = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

// ─── DAILY CASH BOOK ────────────────────────────────────

// GET /api/accountant-reports/daily-cashbook?date=2082/12/12&academicYearId=xxx
router.get("/daily-cashbook", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { date, academicYearId } = req.query;
  if (!date || !academicYearId) {
    return res.status(400).json({ error: "date and academicYearId are required" });
  }

  const dateStr = String(date);
  const yearId = String(academicYearId);
  await verifyAcademicYear(yearId, schoolId);

  // Get all payments for this date
  const payments = await prisma.feePayment.findMany({
    where: {
      paymentDate: dateStr,
      academicYearId: yearId,
      deletedAt: null,
    },
    include: {
      student: {
        select: {
          id: true, name: true, rollNo: true,
          section: { select: { name: true, grade: { select: { name: true } } } },
        },
      },
      feeCategory: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by receipt number
  const receiptMap = new Map<string, {
    receiptNumber: string;
    studentName: string;
    className: string;
    section: string;
    rollNo: number | null;
    paymentMethod: string | null;
    items: { category: string; amount: number; paidMonth: string | null }[];
    total: number;
  }>();

  for (const p of payments) {
    const key = p.receiptNumber || p.id;
    if (!receiptMap.has(key)) {
      receiptMap.set(key, {
        receiptNumber: p.receiptNumber || "—",
        studentName: p.student.name,
        className: p.student.section?.grade?.name || "",
        section: p.student.section?.name || "",
        rollNo: p.student.rollNo,
        paymentMethod: p.paymentMethod,
        items: [],
        total: 0,
      });
    }
    const entry = receiptMap.get(key)!;
    entry.items.push({
      category: p.feeCategory.name,
      amount: p.amount,
      paidMonth: p.paidMonth,
    });
    entry.total += p.amount;
  }

  const receipts = Array.from(receiptMap.values());

  // Summary by category
  const categorySummary: Record<string, number> = {};
  for (const p of payments) {
    const cat = p.feeCategory.name;
    categorySummary[cat] = (categorySummary[cat] || 0) + p.amount;
  }

  // Summary by method
  const methodSummary: Record<string, number> = {};
  for (const p of payments) {
    const method = p.paymentMethod || "Cash";
    methodSummary[method] = (methodSummary[method] || 0) + p.amount;
  }

  const grandTotal = payments.reduce((s, p) => s + p.amount, 0);

  res.json({
    data: {
      date: dateStr,
      receipts,
      categorySummary: Object.entries(categorySummary).map(([name, amount]) => ({ name, amount })),
      methodSummary: Object.entries(methodSummary).map(([method, amount]) => ({ method, amount })),
      grandTotal,
      totalReceipts: receipts.length,
    },
  });
});

// ─── PAYMENT HISTORY SEARCH ─────────────────────────────

// GET /api/accountant-reports/payment-history?academicYearId=xxx&search=xxx&dateFrom=xxx&dateTo=xxx&gradeId=xxx&sectionId=xxx
router.get("/payment-history", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { academicYearId, search, dateFrom, dateTo, gradeId, sectionId, page = "1", limit = "50" } = req.query;
  if (!academicYearId) {
    return res.status(400).json({ error: "academicYearId is required" });
  }
  await verifyAcademicYear(String(academicYearId), schoolId);

  const where: any = { academicYearId: String(academicYearId), deletedAt: null };

  // Date range filter
  if (dateFrom || dateTo) {
    // Filter payments by paymentDate string comparison (BS dates are sortable as strings)
    if (dateFrom && dateTo) {
      where.paymentDate = { gte: String(dateFrom), lte: String(dateTo) };
    } else if (dateFrom) {
      where.paymentDate = { gte: String(dateFrom) };
    } else if (dateTo) {
      where.paymentDate = { lte: String(dateTo) };
    }
  }

  // Grade/section filter
  if (sectionId) {
    where.student = { sectionId: String(sectionId) };
  } else if (gradeId) {
    where.student = { section: { gradeId: String(gradeId) } };
  }

  // Search filter (receipt number or student name)
  if (search) {
    const searchStr = String(search);
    where.OR = [
      { receiptNumber: { contains: searchStr, mode: "insensitive" } },
      { student: { name: { contains: searchStr, mode: "insensitive" } } },
    ];
  }

  const pageNum = Math.max(1, parseInt(String(page)));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(limit))));

  const [payments, total] = await Promise.all([
    prisma.feePayment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true, name: true, rollNo: true,
            section: { select: { name: true, grade: { select: { name: true } } } },
          },
        },
        feeCategory: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.feePayment.count({ where }),
  ]);

  res.json({
    data: {
      payments: payments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber || "—",
        studentName: p.student.name,
        className: p.student.section?.grade?.name || "",
        section: p.student.section?.name || "",
        rollNo: p.student.rollNo,
        category: p.feeCategory.name,
        amount: p.amount,
        paidMonth: p.paidMonth,
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod || "Cash",
      })),
      total,
      page: pageNum,
      pages: Math.ceil(total / pageSize),
    },
  });
});

// ─── FEE DEFAULTER REPORT ───────────────────────────────

// GET /api/accountant-reports/defaulters?academicYearId=xxx&gradeId=xxx&sectionId=xxx&currentMonth=Magh
router.get("/defaulters", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { academicYearId, gradeId, sectionId, currentMonth = "Magh" } = req.query;
  if (!academicYearId) {
    return res.status(400).json({ error: "academicYearId is required" });
  }

  const yearId = String(academicYearId);
  await verifyAcademicYear(yearId, schoolId);
  const monthName = String(currentMonth);
  const monthIndex = nepaliMonths.indexOf(monthName);
  if (monthIndex < 0) {
    return res.status(400).json({ error: "Invalid month name" });
  }

  // Always scope to this school via the verified academicYearId (section -> grade -> academicYear).
  // Without this, a request with no gradeId/sectionId would return students from every school.
  const studentWhere: any = {
    isActive: true,
    status: "ACTIVE",
    section: { grade: { academicYearId: yearId } },
  };
  if (sectionId) {
    studentWhere.sectionId = String(sectionId);
  } else if (gradeId) {
    studentWhere.section = { gradeId: String(gradeId), grade: { academicYearId: yearId } };
  }

  const students = await prisma.student.findMany({
    where: studentWhere,
    include: {
      section: { select: { id: true, name: true, gradeId: true, grade: { select: { id: true, name: true } } } },
    },
    orderBy: [{ section: { grade: { displayOrder: "asc" } } }, { section: { name: "asc" } }, { rollNo: "asc" }],
  });

  if (students.length === 0) {
    return res.json({ data: { defaulters: [], summary: { totalStudents: 0, totalDefaulters: 0, totalDue: 0 } } });
  }

  // Get fee structures for relevant grades
  const gradeIds = [...new Set(students.map((s) => s.section.gradeId))];
  const structures = await prisma.feeStructure.findMany({
    where: { academicYearId: yearId, gradeId: { in: gradeIds } },
    include: { feeCategory: { select: { name: true } } },
  });

  // Get all payments for these students
  const studentIds = students.map((s) => s.id);
  const [payments, overrides] = await Promise.all([
    prisma.feePayment.findMany({
      where: { studentId: { in: studentIds }, academicYearId: yearId, deletedAt: null },
    }),
    prisma.studentFeeOverride.findMany({
      where: { studentId: { in: studentIds }, academicYearId: yearId },
    }),
  ]);

  const paymentsByStudent = new Map<string, number>();
  for (const p of payments) {
    paymentsByStudent.set(p.studentId, (paymentsByStudent.get(p.studentId) || 0) + p.amount);
  }

  // Helper to apply discount (same logic as fee.routes.ts)
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

  // Build defaulter list — calculate expected per student (not per grade) to account for overrides
  const defaulters = [];
  for (const student of students) {
    const gradeStructures = structures.filter((s) => s.gradeId === student.section.gradeId);
    const studentOverrides = overrides.filter((o) => o.studentId === student.id);

    let expected = 0;
    let monthlyTotal = 0;
    for (const s of gradeStructures) {
      const ov = studentOverrides.find((o) => o.feeCategoryId === s.feeCategoryId);
      const amount = applyDiscount(s.amount, ov as any);
      if (s.frequency === "MONTHLY") {
        expected += amount * (monthIndex + 1);
        monthlyTotal += amount;
      } else if (s.frequency === "ANNUAL" || s.frequency === "ONE_TIME") {
        expected += amount;
      } else if (s.frequency === "PER_EXAM") {
        expected += amount;
      }
    }

    const paid = paymentsByStudent.get(student.id) || 0;
    const balance = Math.round(expected - paid);

    if (balance > 0) {
      const monthsPending = monthlyTotal > 0 ? Math.ceil(balance / monthlyTotal) : 0;

      defaulters.push({
        studentId: student.id,
        studentName: student.name,
        className: student.section.grade.name,
        section: student.section.name,
        rollNo: student.rollNo,
        guardianPhone: student.guardianPhone || "—",
        expectedUpTo: expected,
        totalPaid: paid,
        balance,
        monthsPending,
      });
    }
  }

  res.json({
    data: {
      defaulters,
      currentMonth: monthName,
      summary: {
        totalStudents: students.length,
        totalDefaulters: defaulters.length,
        totalDue: defaulters.reduce((s, d) => s + d.balance, 0),
      },
    },
  });
});

// ─── FEE DISCOUNT REPORT ────────────────────────────────

// GET /api/accountant-reports/discounts?academicYearId=xxx
router.get("/discounts", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { academicYearId } = req.query;
  if (!academicYearId) {
    return res.status(400).json({ error: "academicYearId is required" });
  }
  await verifyAcademicYear(String(academicYearId), schoolId);

  const overrides = await prisma.studentFeeOverride.findMany({
    where: { academicYearId: String(academicYearId) },
    include: {
      student: {
        select: {
          id: true, name: true, rollNo: true,
          section: { select: { name: true, grade: { select: { name: true } } } },
        },
      },
      feeCategory: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Summary by type
  const typeSummary = { PERCENTAGE: 0, FLAT: 0 };
  const categorySummary: Record<string, { count: number; totalDiscount: number }> = {};

  for (const o of overrides) {
    if (o.discountType === "PERCENTAGE") typeSummary.PERCENTAGE++;
    else typeSummary.FLAT++;

    const cat = o.feeCategory.name;
    if (!categorySummary[cat]) categorySummary[cat] = { count: 0, totalDiscount: 0 };
    categorySummary[cat].count++;
    if (o.discountType === "FLAT") {
      categorySummary[cat].totalDiscount += o.overrideAmount;
    }
  }

  res.json({
    data: {
      discounts: overrides.map((o) => ({
        id: o.id,
        studentName: o.student.name,
        className: o.student.section?.grade?.name || "",
        section: o.student.section?.name || "",
        rollNo: o.student.rollNo,
        category: o.feeCategory.name,
        discountType: o.discountType,
        discountPercent: o.discountPercent,
        overrideAmount: o.overrideAmount,
        reason: o.reason || "—",
      })),
      summary: {
        totalDiscounts: overrides.length,
        byType: typeSummary,
        byCategory: Object.entries(categorySummary).map(([name, data]) => ({ name, ...data })),
      },
    },
  });
});

// ─── MONTHLY FINANCIAL SUMMARY ──────────────────────────

// GET /api/accountant-reports/monthly-summary?academicYearId=xxx&month=Magh
router.get("/monthly-summary", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { academicYearId, month } = req.query;
  if (!academicYearId) {
    return res.status(400).json({ error: "academicYearId is required" });
  }

  const yearId = String(academicYearId);
  await verifyAcademicYear(yearId, schoolId);

  // Get all payments, optionally filtered by month
  const paymentWhere: any = { academicYearId: yearId, deletedAt: null };
  if (month) {
    paymentWhere.paidMonth = String(month);
  }

  const payments = await prisma.feePayment.findMany({
    where: paymentWhere,
    include: {
      feeCategory: { select: { name: true } },
    },
  });

  // Group by month
  const monthlyData: Record<string, { collected: number; receipts: Set<string> }> = {};
  for (const m of nepaliMonths) {
    monthlyData[m] = { collected: 0, receipts: new Set() };
  }

  // Group by category
  const categoryData: Record<string, number> = {};

  for (const p of payments) {
    const m = p.paidMonth || "Other";
    if (monthlyData[m]) {
      monthlyData[m].collected += p.amount;
      if (p.receiptNumber) monthlyData[m].receipts.add(p.receiptNumber);
    }

    const cat = p.feeCategory.name;
    categoryData[cat] = (categoryData[cat] || 0) + p.amount;
  }

  // Get expected amounts — calculated PER STUDENT to account for overrides
  const grades = await prisma.grade.findMany({
    where: { academicYearId: yearId },
    include: {
      sections: {
        include: {
          students: {
            where: { isActive: true, status: "ACTIVE" },
            select: { id: true },
          },
        },
      },
      feeStructures: {
        where: { academicYearId: yearId, frequency: "MONTHLY" },
      },
    },
  });

  // Collect all active student IDs
  const allStudentIds: string[] = [];
  for (const grade of grades) {
    for (const section of grade.sections) {
      for (const stu of section.students) {
        allStudentIds.push(stu.id);
      }
    }
  }

  // Fetch overrides for all students
  const allOverrides = allStudentIds.length > 0
    ? await prisma.studentFeeOverride.findMany({
        where: { studentId: { in: allStudentIds }, academicYearId: yearId },
      })
    : [];

  // Helper to apply discount
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

  let expectedMonthly = 0;
  let studentCount = 0;
  for (const grade of grades) {
    for (const section of grade.sections) {
      for (const stu of section.students) {
        studentCount++;
        const studentOverrides = allOverrides.filter((o) => o.studentId === stu.id);
        for (const s of grade.feeStructures) {
          const ov = studentOverrides.find((o) => o.feeCategoryId === s.feeCategoryId);
          expectedMonthly += applyDiscount(s.amount, ov as any);
        }
      }
    }
  }

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);

  res.json({
    data: {
      months: nepaliMonths.map((m) => ({
        month: m,
        collected: monthlyData[m]?.collected || 0,
        receiptCount: monthlyData[m]?.receipts.size || 0,
        expected: expectedMonthly,
      })),
      byCategory: Object.entries(categoryData).map(([name, amount]) => ({ name, amount })),
      totalCollected,
      totalExpected: expectedMonthly * 12,
      studentCount,
    },
  });
});

// ─── STUDENT COUNT REPORT ───────────────────────────────

// GET /api/accountant-reports/student-count?academicYearId=xxx
router.get("/student-count", authenticate, ADMIN_OR_ACCOUNTANT, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { academicYearId } = req.query;
  if (!academicYearId) {
    return res.status(400).json({ error: "academicYearId is required" });
  }
  await verifyAcademicYear(String(academicYearId), schoolId);

  const grades = await prisma.grade.findMany({
    where: { academicYearId: String(academicYearId) },
    orderBy: { displayOrder: "asc" },
    include: {
      sections: {
        orderBy: { name: "asc" },
        include: {
          students: {
            where: { isActive: true },
            select: { id: true, gender: true, status: true },
          },
        },
      },
    },
  });

  const gradeData = grades.map((g) => {
    const sections = g.sections.map((s) => {
      const total = s.students.length;
      const male = s.students.filter((st) => st.gender?.toLowerCase() === "male").length;
      const female = s.students.filter((st) => st.gender?.toLowerCase() === "female").length;
      const other = total - male - female;
      return { sectionName: s.name, total, male, female, other };
    });

    const gradeTotal = sections.reduce((s, sec) => s + sec.total, 0);
    const gradeMale = sections.reduce((s, sec) => s + sec.male, 0);
    const gradeFemale = sections.reduce((s, sec) => s + sec.female, 0);
    const gradeOther = sections.reduce((s, sec) => s + sec.other, 0);

    return {
      gradeName: g.name,
      sections,
      total: gradeTotal,
      male: gradeMale,
      female: gradeFemale,
      other: gradeOther,
    };
  });

  const grandTotal = gradeData.reduce((s, g) => s + g.total, 0);
  const grandMale = gradeData.reduce((s, g) => s + g.male, 0);
  const grandFemale = gradeData.reduce((s, g) => s + g.female, 0);

  res.json({
    data: {
      grades: gradeData,
      grand: { total: grandTotal, male: grandMale, female: grandFemale, other: grandTotal - grandMale - grandFemale },
    },
  });
});

export default router;