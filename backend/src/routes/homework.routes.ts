import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Schema reference:
//   Homework { id, title, description?, subjectId, sectionId, academicYearId, assignedById, assignedDate, dueDate?, isActive, createdAt, updatedAt }
//   Relations: subject -> Subject, section -> Section, academicYear -> AcademicYear, assignedBy -> User
//   User { id, email, role, teacherId?, studentId? }
//   TeacherAssignment { teacherId, sectionId, subjectId?, isClassTeacher }

// ─── HELPERS ────────────────────────────────────────────

async function getTeacherIdFromUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teacherId: true },
  });
  return user?.teacherId || null;
}

async function isAssignedToSection(teacherId: string, sectionId: string, subjectId?: string): Promise<boolean> {
  const where: any = { teacherId, sectionId };
  if (subjectId) where.subjectId = subjectId;
  const assignment = await prisma.teacherAssignment.findFirst({ where });
  return !!assignment;
}

// ─── ROUTES ─────────────────────────────────────────────

// GET /api/homework?sectionId=xxx&subjectId=xxx&academicYearId=xxx
// Teachers see homework they assigned + homework in their sections
// Students see homework for their section
// Admin sees all
router.get("/", authenticate, async (req, res) => {
  const user = req.user!;
  const { sectionId, subjectId, academicYearId } = req.query;

  const where: any = { isActive: true };
  if (sectionId) where.sectionId = String(sectionId);
  if (subjectId) where.subjectId = String(subjectId);
  if (academicYearId) where.academicYearId = String(academicYearId);

  if (user.role === "STUDENT") {
    // Students only see homework for their section
    const userRecord = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { student: { select: { sectionId: true } } },
    });
    if (userRecord?.student?.sectionId) {
      where.sectionId = userRecord.student.sectionId;
    } else {
      return res.json({ data: [] });
    }
  } else if (user.role === "TEACHER") {
    // Teachers see homework they created
    where.assignedById = user.userId;
  }
  // ADMIN and SYSTEM_ADMIN see all (no extra filter)

  const homework = await prisma.homework.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true } },
      section: {
        include: { grade: { select: { name: true } } },
      },
      assignedBy: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ data: homework });
});

// GET /api/homework/:id
router.get("/:id", authenticate, async (req, res) => {
  const homework = await prisma.homework.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      subject: { select: { id: true, name: true } },
      section: {
        include: { grade: { select: { name: true } } },
      },
      assignedBy: { select: { email: true } },
    },
  });
  res.json({ data: homework });
});

// POST /api/homework — teacher creates homework for their assigned section/subject
router.post("/", authenticate, async (req, res) => {
  const user = req.user!;

  if (user.role !== "TEACHER" && user.role !== "ADMIN" && user.role !== "SYSTEM_ADMIN") {
    throw new AppError("Only teachers and admins can create homework", 403);
  }

  const schema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    subjectId: z.string().min(1),
    sectionId: z.string().min(1),
    academicYearId: z.string().min(1),
    assignedDate: z.string().min(1),
    dueDate: z.string().optional(),
  });

  const data = schema.parse(req.body);

  // If teacher, verify they're assigned to this section + subject
  if (user.role === "TEACHER") {
    const teacherId = await getTeacherIdFromUser(user.userId);
    if (!teacherId) throw new AppError("Teacher record not found", 403);
    const assigned = await isAssignedToSection(teacherId, data.sectionId, data.subjectId);
    if (!assigned) throw new AppError("You are not assigned to this section/subject", 403);
  }

  const homework = await prisma.homework.create({
    data: {
      title: data.title,
      description: data.description || null,
      subjectId: data.subjectId,
      sectionId: data.sectionId,
      academicYearId: data.academicYearId,
      assignedById: user.userId,
      assignedDate: data.assignedDate,
      dueDate: data.dueDate || null,
    },
    include: {
      subject: { select: { id: true, name: true } },
      section: {
        include: { grade: { select: { name: true } } },
      },
      assignedBy: { select: { email: true } },
    },
  });

  res.status(201).json({ data: homework });
});

// PUT /api/homework/:id
router.put("/:id", authenticate, async (req, res) => {
  const user = req.user!;
  const existing = await prisma.homework.findUniqueOrThrow({ where: { id: req.params.id } });

  if (user.role !== "ADMIN" && user.role !== "SYSTEM_ADMIN" && existing.assignedById !== user.userId) {
    throw new AppError("You can only edit homework you created", 403);
  }

  const schema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    assignedDate: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  const updated = await prisma.homework.update({
    where: { id: req.params.id },
    data,
    include: {
      subject: { select: { id: true, name: true } },
      section: {
        include: { grade: { select: { name: true } } },
      },
      assignedBy: { select: { email: true } },
    },
  });

  res.json({ data: updated });
});

// DELETE /api/homework/:id
router.delete("/:id", authenticate, async (req, res) => {
  const user = req.user!;
  const existing = await prisma.homework.findUniqueOrThrow({ where: { id: req.params.id } });

  if (user.role !== "ADMIN" && user.role !== "SYSTEM_ADMIN" && existing.assignedById !== user.userId) {
    throw new AppError("You can only delete homework you created", 403);
  }

  await prisma.homework.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ data: { message: "Homework removed" } });
});

export default router;