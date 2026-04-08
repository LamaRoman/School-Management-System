import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, invalidateUserCache, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const teacherListInclude = {
  assignments: {
    include: {
      section: { include: { grade: { select: { name: true } } } },
      subject: { select: { name: true } },
    },
  },
  user: { select: { id: true, email: true, isActive: true } },
} as const;

// GET /api/teachers
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true, schoolId },
    orderBy: { name: "asc" },
    include: teacherListInclude,
  });
  res.json({ data: teachers });
});

// GET /api/teachers/all — includes deactivated
router.get("/all", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    include: teacherListInclude,
  });
  res.json({ data: teachers });
});

// GET /api/teachers/:id
router.get("/:id", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: {
      assignments: {
        include: {
          section: { include: { grade: { select: { name: true } } } },
          subject: { select: { name: true } },
        },
      },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });
  res.json({ data: teacher });
});

// POST /api/teachers
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    name: z.string().min(1),
    nameNp: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("Valid email required for teacher login"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

  const data = schema.parse(req.body);

  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw new AppError("A user with this email already exists");

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const teacher = await prisma.$transaction(async (tx) => {
    const newTeacher = await tx.teacher.create({
      data: {
        schoolId,
        name: data.name,
        nameNp: data.nameNp || null,
        phone: data.phone || null,
        email: data.email,
      },
    });

    await tx.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        role: "TEACHER",
        teacherId: newTeacher.id,
        schoolId,
        isActive: true,
      },
    });

    return newTeacher;
  });

  const result = await prisma.teacher.findUniqueOrThrow({
    where: { id: teacher.id },
    include: teacherListInclude,
  });

  res.status(201).json({ data: result });
});

// PUT /api/teachers/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    name: z.string().min(1).optional(),
    nameNp: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  // Verify ownership
  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: { user: true },
  });

  if (data.email && teacher.user) {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser && existingUser.id !== teacher.user.id) {
      throw new AppError("A user with this email already exists");
    }
    await prisma.user.update({ where: { id: teacher.user.id }, data: { email: data.email } });
  }

  if (data.isActive !== undefined && teacher.user) {
    await prisma.user.update({ where: { id: teacher.user.id }, data: { isActive: data.isActive } });
    if (!data.isActive) invalidateUserCache(teacher.user.id);
  }

  const updated = await prisma.teacher.update({
    where: { id: req.params.id },
    data: {
      name: data.name,
      nameNp: data.nameNp,
      phone: data.phone,
      email: data.email,
      isActive: data.isActive,
    },
    include: teacherListInclude,
  });

  res.json({ data: updated });
});

// POST /api/teachers/:id/reset-password
router.post("/:id/reset-password", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { newPassword } = z.object({ newPassword: z.string().min(6) }).parse(req.body);

  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: { user: true },
  });

  if (!teacher.user) throw new AppError("Teacher has no user account");

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: teacher.user.id }, data: { password: hashedPassword } });

  res.json({ data: { message: `Password reset for ${teacher.name}` } });
});

// DELETE /api/teachers/:id (soft delete)
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: { user: true },
  });

  await prisma.teacher.update({ where: { id: req.params.id }, data: { isActive: false } });

  if (teacher.user) {
    await prisma.user.update({ where: { id: teacher.user.id }, data: { isActive: false } });
    invalidateUserCache(teacher.user.id);
  }

  res.json({ data: { message: `${teacher.name} deactivated` } });
});

export default router;
