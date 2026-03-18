import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import bcrypt from "bcryptjs";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Schema reference:
//   ParentStudent { id, parentId, studentId, relationship? }
//   User { id, email, role, parentLinks ParentStudent[] }
//   Student { id, name, sectionId, parentLinks ParentStudent[] }

// ─── ADMIN: CREATE PARENT + LINK ────────────────────────

// POST /api/parents — admin creates a parent user and links to student(s)
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    studentIds: z.array(z.string().min(1)).min(1),
    relationship: z.string().optional(),
  });

  const { email, password, studentIds, relationship } = schema.parse(req.body);

  // Check email not taken
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("A user with this email already exists", 409);

  const hashedPassword = await bcrypt.hash(password, 10);

  // Create parent user
  const parentUser = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: "PARENT",
      isActive: true,
    },
  });

  // Link to students
  const links = await prisma.$transaction(
    studentIds.map((studentId) =>
      prisma.parentStudent.create({
        data: {
          parentId: parentUser.id,
          studentId,
          relationship: relationship || null,
        },
      })
    )
  );

  res.status(201).json({
    data: {
      user: { id: parentUser.id, email: parentUser.email, role: parentUser.role },
      linkedStudents: links.length,
    },
  });
});

// GET /api/parents — admin lists all parent users with their linked students
router.get("/", authenticate, authorize("ADMIN"), async (_req, res) => {
  const parents = await prisma.user.findMany({
    where: { role: "PARENT", isActive: true },
    select: {
      id: true,
      email: true,
      isActive: true,
      parentLinks: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
              rollNo: true,
              section: {
                include: { grade: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { email: "asc" },
  });

  res.json({ data: parents });
});

// POST /api/parents/:parentId/link — link additional student to existing parent
router.post("/:parentId/link", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    relationship: z.string().optional(),
  });

  const { studentId, relationship } = schema.parse(req.body);

  const link = await prisma.parentStudent.create({
    data: {
      parentId: req.params.parentId,
      studentId,
      relationship: relationship || null,
    },
  });

  res.status(201).json({ data: link });
});

// DELETE /api/parents/:parentId/unlink/:studentId — remove a link
router.delete("/:parentId/unlink/:studentId", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.parentStudent.deleteMany({
    where: {
      parentId: req.params.parentId,
      studentId: req.params.studentId,
    },
  });
  res.json({ data: { message: "Link removed" } });
});

// ─── PARENT: VIEW THEIR CHILDREN'S DATA ─────────────────

// GET /api/parents/my-children — parent sees their linked students
router.get("/my-children", authenticate, async (req, res) => {
  const user = (req as any).user;

  const links = await prisma.parentStudent.findMany({
    where: { parentId: user.userId },
    include: {
      student: {
        include: {
          section: {
            include: { grade: true },
          },
        },
      },
    },
  });

  const children = links.map((link) => ({
    id: link.student.id,
    name: link.student.name,
    rollNo: link.student.rollNo,
    className: link.student.section.grade.name,
    section: link.student.section.name,
    relationship: link.relationship,
  }));

  res.json({ data: children });
});

// GET /api/parents/child/:studentId/fees — parent views child's fee status
router.get("/child/:studentId/fees", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { studentId } = req.params;

  // Verify parent is linked to this student
  if (user.role === "PARENT") {
    const link = await prisma.parentStudent.findFirst({
      where: { parentId: user.userId, studentId },
    });
    if (!link) throw new AppError("Not authorized to view this student's data", 403);
  }

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) return res.json({ data: { payments: [], totalPaid: 0 } });

  const payments = await prisma.feePayment.findMany({
    where: { studentId, academicYearId: activeYear.id },
    include: { feeCategory: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  res.json({
    data: {
      student: { name: student.name, className: student.section.grade.name, section: student.section.name },
      payments: payments.map((p) => ({
        category: p.feeCategory.name,
        amount: p.amount,
        paidMonth: p.paidMonth,
        paymentDate: p.paymentDate,
        receiptNumber: p.receiptNumber,
      })),
      totalPaid,
    },
  });
});

// GET /api/parents/child/:studentId/attendance — parent views child's attendance
router.get("/child/:studentId/attendance", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { studentId } = req.params;

  if (user.role === "PARENT") {
    const link = await prisma.parentStudent.findFirst({
      where: { parentId: user.userId, studentId },
    });
    if (!link) throw new AppError("Not authorized", 403);
  }

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) return res.json({ data: null });

  const attendance = await prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: activeYear.id } },
  });

  res.json({ data: attendance });
});

export default router;