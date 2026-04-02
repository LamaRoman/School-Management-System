import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new AppError("Invalid email or password", 401);
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"] }
  );

  res.json({
    data: {
      token,
      user: { id: user.id, email: user.email, role: user.role },
    },
  });
});

// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      email: true,
      role: true,
      student: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
    },
  });
  if (!user) throw new AppError("User not found", 404);
  res.json({ data: user });
});

// POST /api/auth/change-password
router.post("/change-password", authenticate, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  });
  const { currentPassword, newPassword } = schema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw new AppError("User not found", 404);

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new AppError("Current password is incorrect", 401);

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

  res.json({ data: { message: "Password changed successfully" } });
});

export default router;
