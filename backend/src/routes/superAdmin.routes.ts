import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { uploadLogo, deleteLogo } from "../services/upload.service";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// All routes require SUPER_ADMIN role
router.use(authenticate, authorize("SUPER_ADMIN"));

// ─── LIST SCHOOLS ───────────────────────────────────────────────────────────

router.get("/schools", async (_req, res) => {
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          academicYears: true,
          teachers: true,
        },
      },
    },
  });

  // Fetch student counts per school via academic year chain
  const enriched = await Promise.all(
    schools.map(async (school) => {
      const studentCount = await prisma.student.count({
        where: {
          section: {
            grade: {
              academicYear: { schoolId: school.id },
            },
          },
          isActive: true,
        },
      });
      return {
        ...school,
        studentCount,
      };
    })
  );

  res.json({ data: enriched });
});

// ─── GET SINGLE SCHOOL ──────────────────────────────────────────────────────

router.get("/schools/:id", async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: {
          users: true,
          academicYears: true,
          teachers: true,
        },
      },
    },
  });
  if (!school) throw new AppError("School not found", 404);
  res.json({ data: school });
});

// ─── CREATE SCHOOL ──────────────────────────────────────────────────────────

const createSchoolSchema = z.object({
  name: z.string().min(1),
  nameNp: z.string().optional(),
  code: z.string().min(2).max(6).toUpperCase().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  estdYear: z.string().optional(),
  motto: z.string().optional(),
  // Admin account to create with the school
  adminEmail: z.string().email("Valid admin email required"),
  adminPassword: z.string().min(6, "Admin password must be at least 6 characters"),
});

router.post("/schools", async (req, res) => {
  const data = createSchoolSchema.parse(req.body);

  // Check admin email uniqueness
  const existingUser = await prisma.user.findUnique({ where: { email: data.adminEmail } });
  if (existingUser) {
    throw new AppError("Admin email already in use", 409);
  }

  const hashedPassword = await bcrypt.hash(data.adminPassword, 10);

  // Create school + admin user + report card settings in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name: data.name,
        nameNp: data.nameNp,
        code: data.code ?? null,
        address: data.address,
        phone: data.phone,
        email: data.email,
        estdYear: data.estdYear,
        motto: data.motto,
      },
    });

    const adminUser = await tx.user.create({
      data: {
        email: data.adminEmail,
        password: hashedPassword,
        role: "ADMIN",
        schoolId: school.id,
      },
    });

    // Create default report card settings
    await tx.reportCardSettings.create({
      data: { schoolId: school.id },
    });

    return { school, adminUser };
  });

  res.status(201).json({
    data: {
      school: result.school,
      admin: {
        id: result.adminUser.id,
        email: result.adminUser.email,
        role: result.adminUser.role,
      },
    },
  });
});

// ─── UPDATE SCHOOL ──────────────────────────────────────────────────────────

const updateSchoolSchema = z.object({
  name: z.string().min(1).optional(),
  nameNp: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  estdYear: z.string().optional(),
  motto: z.string().optional(),
  code: z.string().min(2).max(6).toUpperCase().optional(),
  isActive: z.boolean().optional(),
});

router.put("/schools/:id", async (req, res) => {
  const data = updateSchoolSchema.parse(req.body);
  const school = await prisma.school.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ data: school });
});

// ─── UPLOAD SCHOOL LOGO ────────────────────────────────────────────────────

router.post("/schools/:id/logo", upload.single("logo"), async (req, res) => {
  if (!req.file) throw new AppError("No file uploaded", 400);

  const existing = await prisma.school.findUnique({ where: { id: req.params.id }, select: { logo: true } });
  if (!existing) throw new AppError("School not found", 404);
  if (existing.logo) await deleteLogo(existing.logo);

  const result = await uploadLogo(req.file.buffer, req.file.mimetype, req.params.id);

  const school = await prisma.school.update({
    where: { id: req.params.id },
    data: { logo: result.url },
  });

  res.json({ data: { logo: school.logo, storageType: result.storageType } });
});

// DELETE /api/super-admin/schools/:id/logo — remove school logo
router.delete("/schools/:id/logo", async (req, res) => {
  const existing = await prisma.school.findUnique({ where: { id: req.params.id }, select: { logo: true } });
  if (!existing) throw new AppError("School not found", 404);
  if (existing.logo) await deleteLogo(existing.logo);
  await prisma.school.update({ where: { id: req.params.id }, data: { logo: null } });
  res.json({ data: { message: "Logo removed" } });
});

// ─── DEACTIVATE SCHOOL ──────────────────────────────────────────────────────

router.delete("/schools/:id", async (req, res) => {
  await prisma.school.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  // Also deactivate all users in this school
  await prisma.user.updateMany({
    where: { schoolId: req.params.id },
    data: { isActive: false },
  });

  res.json({ data: { message: "School deactivated" } });
});

// ─── LIST SCHOOL ADMINS ─────────────────────────────────────────────────────

router.get("/schools/:id/admins", async (req, res) => {
  const admins = await prisma.user.findMany({
    where: {
      schoolId: req.params.id,
      role: { in: ["ADMIN"] },
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({ data: admins });
});

// ─── ADD ADMIN TO SCHOOL ────────────────────────────────────────────────────

const addAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/schools/:id/admins", async (req, res) => {
  const data = addAdminSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError("Email already in use", 409);

  const school = await prisma.school.findUnique({ where: { id: req.params.id } });
  if (!school) throw new AppError("School not found", 404);

  const hashed = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashed,
      role: "ADMIN",
      schoolId: school.id,
    },
  });

  res.status(201).json({
    data: { id: user.id, email: user.email, role: user.role },
  });
});

// ─── DASHBOARD STATS ────────────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  const [totalSchools, activeSchools, totalUsers, totalStudents] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: { not: "SUPER_ADMIN" } } }),
    prisma.student.count({ where: { isActive: true } }),
  ]);

  res.json({
    data: { totalSchools, activeSchools, totalUsers, totalStudents },
  });
});

export default router;