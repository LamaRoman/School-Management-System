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
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      schoolId?: string;
    }
  }
}

// Simple in-memory cache for isActive checks (avoids DB query on every request).
// Entries expire after 60s, so a deactivated user is locked out within 1 minute.
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

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Authentication required", 401);
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    req.user = payload;
    // Attach schoolId to request for convenient access
    if (payload.schoolId) {
      req.schoolId = payload.schoolId;
    }
  } catch {
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

/**
 * Middleware: require that the user belongs to a school.
 * SUPER_ADMIN users are rejected — they must use super-admin-specific routes.
 * Attach after `authenticate`.
 */
export function requireSchool(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }
  if (!req.schoolId) {
    throw new AppError("School context required. Super admins must use /super-admin routes.", 403);
  }
  next();
}

/**
 * Helper: get schoolId from request or throw.
 * Use inside route handlers for convenience.
 */
export function getSchoolId(req: Request): string {
  if (!req.schoolId) {
    throw new AppError("School context required", 403);
  }
  return req.schoolId;
}
