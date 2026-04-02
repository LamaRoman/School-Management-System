import prisma from "./prisma";

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
    console.error("[AuditLog] Failed to write audit log:", err);
  }
}
