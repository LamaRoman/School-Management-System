import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifySection } from "../utils/schoolScope";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
  calculateOverallGpaWeighted,
} from "../services/grading.service";
import { assertSectionOwnership } from "../services/resultStatus.service";

const router = Router();

// GET /api/grade-sheet/term?sectionId=xxx&examTypeId=xxx&academicYearId=xxx
router.get("/term", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, examTypeId, academicYearId } = req.query;
  if (!sectionId || !examTypeId || !academicYearId) {
    throw new AppError("sectionId, examTypeId, and academicYearId are required");
  }
  await verifySection(String(sectionId), schoolId);
  // W3b — a section's mark sheet belongs to its class teacher, not to every
  // teacher in the building.
  await assertSectionOwnership(req.user!.userId, req.user!.role, String(sectionId), "view this mark sheet");

  const section = await prisma.section.findUniqueOrThrow({
    where: { id: String(sectionId) },
    include: { grade: true },
  });

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true, name: true, rollNo: true },
  });

  const subjects = await prisma.subject.findMany({
    where: { gradeId: section.gradeId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, fullTheoryMarks: true, fullPracticalMarks: true, creditHour: true, isOptional: true },
  });

  const allMarks = await prisma.mark.findMany({
    where: {
      examTypeId: String(examTypeId),
      academicYearId: String(academicYearId),
      studentId: { in: students.map((s) => s.id) },
    },
  });

  const examType = await prisma.examType.findUniqueOrThrow({
    where: { id: String(examTypeId) },
  });

  const optionalEnrollments = await prisma.studentOptionalSubject.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true, subjectId: true },
  });
  const optionalByStudent = new Map<string, Set<string>>();
  for (const e of optionalEnrollments) {
    let set = optionalByStudent.get(e.studentId);
    if (!set) {
      set = new Set();
      optionalByStudent.set(e.studentId, set);
    }
    set.add(e.subjectId);
  }

  const rows = students.map((student) => {
    const takesOptional = optionalByStudent.get(student.id);
    const subjectResults = subjects.map((subject) => {
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      const mark = allMarks.find(
        (m) => m.studentId === student.id && m.subjectId === subject.id
      );
      // Absent falls through to the normal path — null marks read as 0, so the
      // subject counts toward the GPA below exactly as on the report card. The
      // cell itself prints "Ab".
      const obtained = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
      const pct = calculatePercentage(obtained, fullMarks);
      const gradeResult = getGradeFromPercentage(pct);

      return {
        subjectId: subject.id,
        obtained,
        fullMarks,
        creditHour: subject.creditHour,
        gpa: gradeResult.gpa,
        isAbsent: mark?.isAbsent ?? false,
        notEntered: !mark,
        // Optional subject this student is not enrolled in (R7a). The column stays on
        // the sheet — it is class-wide — but the cell is not theirs and must not be
        // scored as a zero in their totals below.
        notTaken: subject.isOptional && !takesOptional?.has(subject.id),
      };
    });

    // Everything the student is actually assessed on. Absences stay in (they score 0
    // by decision R1); only an optional subject they do not take drops out.
    const counted = subjectResults.filter((s) => !s.notTaken);

    return {
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      subjects: subjectResults,
      // Credit-weighted, the report card's Grade Points Average (same subjects, same rule).
      gpa: calculateOverallGpaWeighted(counted.map((s) => ({ gpa: s.gpa, creditHour: s.creditHour }))),
      // Absent / not entered: the sheet shows "—" for the GPA, as the card does.
      incomplete: counted.some((s) => s.isAbsent || s.notEntered),
    };
  });

  res.json({
    data: {
      gradeName: section.grade.name,
      sectionName: section.name,
      examType: examType.name,
      isFinal: false,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        fullMarks: s.fullTheoryMarks + s.fullPracticalMarks,
      })),
      rows,
      totalStudents: rows.length,
    },
  });
});

// GET /api/grade-sheet/final?sectionId=xxx&academicYearId=xxx
router.get("/final", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, academicYearId } = req.query;
  if (!sectionId || !academicYearId) {
    throw new AppError("sectionId and academicYearId are required");
  }
  await verifySection(String(sectionId), schoolId);
  // W3b — a section's mark sheet belongs to its class teacher, not to every
  // teacher in the building.
  await assertSectionOwnership(req.user!.userId, req.user!.role, String(sectionId), "view this mark sheet");

  const section = await prisma.section.findUniqueOrThrow({
    where: { id: String(sectionId) },
    include: { grade: true },
  });

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true, name: true, rollNo: true },
  });

  const subjects = await prisma.subject.findMany({
    where: { gradeId: section.gradeId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, fullTheoryMarks: true, fullPracticalMarks: true, creditHour: true },
  });

  const policies = await prisma.gradingPolicy.findMany({
    where: { gradeId: section.gradeId },
    include: { examType: true },
    orderBy: { examType: { displayOrder: "asc" } },
  });

  const allMarks = await prisma.mark.findMany({
    where: {
      academicYearId: String(academicYearId),
      studentId: { in: students.map((s) => s.id) },
    },
  });

  const rows = students.map((student) => {
    const stuMarks = allMarks.filter((m) => m.studentId === student.id);

    const subjectResults = subjects.map((subject) => {
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      const subjectMarks = stuMarks.filter((m) => m.subjectId === subject.id);
      // Absent in every term is graded, not dropped — the weighted percentage
      // below reads null marks as 0. Matches the annual report builders.
      const allAbsent = subjectMarks.length > 0 && subjectMarks.every((m) => m.isAbsent);

      const weightedPct = calculateWeightedPercentage(
        policies.map((policy) => {
          const mark = stuMarks.find(
            (m) => m.subjectId === subject.id && m.examTypeId === policy.examTypeId
          );
          const total = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
          return { obtained: total, fullMarks, weightage: policy.weightagePercent };
        })
      );

      const gradeResult = getGradeFromPercentage(weightedPct);

      return {
        subjectId: subject.id,
        fullMarks,
        weightedPercentage: parseFloat(weightedPct.toFixed(1)),
        creditHour: subject.creditHour,
        gpa: gradeResult.gpa,
        isAbsent: allAbsent,
      };
    });

    return {
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      subjects: subjectResults,
      // Every subject counts, absent included — credit-weighted, as on the annual report card.
      gpa: calculateOverallGpaWeighted(subjectResults.map((s) => ({ gpa: s.gpa, creditHour: s.creditHour }))),
      incomplete: subjectResults.some((s) => s.isAbsent),
    };
  });

  res.json({
    data: {
      gradeName: section.grade.name,
      sectionName: section.name,
      examType: "Final (Weighted)",
      isFinal: true,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        fullMarks: s.fullTheoryMarks + s.fullPracticalMarks,
      })),
      rows,
      totalStudents: rows.length,
    },
  });
});

export default router;