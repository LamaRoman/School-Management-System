import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifySection, verifySubject, verifyExamType, verifyAcademicYear, verifyStudent } from "../utils/schoolScope";

const router = Router();

// GET /api/marks?sectionId=xxx&subjectId=xxx&examTypeId=xxx
router.get("/", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, subjectId, examTypeId, studentId } = req.query;
  if (sectionId) await verifySection(String(sectionId), schoolId);
  if (examTypeId) await verifyExamType(String(examTypeId), schoolId);
  if (studentId) await verifyStudent(String(studentId), schoolId);
  // Mandatory school scoping — always filter marks to this school
  const where: any = {
    student: { section: { grade: { academicYear: { schoolId } } } },
  };
  if (studentId) where.studentId = String(studentId);
  if (subjectId) where.subjectId = String(subjectId);
  if (examTypeId) where.examTypeId = String(examTypeId);
  if (sectionId) where.student = { ...where.student, sectionId: String(sectionId) };

  const marks = await prisma.mark.findMany({
    where,
    include: {
      student: { select: { id: true, name: true, rollNo: true } },
      subject: { select: { id: true, name: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true } },
      examType: { select: { id: true, name: true } },
    },
    orderBy: { student: { rollNo: "asc" } },
  });
  res.json({ data: marks });
});

// POST /api/marks/bulk — teacher enters marks for entire class + subject + exam
router.post("/bulk", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schema = z.object({
    subjectId: z.string().min(1),
    examTypeId: z.string().min(1),
    academicYearId: z.string().min(1),
    marks: z.array(
      z.object({
        studentId: z.string().min(1),
        theoryMarks: z.number().min(0).nullable().optional(),
        practicalMarks: z.number().min(0).nullable().optional(),
        isAbsent: z.boolean().default(false),
      })
    ).min(1).max(500),
  });

  const { subjectId, examTypeId, academicYearId, marks } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifySubject(subjectId, schoolId);
  await verifyExamType(examTypeId, schoolId);
  await verifyAcademicYear(academicYearId, schoolId);

  // If teacher (not admin), verify they are assigned to this subject
  if (req.user!.role === "TEACHER") {
    const teacher = await prisma.teacher.findFirst({ where: { user: { id: req.user!.userId } } });
    if (!teacher) throw new AppError("Teacher profile not found", 403);
    const assignment = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, subjectId },
    });
    if (!assignment) throw new AppError("You are not assigned to this subject", 403);
  }

  // Validate marks don't exceed full marks
  const subject = await prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });

  for (const m of marks) {
    if (m.theoryMarks != null && m.theoryMarks > subject.fullTheoryMarks) {
      throw new AppError(`Theory marks (${m.theoryMarks}) exceed full marks (${subject.fullTheoryMarks}) for student ${m.studentId}`);
    }
    if (m.practicalMarks != null && m.practicalMarks > subject.fullPracticalMarks) {
      throw new AppError(`Practical marks (${m.practicalMarks}) exceed full marks (${subject.fullPracticalMarks}) for student ${m.studentId}`);
    }
  }

  // Upsert each mark
  const results = await prisma.$transaction(
    marks.map((m) =>
      prisma.mark.upsert({
        where: {
          studentId_subjectId_examTypeId_academicYearId: {
            studentId: m.studentId,
            subjectId,
            examTypeId,
            academicYearId,
          },
        },
        update: {
          theoryMarks: m.isAbsent ? null : m.theoryMarks,
          practicalMarks: m.isAbsent ? null : m.practicalMarks,
          isAbsent: m.isAbsent,
        },
        create: {
          studentId: m.studentId,
          subjectId,
          examTypeId,
          academicYearId,
          theoryMarks: m.isAbsent ? null : m.theoryMarks,
          practicalMarks: m.isAbsent ? null : m.practicalMarks,
          isAbsent: m.isAbsent,
        },
      })
    )
  );

  res.json({ data: results });
});

export default router;
