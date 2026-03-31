import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Schema reference:
//   Notice { id, title, content, type, priority, targetAudience, gradeId?, publishDate, expiryDate?, isPublished, isPinned, createdById, createdAt, updatedAt }
//   Relations: grade -> Grade?, createdBy -> User

// ─── ADMIN/TEACHER — MANAGE NOTICES ─────────────────────

// GET /api/notices — admin sees all, others see filtered
router.get("/", authenticate, async (req, res) => {
  const user = req.user!;
  const { type, audience, gradeId } = req.query;

  const where: any = {};

  if (user.role === "STUDENT" || user.role === "PARENT") {
    // Students/parents only see published notices targeted at them
    where.isPublished = true;
    where.OR = [
      { targetAudience: "ALL" },
      { targetAudience: user.role === "STUDENT" ? "STUDENTS" : "PARENTS" },
    ];

    // If student, also filter by their grade
    if (user.role === "STUDENT") {
      // Get student's grade
      const userRecord = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { student: { include: { section: true } } },
      });
      if (userRecord?.student?.section?.gradeId) {
        where.OR.push({ gradeId: userRecord.student.section.gradeId });
        // Also include notices with no specific grade (school-wide)
      }
      where.AND = [
        { OR: where.OR },
        { OR: [{ gradeId: null }, ...(userRecord?.student?.section?.gradeId ? [{ gradeId: userRecord.student.section.gradeId }] : [])] },
      ];
      delete where.OR;
    }
  } else if (user.role === "TEACHER" || user.role === "ACCOUNTANT") {
    // Teachers and accountants see ALL + TEACHERS targeted notices, plus ones they created
    where.OR = [
      { targetAudience: "ALL" },
      { targetAudience: "TEACHERS" },
      { createdById: user.userId },
    ];
    where.isPublished = true;
  }
  // ADMIN sees everything — no filter

  // Additional query filters
  if (type) where.type = String(type);
  if (audience && (user.role === "ADMIN")) {
    where.targetAudience = String(audience);
  }
  if (gradeId && (user.role === "ADMIN")) {
    where.gradeId = String(gradeId);
  }

  const notices = await prisma.notice.findMany({
    where,
    include: {
      grade: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true, role: true } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });

  res.json({ data: notices });
});

// GET /api/notices/:id
router.get("/:id", authenticate, async (req, res) => {
  const notice = await prisma.notice.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      grade: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true, role: true } },
    },
  });
  res.json({ data: notice });
});

// POST /api/notices — admin or teacher can create
router.post("/", authenticate, async (req, res) => {
  const user = req.user!;
  if (user.role !== "ADMIN" && user.role !== "TEACHER" && user.role !== "ACCOUNTANT") {
    throw new AppError("Not authorized to create notices", 403);
  }

  const schema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    type: z.enum(["GENERAL", "EXAM", "EVENT", "HOLIDAY", "FEE"]).default("GENERAL"),
    priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
    targetAudience: z.enum(["ALL", "TEACHERS", "STUDENTS", "PARENTS"]).default("ALL"),
    gradeId: z.string().optional(),
    publishDate: z.string().min(1),
    expiryDate: z.string().optional(),
    isPublished: z.boolean().default(true),
    isPinned: z.boolean().default(false),
  });

  const data = schema.parse(req.body);

  // Teachers and accountants can only create notices for ALL or STUDENTS
  if ((user.role === "TEACHER" || user.role === "ACCOUNTANT") && data.targetAudience === "TEACHERS") {
    throw new AppError("You cannot create notices targeted only at teachers", 403);
  }

  const notice = await prisma.notice.create({
    data: {
      ...data,
      gradeId: data.gradeId || null,
      expiryDate: data.expiryDate || null,
      createdById: user.userId,
    },
    include: {
      grade: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true, role: true } },
    },
  });

  res.status(201).json({ data: notice });
});

// PUT /api/notices/:id
router.put("/:id", authenticate, async (req, res) => {
  const user = req.user!;
  const notice = await prisma.notice.findUniqueOrThrow({ where: { id: req.params.id } });

  // Only creator or admin can edit
  if (user.role !== "ADMIN" && notice.createdById !== user.userId) {
    throw new AppError("You can only edit notices you created", 403);
  }

  const schema = z.object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    type: z.enum(["GENERAL", "EXAM", "EVENT", "HOLIDAY", "FEE"]).optional(),
    priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).optional(),
    targetAudience: z.enum(["ALL", "TEACHERS", "STUDENTS", "PARENTS"]).optional(),
    gradeId: z.string().nullable().optional(),
    publishDate: z.string().optional(),
    expiryDate: z.string().nullable().optional(),
    isPublished: z.boolean().optional(),
    isPinned: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  const updated = await prisma.notice.update({
    where: { id: req.params.id },
    data,
    include: {
      grade: { select: { id: true, name: true } },
      createdBy: { select: { id: true, email: true, role: true } },
    },
  });

  res.json({ data: updated });
});

// DELETE /api/notices/:id
router.delete("/:id", authenticate, async (req, res) => {
  const user = req.user!;
  const notice = await prisma.notice.findUniqueOrThrow({ where: { id: req.params.id } });

  if (user.role !== "ADMIN" && notice.createdById !== user.userId) {
    throw new AppError("You can only delete notices you created", 403);
  }

  await prisma.notice.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Notice deleted" } });
});

export default router;