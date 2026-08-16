import prisma from "./prisma";
import { AppError } from "../middleware/errorHandler";

// Who may read one student's academic data. Shared by report.routes.ts (the web
// portal) and pdf.routes.ts (the report card PDF) so the two cannot drift — a PDF
// URL that answered to a role the portal refuses would be a hole around the portal.
// The publish gate (isGatedRole/isSectionPublished) is applied separately at each
// call site; this only answers "is this student yours to look at".
export async function verifyStudentAccess(userId: string, role: string, studentId: string): Promise<void> {
  if (role === "ADMIN") return;
  if (role === "TEACHER") {
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { sectionId: true } });
    if (!student) throw new AppError("Student not found", 404);
    return verifySectionTeacherAccess(userId, student.sectionId);
  }
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

// S7 — a teacher may view/print reports only for sections they're assigned to
// (any assignment, class teacher or subject teacher), matching
// authorizeStudentRead's isTeacherOfSection check in student.routes.ts.
// Shared by verifyStudentAccess (single student) and the whole-class batch
// PDF routes in pdf.routes.ts (which check by sectionId directly).
export async function verifySectionTeacherAccess(userId: string, sectionId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { teacherId: true } });
  if (!user?.teacherId) throw new AppError("Teacher record not found", 403);
  const assigned = await prisma.teacherAssignment.findFirst({
    where: { teacherId: user.teacherId, sectionId },
  });
  if (!assigned) throw new AppError("You can only view reports for students in your assigned sections", 403);
}
