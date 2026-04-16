import { Router } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, invalidateBlocklistCache } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// bcrypt silently truncates inputs past 72 bytes, so there is no legitimate
// reason to accept longer passwords. Without an upper bound, an attacker can
// send arbitrarily large payloads to any endpoint that calls bcrypt.hash /
// bcrypt.compare and force CPU-bound work (DoS).
const MAX_PASSWORD = 72;

// ─── Account lockout constants ───────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const loginSchema = z.object({
  email: z.string().email("Invalid email").max(320),
  password: z.string().min(1, "Password is required").max(MAX_PASSWORD),
});

// ─── Lockout helper ──────────────────────────────────────
async function recordFailedAttempt(email: string): Promise<void> {
  const record = await prisma.loginAttempt.upsert({
    where: { email },
    create: { email, attempts: 1 },
    update: { attempts: { increment: 1 } },
  });
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    await prisma.loginAttempt.update({
      where: { email },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
    });
  }
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  // ── Check if account is locked ──
  const attempt = await prisma.loginAttempt.findUnique({ where: { email } });
  if (attempt?.lockedUntil) {
    if (attempt.lockedUntil > new Date()) {
      throw new AppError(
        "Account temporarily locked due to too many failed attempts. Try again later.",
        429
      );
    }
    // Lockout expired — reset counter so user gets a fresh set of attempts
    await prisma.loginAttempt.delete({ where: { email } });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await recordFailedAttempt(email);
    throw new AppError("Invalid email or password", 401);
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    await recordFailedAttempt(email);
    throw new AppError("Invalid email or password", 401);
  }

  // ── Success — clear failed attempts ──
  await prisma.loginAttempt.delete({ where: { email } }).catch(() => {});

  // Include a unique jti so this token can be individually revoked via logout
  const jti = randomUUID();
  const token = jwt.sign(
    {
      jti,
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId || null,
    },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"] }
  );

  res.json({
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId || null,
      },
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
      schoolId: true,
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
    currentPassword: z.string().min(1).max(MAX_PASSWORD),
    newPassword: z.string().min(6, "Password must be at least 6 characters").max(MAX_PASSWORD),
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

// POST /api/auth/logout
// Adds the token's jti to a blocklist so it cannot be reused. The blocklist
// entry automatically expires when the JWT itself would have expired.
router.post("/logout", authenticate, async (req, res) => {
  const { jti, exp } = req.user!;

  if (jti && exp) {
    await prisma.tokenBlocklist.create({
      data: {
        jti,
        userId: req.user!.userId,
        expiresAt: new Date(exp * 1000),
      },
    });
    // Immediately evict from the "not blocked" negative cache so subsequent
    // requests on this replica are rejected without waiting for cache expiry.
    invalidateBlocklistCache(jti);
  }

  // Even for old tokens without jti — tell the client logout succeeded.
  // The frontend will clear the token from localStorage / cookies.
  res.json({ data: { message: "Logged out" } });
});

export default router;
