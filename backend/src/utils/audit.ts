import prisma from "./prisma";
import logger from "./logger";

type AuditAction =
  | "PAYMENT_CREATED"
  | "PAYMENT_DELETED";

export async function logAudit({
  userId,
  action,
  entity,
  entityId,
  detail,
  ipAddress,
}: {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  detail?: object;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        detail: detail ?? undefined,
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (err) {
    // Never let audit logging break the main request
    logger.error({ err }, "Failed to write audit log");
  }
}
