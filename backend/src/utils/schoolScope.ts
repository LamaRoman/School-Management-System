/**
 * School Scoping Utilities
 *
 * Helpers to verify that entities belong to the requesting user's school.
 * Use these in route handlers to prevent cross-tenant data access.
 *
 * Root entities (AcademicYear, Teacher, FeeCategory, ExamRoom) have schoolId directly.
 * Child entities (Grade, Section, Student, etc.) are verified through their parent chain.
 */

import prisma from "./prisma";
import { AppError } from "../middleware/errorHandler";

// ─── Root entity verification ───────────────────────────────────────────────

export async function verifyAcademicYear(id: string, schoolId: string) {
  const entity = await prisma.academicYear.findFirst({ where: { id, schoolId } });
  if (!entity) throw new AppError("Academic year not found or access denied", 404);
  return entity;
}

export async function verifyTeacher(id: string, schoolId: string) {
  const entity = await prisma.teacher.findFirst({ where: { id, schoolId } });
  if (!entity) throw new AppError("Teacher not found or access denied", 404);
  return entity;
}

export async function verifyFeeCategory(id: string, schoolId: string) {
  const entity = await prisma.feeCategory.findFirst({ where: { id, schoolId } });
  if (!entity) throw new AppError("Fee category not found or access denied", 404);
  return entity;
}

export async function verifyExamRoom(id: string, schoolId: string) {
  const entity = await prisma.examRoom.findFirst({ where: { id, schoolId } });
  if (!entity) throw new AppError("Exam room not found or access denied", 404);
  return entity;
}

// ─── Child entity verification (through parent chain) ───────────────────────

export async function verifyGrade(id: string, schoolId: string) {
  const entity = await prisma.grade.findFirst({
    where: { id, academicYear: { schoolId } },
  });
  if (!entity) throw new AppError("Grade not found or access denied", 404);
  return entity;
}

export async function verifySection(id: string, schoolId: string) {
  const entity = await prisma.section.findFirst({
    where: { id, grade: { academicYear: { schoolId } } },
  });
  if (!entity) throw new AppError("Section not found or access denied", 404);
  return entity;
}

export async function verifyStudent(id: string, schoolId: string) {
  const entity = await prisma.student.findFirst({
    where: { id, section: { grade: { academicYear: { schoolId } } } },
  });
  if (!entity) throw new AppError("Student not found or access denied", 404);
  return entity;
}

export async function verifySubject(id: string, schoolId: string) {
  const entity = await prisma.subject.findFirst({
    where: { id, grade: { academicYear: { schoolId } } },
  });
  if (!entity) throw new AppError("Subject not found or access denied", 404);
  return entity;
}

export async function verifyExamType(id: string, schoolId: string) {
  const entity = await prisma.examType.findFirst({
    where: { id, academicYear: { schoolId } },
  });
  if (!entity) throw new AppError("Exam type not found or access denied", 404);
  return entity;
}

// ─── Convenience: get active academic year for a school ─────────────────────

export async function getActiveYear(schoolId: string) {
  return prisma.academicYear.findFirst({
    where: { schoolId, isActive: true },
  });
}
