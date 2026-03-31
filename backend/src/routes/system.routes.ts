import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// All routes require SYSTEM_ADMIN role

// ─── SCHOOLS ────────────────────────────────────────────

// GET /api/system/schools — list all schools
router.get("/schools", authenticate, authorize("SYSTEM_ADMIN"), async (_req, res) => {
  const schools = await prisma.school.findMany({
    orderBy: { name: "asc" },
  });
  res.json({ data: schools });
});

// POST /api/system/schools — create a new school
router.post("/schools", authenticate, authorize("SYSTEM_ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    nameNp: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    estdYear: z.string().optional(),
    motto: z.string().optional(),
  });

  const data = schema.parse(req.body);
  const school = await prisma.school.create({ data });
  res.status(201).json({ data: school });
});

// ─── ORG ADMINS ─────────────────────────────────────────

// GET /api/system/admins — list all admin users
router.get("/admins", authenticate, authorize("SYSTEM_ADMIN"), async (_req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SYSTEM_ADMIN"] } },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ data: admins });
});

// POST /api/system/admins — create a new org admin (school admin)
router.post("/admins", authenticate, authorize("SYSTEM_ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email("Valid email required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(1, "Name is required"),
  });

  const { email, password, name } = schema.parse(req.body);

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("A user with this email already exists", 409);

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  res.status(201).json({ data: user });
});

// PUT /api/system/admins/:id — update admin (toggle active, change password)
router.put("/admins/:id", authenticate, authorize("SYSTEM_ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  // Don't allow editing yourself out
  const user = req.user!;
  if (req.params.id === user.userId && data.isActive === false) {
    throw new AppError("You cannot deactivate your own account", 400);
  }

  const updateData: any = {};
  if (data.email) updateData.email = data.email;
  if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  res.json({ data: updated });
});

// ─── TEACHER USERS ──────────────────────────────────────

// GET /api/system/teachers — list all teachers with their user accounts
router.get("/teachers", authenticate, authorize("SYSTEM_ADMIN"), async (_req, res) => {
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    include: {
      user: {
        select: { id: true, email: true, isActive: true },
      },
    },
    orderBy: { name: "asc" },
  });
  res.json({ data: teachers });
});

// ─── STATS ──────────────────────────────────────────────

// GET /api/system/stats — system-wide overview
router.get("/stats", authenticate, authorize("SYSTEM_ADMIN"), async (_req, res) => {
  const [schoolCount, userCount, studentCount, teacherCount, yearCount] = await Promise.all([
    prisma.school.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.student.count({ where: { isActive: true } }),
    prisma.teacher.count({ where: { isActive: true } }),
    prisma.academicYear.count(),
  ]);

  res.json({
    data: {
      schools: schoolCount,
      users: userCount,
      students: studentCount,
      teachers: teacherCount,
      academicYears: yearCount,
    },
  });
});

export default router;