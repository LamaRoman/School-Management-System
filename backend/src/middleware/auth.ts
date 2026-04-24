import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { AppError } from "./errorHandler";
import prisma from "../utils/prisma";

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
  jti?: string; // present on tokens issued after Finding 5 change
  exp?: number; // JWT standard expiry (epoch seconds)
  iat?: number; // JWT standard issued-at (epoch seconds)
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      schoolId?: string;
    }
  }
}

// ─── isActive cache (unchanged) ──────────────────────────
const activeCache = new Map<string, { active: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function isUserActive(userId: string): Promise<boolean> {
  const cached = activeCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.active;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  const active = user?.isActive ?? false;
  activeCache.set(userId, { active, expiresAt: Date.now() + CACHE_TTL_MS });
  return active;
}

/** Call this when deactivating a user to immediately invalidate their cache entry. */
export function invalidateUserCache(userId: string): void {
  activeCache.delete(userId);
}

// ─── Token blocklist cache ───────────────────────────────
const blocklistCache = new Map<string, { blocked: boolean; expiresAt: number }>();
const BLOCKLIST_CACHE_TTL_MS = 30_000;

async function isTokenBlocked(jti: string): Promise<boolean> {
  const cached = blocklistCache.get(jti);
  if (cached && cached.expiresAt > Date.now()) return cached.blocked;

  const entry = await prisma.tokenBlocklist.findUnique({ where: { jti } });
  const blocked = !!entry;
  blocklistCache.set(jti, { blocked, expiresAt: Date.now() + BLOCKLIST_CACHE_TTL_MS });
  return blocked;
}

/** Force-evict a jti from the negative cache after a logout writes to the DB. */
export function invalidateBlocklistCache(jti: string): void {
  blocklistCache.delete(jti);
}

// ─── Periodic cleanup ────────────────────────────────────
export async function cleanupExpiredAuthRecords(): Promise<void> {
  const now = new Date();
  await prisma.tokenBlocklist.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.loginAttempt.deleteMany({ where: { updatedAt: { lt: oneHourAgo } } });
}

// ─── Middleware ──────────────────────────────────────────

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  // Dual-auth: accept HttpOnly cookie (web) OR Bearer header (mobile / API).
  // Cookie takes precedence when both are present.
  let token: string | undefined;

const cookieToken = (req as any).cookies?.zs_access_token;  if (cookieToken) {
    token = cookieToken;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    throw new AppError("Authentication required", 401);
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;

    // Check if this token has been revoked (user logged out)
    if (payload.jti) {
      const blocked = await isTokenBlocked(payload.jti);
      if (blocked) {
        throw new AppError("Token has been revoked", 401);
      }
    }

    req.user = payload;
    if (payload.schoolId) {
      req.schoolId = payload.schoolId;
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Invalid or expired token", 401);
  }

  // Verify the user account is still active
  const active = await isUserActive(req.user.userId);
  if (!active) {
    throw new AppError("Account has been deactivated", 401);
  }

  next();
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError("You do not have permission to perform this action", 403);
    }
    next();
  };
}

export function requireSchool(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }
  if (!req.schoolId) {
    throw new AppError("School context required. Super admins must use /super-admin routes.", 403);
  }
  next();
}

export function getSchoolId(req: Request): string {
  if (!req.schoolId) {
    throw new AppError("School context required", 403);
  }
  return req.schoolId;
}
