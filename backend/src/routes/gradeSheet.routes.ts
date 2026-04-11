import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifySection } from "../utils/schoolScope";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
} from "../services/grading.service";

const router = Router();

// GET /api/grade-sheet/term?sectionId=xxx&examTypeId=xxx&academicYearId=xxx
router.get("/term", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, examTypeId, academicYearId } = req.query;
  if (!sectionId || !examTypeId || !academicYearId) {
    throw new AppError("sectionId, examTypeId, and academicYearId are required");
  }
  await verifySection(String(sectionId), schoolId);

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
    select: { id: true, name: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true },
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

  const rows = students.map((student) => {
    const subjectResults = subjects.map((subject) => {
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      const mark = allMarks.find(
        (m) => m.studentId === student.id && m.subjectId === subject.id
      );
      const obtained = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
      const pct = calculatePercentage(obtained, fullMarks);
      const gradeResult = getGradeFromPercentage(pct);

      return {
        subjectId: subject.id,
        obtained,
        fullMarks,
        percentage: parseFloat(pct.toFixed(1)),
        grade: gradeResult.grade,
        gpa: gradeResult.gpa,
        passed: obtained >= subject.passMarks,
      };
    });

    const totalObtained = subjectResults.reduce((a, s) => a + s.obtained, 0);
    const totalFullMarks = subjectResults.reduce((a, s) => a + s.fullMarks, 0);
    const avgPct = subjectResults.length > 0
      ? parseFloat((subjectResults.reduce((a, s) => a + s.percentage, 0) / subjectResults.length).toFixed(1))
      : 0;
    const avgGpa = subjectResults.length > 0
      ? parseFloat((subjectResults.reduce((a, s) => a + s.gpa, 0) / subjectResults.length).toFixed(2))
      : 0;
    const overallGrade = getGradeFromPercentage(avgPct);

    return {
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      subjects: subjectResults,
      totalObtained,
      totalFullMarks,
      percentage: avgPct,
      gpa: avgGpa,
      grade: overallGrade.grade,
      rank: 0,
    };
  });

  // Calculate ranks
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  let rank = 0;
  let prevPct = -1;
  let position = 0;
  for (const row of sorted) {
    position++;
    if (row.percentage !== prevPct) {
      rank = position;
      prevPct = row.percentage;
    }
    const original = rows.find((r) => r.studentId === row.studentId);
    if (original) original.rank = rank;
  }

  res.json({
    data: {
      gradeName: section.grade.name,
      sectionName: section.name,
      examType: examType.name,
      showRank: examType.showRank,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        fullMarks: s.fullTheoryMarks + s.fullPracticalMarks,
        passMarks: s.passMarks,
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
    select: { id: true, name: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true },
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

  const finalExamType = await prisma.examType.findFirst({
    where: { name: "Final", academicYearId: String(academicYearId) },
  });

  const rows = students.map((student) => {
    const stuMarks = allMarks.filter((m) => m.studentId === student.id);

    const subjectResults = subjects.map((subject) => {
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;

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
        weightedPercentage: parseFloat(weightedPct.toFixed(1)),
        grade: gradeResult.grade,
        gpa: gradeResult.gpa,
        passed: weightedPct >= (subject.passMarks / fullMarks) * 100,
      };
    });

    const avgPct = subjectResults.length > 0
      ? parseFloat((subjectResults.reduce((a, s) => a + s.weightedPercentage, 0) / subjectResults.length).toFixed(1))
      : 0;
    const avgGpa = subjectResults.length > 0
      ? parseFloat((subjectResults.reduce((a, s) => a + s.gpa, 0) / subjectResults.length).toFixed(2))
      : 0;
    const overallGrade = getGradeFromPercentage(avgPct);

    return {
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      subjects: subjectResults,
      percentage: avgPct,
      gpa: avgGpa,
      grade: overallGrade.grade,
      rank: 0,
    };
  });

  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  let rank = 0;
  let prevPct = -1;
  let position = 0;
  for (const row of sorted) {
    position++;
    if (row.percentage !== prevPct) {
      rank = position;
      prevPct = row.percentage;
    }
    const original = rows.find((r) => r.studentId === row.studentId);
    if (original) original.rank = rank;
  }

  res.json({
    data: {
      gradeName: section.grade.name,
      sectionName: section.name,
      examType: "Final (Weighted)",
      showRank: finalExamType?.showRank ?? true,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        fullMarks: s.fullTheoryMarks + s.fullPracticalMarks,
        passMarks: s.passMarks,
      })),
      rows,
      totalStudents: rows.length,
    },
  });
});

export default router;