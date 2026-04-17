import { Router, CookieOptions } from "express";
import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, invalidateBlocklistCache } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const MAX_PASSWORD = 72;

// ─── Token lifetimes ─────────────────────────────────────
// Access token is intentionally short — refresh token handles session continuity.
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_DAYS = parseInt(process.env.REFRESH_TOKEN_DAYS || "30", 10);
const REFRESH_TOKEN_MS = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

// ─── Account lockout constants ───────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// ─── Cookie helpers ──────────────────────────────────────
function accessCookieOptions(): CookieOptions {
  const sameSite = (process.env.COOKIE_SAME_SITE as "lax" | "strict" | "none") || "lax";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: 15 * 60 * 1000, // 15 minutes
  };
}

function refreshCookieOptions(): CookieOptions {
  const sameSite = (process.env.COOKIE_SAME_SITE as "lax" | "strict" | "none") || "lax";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/auth", // only sent to /auth endpoints — not every API call
    maxAge: REFRESH_TOKEN_MS,
  };
}

function clearCookieOptions(path: string): CookieOptions {
  const sameSite = (process.env.COOKIE_SAME_SITE as "lax" | "strict" | "none") || "lax";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path,
  };
}

// ─── Refresh token helpers ───────────────────────────────
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function createRefreshToken(userId: string): Promise<string> {
  const raw = randomBytes(48).toString("base64url"); // 48 bytes = 64 chars
  const tokenHash = hashToken(raw);
  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_MS),
    },
  });
  return raw;
}

function signAccessToken(user: { id: string; email: string; role: string; schoolId: string | null }): string {
  return jwt.sign(
    {
      jti: randomUUID(),
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId || null,
    },
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRY as SignOptions["expiresIn"] }
  );
}

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

const loginSchema = z.object({
  email: z.string().email("Invalid email").max(320),
  password: z.string().min(1, "Password is required").max(MAX_PASSWORD),
});

// ─── POST /api/auth/login ────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  // Check lockout
  const attempt = await prisma.loginAttempt.findUnique({ where: { email } });
  if (attempt?.lockedUntil) {
    if (attempt.lockedUntil > new Date()) {
      throw new AppError(
        "Account temporarily locked due to too many failed attempts. Try again later.",
        429
      );
    }
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

  // Success — clear failed attempts
  await prisma.loginAttempt.delete({ where: { email } }).catch(() => {});

  // Issue tokens
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);

  // Set cookies
  res.cookie("token", accessToken, accessCookieOptions());
  res.cookie("refreshToken", refreshToken, refreshCookieOptions());

  res.json({
    data: {
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId || null,
      },
    },
  });
});

// ─── POST /api/auth/refresh ──────────────────────────────
// Accepts refresh token from HttpOnly cookie (web) or request body (mobile).
// Rotates the refresh token on every use (old one is deleted).
router.post("/refresh", async (req, res) => {
  const raw =
    (req as any).cookies?.refreshToken ||
    req.body?.refreshToken;

  if (!raw || typeof raw !== "string") {
    throw new AppError("Refresh token required", 401);
  }

  const tokenHash = hashToken(raw);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.expiresAt < new Date()) {
    // Token not found or expired — could be reuse of a rotated token (attack)
    // or simply expired. Either way, delete all tokens for this user as a
    // precaution if we can identify them.
    if (stored) {
      await prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
    }
    throw new AppError("Invalid or expired refresh token", 401);
  }

  // Verify user is still active
  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, role: true, schoolId: true, isActive: true },
  });
  if (!user || !user.isActive) {
    await prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
    throw new AppError("Account has been deactivated", 401);
  }

  // Rotate: delete old, create new
  await prisma.refreshToken.delete({ where: { tokenHash } });
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = await createRefreshToken(user.id);

  // Set cookies
  res.cookie("token", newAccessToken, accessCookieOptions());
  res.cookie("refreshToken", newRefreshToken, refreshCookieOptions());

  res.json({
    data: {
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId || null,
      },
    },
  });
});

// ─── GET /api/auth/me ────────────────────────────────────
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

// ─── POST /api/auth/change-password ──────────────────────
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

// ─── POST /api/auth/logout ───────────────────────────────
// Blocklists the access token, deletes ALL refresh tokens for this user
// (logs out all devices), and clears both cookies.
router.post("/logout", authenticate, async (req, res) => {
  const { jti, exp } = req.user!;

  // Blocklist the current access token
  if (jti && exp) {
    await prisma.tokenBlocklist.create({
      data: {
        jti,
        userId: req.user!.userId,
        expiresAt: new Date(exp * 1000),
      },
    });
    invalidateBlocklistCache(jti);
  }

  // Delete all refresh tokens for this user
  await prisma.refreshToken.deleteMany({ where: { userId: req.user!.userId } });

  // Clear cookies
  res.clearCookie("token", clearCookieOptions("/"));
  res.clearCookie("refreshToken", clearCookieOptions("/auth"));

  res.json({ data: { message: "Logged out" } });
});

export default router;
