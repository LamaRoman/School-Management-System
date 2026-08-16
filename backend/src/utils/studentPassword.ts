import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";

/**
 * Resolve the default password used for auto-created student accounts.
 *
 * Historically this fell back to a hardcoded "student123" when
 * DEFAULT_STUDENT_PASSWORD was unset. Because student emails are predictable
 * (name + id suffix), that fallback meant every student account in a
 * production deployment shared one publicly-known password — mass account
 * takeover. In production we now refuse the weak fallback: callers wrap this
 * in try/catch, so the student record is still created but no login account
 * with a known password is ever provisioned. Dev keeps the convenience
 * fallback so local seeding/testing still works.
 */
export function getStudentDefaultPassword(): string {
  const configured = process.env.DEFAULT_STUDENT_PASSWORD;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new AppError(
      "Cannot create student login account: DEFAULT_STUDENT_PASSWORD is not configured.",
      500
    );
  }

  logger.warn("DEFAULT_STUDENT_PASSWORD is not set — using the weak dev fallback. Set this before deploying.");
  return "student123";
}
