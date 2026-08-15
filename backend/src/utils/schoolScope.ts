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

// ─── Relationship verification ("X belongs to Y") ───────────────────────────
//
// School membership is necessary but not sufficient, and treating it as the
// whole check is what let the same bug in four separate times.
//
// A `Subject` hangs off a `Grade`, and so does a `Section`. So "this subject
// is in my school" still permits attaching a Class 3 Maths subject to a Class
// 9 section — a wrong write *within* one school, which no school-scoped check
// can see. The same goes for an `ExamType` and an `AcademicYear`: both belong
// to the school, and pairing one year's exam with another year's grade writes
// a row that belongs to no coherent (year, exam) combination while every
// school check passes.
//
// These verify the relationship the endpoint actually depends on. Because the
// parent — the grade, section or year — is itself school-verified at the call
// site, checking the relationship closes the cross-school hole at the same
// time, which is why these *replace* a `verifySubject` call rather than
// joining it.

export async function verifySubjectInGrade(subjectId: string, gradeId: string) {
  const entity = await prisma.subject.findFirst({ where: { id: subjectId, gradeId } });
  if (!entity) throw new AppError("Subject not found for this grade", 404);
  return entity;
}

export async function verifySubjectsInGrade(subjectIds: string[], gradeId: string) {
  const unique = [...new Set(subjectIds)];
  const found = await prisma.subject.count({ where: { id: { in: unique }, gradeId } });
  if (found !== unique.length) {
    throw new AppError("One or more subjects do not belong to this grade", 404);
  }
}

/** A section's subjects are its grade's subjects — sections don't own subjects. */
export async function verifySubjectInSection(subjectId: string, sectionId: string) {
  const entity = await prisma.subject.findFirst({
    where: { id: subjectId, grade: { sections: { some: { id: sectionId } } } },
  });
  if (!entity) throw new AppError("Subject not found for this section's grade", 404);
  return entity;
}

export async function verifyExamTypeInYear(examTypeId: string, academicYearId: string) {
  const entity = await prisma.examType.findFirst({ where: { id: examTypeId, academicYearId } });
  if (!entity) throw new AppError("Exam type not found for this academic year", 404);
  return entity;
}

export async function verifyExamTypesInYear(examTypeIds: string[], academicYearId: string) {
  const unique = [...new Set(examTypeIds)];
  const found = await prisma.examType.count({ where: { id: { in: unique }, academicYearId } });
  if (found !== unique.length) {
    throw new AppError("One or more exam types do not belong to this academic year", 404);
  }
}
