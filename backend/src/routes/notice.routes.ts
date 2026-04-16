import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { Prisma } from "@prisma/client";

const router = Router();

// Schema reference:
//   Notice { id, title, content, type, priority, targetAudience, gradeId?, publishDate, expiryDate?, isPublished, isPinned, createdById, createdAt, updatedAt }
//   Relations: grade -> Grade?, createdBy -> User

// ─── ADMIN/TEACHER — MANAGE NOTICES ─────────────────────

// GET /api/notices — admin sees all, others see filtered
router.get("/", authenticate, async (req, res) => {
  const user = req.user!;
  const schoolId = getSchoolId(req);
  const { type, audience, gradeId } = req.query;

  const where: any = { createdBy: { schoolId } };

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
  const schoolId = getSchoolId(req);
  const notice = await prisma.notice.findFirstOrThrow({
    where: { id: req.params.id, createdBy: { schoolId } },
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
  const schoolId = getSchoolId(req);
  if (user.role !== "ADMIN" && user.role !== "TEACHER" && user.role !== "ACCOUNTANT") {
    throw new AppError("Not authorized to create notices", 403);
  }

  const schema = z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(10_000),
    type: z.enum(["GENERAL", "EXAM", "EVENT", "HOLIDAY", "FEE"]).default("GENERAL"),
    priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
    targetAudience: z.enum(["ALL", "TEACHERS", "STUDENTS", "PARENTS"]).default("ALL"),
    gradeId: z.string().optional(),
    publishDate: z.string().min(1).max(20),
    expiryDate: z.string().max(20).optional(),
    isPublished: z.boolean().default(true),
    isPinned: z.boolean().default(false),
  });

  const data = schema.parse(req.body);

  // Teachers and accountants can only create notices for ALL or STUDENTS
  if ((user.role === "TEACHER" || user.role === "ACCOUNTANT") && data.targetAudience === "TEACHERS") {
    throw new AppError("You cannot create notices targeted only at teachers", 403);
  }

  const noticeData: Prisma.NoticeCreateInput = {
    title: data.title,
    content: data.content,
    type: data.type,
    priority: data.priority,
    targetAudience: data.targetAudience,
    publishDate: data.publishDate,
    expiryDate: data.expiryDate || null,
    isPublished: data.isPublished,
    isPinned: data.isPinned,
    grade: data.gradeId ? { connect: { id: data.gradeId } } : undefined,
    createdBy: { connect: { id: user.userId } },
  };
  const notice = await prisma.notice.create({
    data: noticeData,
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
  const schoolId = getSchoolId(req);
  const notice = await prisma.notice.findFirstOrThrow({ where: { id: req.params.id, createdBy: { schoolId } } });

  // Only creator or admin can edit
  if (user.role !== "ADMIN" && notice.createdById !== user.userId) {
    throw new AppError("You can only edit notices you created", 403);
  }

  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).max(10_000).optional(),
    type: z.enum(["GENERAL", "EXAM", "EVENT", "HOLIDAY", "FEE"]).optional(),
    priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).optional(),
    targetAudience: z.enum(["ALL", "TEACHERS", "STUDENTS", "PARENTS"]).optional(),
    gradeId: z.string().nullable().optional(),
    publishDate: z.string().max(20).optional(),
    expiryDate: z.string().max(20).nullable().optional(),
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
  const schoolId = getSchoolId(req);
  const notice = await prisma.notice.findFirstOrThrow({ where: { id: req.params.id, createdBy: { schoolId } } });

  if (user.role !== "ADMIN" && notice.createdById !== user.userId) {
    throw new AppError("You can only delete notices you created", 403);
  }

  await prisma.notice.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Notice deleted" } });
});

export default router;