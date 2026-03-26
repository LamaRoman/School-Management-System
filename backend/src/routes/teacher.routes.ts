import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// GET /api/teachers — list all active teachers with assignment count and login email
router.get("/", authenticate, async (_req, res) => {
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assignments: true } },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });
  res.json({ data: teachers });
});

// GET /api/teachers/all — includes deactivated teachers (admin only)
router.get("/all", authenticate, authorize("ADMIN"), async (_req, res) => {
  const teachers = await prisma.teacher.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assignments: true } },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });
  res.json({ data: teachers });
});

// GET /api/teachers/:id — single teacher with assignments
router.get("/:id", authenticate, async (req, res) => {
  const teacher = await prisma.teacher.findUniqueOrThrow({
    where: { id: req.params.id },
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

// POST /api/teachers — create teacher + user account
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    nameNp: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("Valid email required for teacher login"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

  const data = schema.parse(req.body);

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) {
    throw new AppError("A user with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Create teacher and user in a transaction
  const teacher = await prisma.$transaction(async (tx) => {
    const newTeacher = await tx.teacher.create({
      data: {
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
        isActive: true,
      },
    });

    return newTeacher;
  });

  // Return with user info
  const result = await prisma.teacher.findUniqueOrThrow({
    where: { id: teacher.id },
    include: {
      _count: { select: { assignments: true } },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });

  res.status(201).json({ data: result });
});

// PUT /api/teachers/:id — update teacher info
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    nameNp: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  // If email is being changed, update the user account email too
  if (data.email) {
    const teacher = await prisma.teacher.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { user: true },
    });

    if (teacher.user) {
      // Check if new email conflicts with another user
      const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser && existingUser.id !== teacher.user.id) {
        throw new AppError("A user with this email already exists");
      }

      await prisma.user.update({
        where: { id: teacher.user.id },
        data: { email: data.email },
      });
    }
  }

  // If deactivating teacher, also deactivate user account
  if (data.isActive === false) {
    const teacher = await prisma.teacher.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (teacher.user) {
      await prisma.user.update({
        where: { id: teacher.user.id },
        data: { isActive: false },
      });
    }
  }

  // If reactivating teacher, also reactivate user account
  if (data.isActive === true) {
    const teacher = await prisma.teacher.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (teacher.user) {
      await prisma.user.update({
        where: { id: teacher.user.id },
        data: { isActive: true },
      });
    }
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
    include: {
      _count: { select: { assignments: true } },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });

  res.json({ data: updated });
});

// POST /api/teachers/:id/reset-password — admin resets teacher password
router.post("/:id/reset-password", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  });

  const { newPassword } = schema.parse(req.body);

  const teacher = await prisma.teacher.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { user: true },
  });

  if (!teacher.user) {
    throw new AppError("Teacher has no user account");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: teacher.user.id },
    data: { password: hashedPassword },
  });

  res.json({ data: { message: `Password reset for ${teacher.name}` } });
});

// DELETE /api/teachers/:id (soft delete — deactivates teacher + user)
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const teacher = await prisma.teacher.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { user: true },
  });

  await prisma.teacher.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  if (teacher.user) {
    await prisma.user.update({
      where: { id: teacher.user.id },
      data: { isActive: false },
    });
  }

  res.json({ data: { message: `${teacher.name} deactivated` } });
});

export default router;