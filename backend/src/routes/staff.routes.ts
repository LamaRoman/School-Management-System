import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId, invalidateUserCache } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// GET /api/staff — list accountant users for this school
router.get("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const staff = await prisma.user.findMany({
    where: { schoolId, role: "ACCOUNTANT" },
    select: { id: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ data: staff });
});

// POST /api/staff — create accountant user
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });
  const { email, password } = schema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("A user with this email already exists", 409);

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, role: "ACCOUNTANT", schoolId, isActive: true },
  });

  res.status(201).json({
    data: { id: user.id, email: user.email, role: user.role, isActive: user.isActive },
  });
});

// PUT /api/staff/:id/toggle — toggle active status
router.put("/:id/toggle", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId, role: "ACCOUNTANT" },
  });
  if (!user) throw new AppError("Staff member not found", 404);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isActive: !user.isActive },
    select: { id: true, email: true, role: true, isActive: true },
  });
  invalidateUserCache(user.id);
  res.json({ data: updated });
});

// PUT /api/staff/:id/reset-password — reset password
router.put("/:id/reset-password", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({ password: z.string().min(6) });
  const { password } = schema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId, role: "ACCOUNTANT" },
  });
  if (!user) throw new AppError("Staff member not found", 404);

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
  res.json({ data: { message: "Password reset successfully" } });
});

export default router;
