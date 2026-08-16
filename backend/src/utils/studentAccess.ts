import prisma from "./prisma";
import { AppError } from "../middleware/errorHandler";

// Who may read one student's academic data. Shared by report.routes.ts (the web
// portal) and pdf.routes.ts (the report card PDF) so the two cannot drift — a PDF
// URL that answered to a role the portal refuses would be a hole around the portal.
// The publish gate (isGatedRole/isSectionPublished) is applied separately at each
// call site; this only answers "is this student yours to look at".
export async function verifyStudentAccess(userId: string, role: string, studentId: string): Promise<void> {
  if (role === "ADMIN" || role === "TEACHER") return; // full access — see S7
  if (role === "STUDENT") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { studentId: true } });
    if (user?.studentId !== studentId) throw new AppError("You can only view your own report", 403);
    return;
  }
  if (role === "PARENT") {
    const link = await prisma.parentStudent.findFirst({ where: { parentId: userId, studentId } });
    if (!link) throw new AppError("You can only view your linked children's reports", 403);
    return;
  }
  throw new AppError("Not authorized to view reports", 403);
}
