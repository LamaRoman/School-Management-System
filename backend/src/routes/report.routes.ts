import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyStudent } from "../utils/schoolScope";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
  calculateOverallGpa,
  hasPassed,
} from "../services/grading.service";

const router = Router();

// Helper: verify the requesting user has access to this student's academic data
async function verifyStudentAccess(userId: string, role: string, studentId: string): Promise<void> {
  if (role === "ADMIN" || role === "TEACHER") return; // full access
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

// Helper: calculate rank for a student among section peers for a given exam
async function calculateTermRank(
  studentId: string,
  sectionId: string,
  examTypeId: string,
  academicYearId: string
): Promise<{ rank: number; totalStudents: number }> {
  const sectionStudents = await prisma.student.findMany({
    where: { sectionId, isActive: true },
    select: { id: true },
  });

  const allMarks = await prisma.mark.findMany({
    where: {
      examTypeId,
      academicYearId,
      studentId: { in: sectionStudents.map((s) => s.id) },
    },
    include: { subject: true },
  });

  const studentPercentages: { studentId: string; avgPct: number }[] = [];

  for (const stu of sectionStudents) {
    const stuMarks = allMarks.filter((m) => m.studentId === stu.id);
    if (stuMarks.length === 0) continue;

    let totalPct = 0;
    for (const m of stuMarks) {
      const fullMarks = m.subject.fullTheoryMarks + m.subject.fullPracticalMarks;
      const obtained = (m.theoryMarks || 0) + (m.practicalMarks || 0);
      totalPct += calculatePercentage(obtained, fullMarks);
    }
    const avgPct = totalPct / stuMarks.length;
    studentPercentages.push({ studentId: stu.id, avgPct });
  }

  studentPercentages.sort((a, b) => b.avgPct - a.avgPct);

  let rank = 0;
  let prevPct = -1;
  let actualPosition = 0;
  for (const sp of studentPercentages) {
    actualPosition++;
    if (sp.avgPct !== prevPct) {
      rank = actualPosition;
      prevPct = sp.avgPct;
    }
    if (sp.studentId === studentId) {
      return { rank, totalStudents: studentPercentages.length };
    }
  }

  return { rank: 0, totalStudents: studentPercentages.length };
}

// Helper: calculate rank for final weighted result
async function calculateFinalRank(
  studentId: string,
  sectionId: string,
  gradeId: string,
  academicYearId: string
): Promise<{ rank: number; totalStudents: number }> {
  const sectionStudents = await prisma.student.findMany({
    where: { sectionId, isActive: true },
    select: { id: true },
  });

  const policies = await prisma.gradingPolicy.findMany({
    where: { gradeId },
    include: { examType: true },
  });

  const subjects = await prisma.subject.findMany({
    where: { gradeId },
  });

  const allMarks = await prisma.mark.findMany({
    where: {
      academicYearId,
      studentId: { in: sectionStudents.map((s) => s.id) },
    },
    include: { subject: true },
  });

  const studentPercentages: { studentId: string; avgPct: number }[] = [];

  for (const stu of sectionStudents) {
    const stuMarks = allMarks.filter((m) => m.studentId === stu.id);
    if (stuMarks.length === 0) continue;

    let totalWeightedPct = 0;
    let subjectCount = 0;

    for (const subject of subjects) {
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
      totalWeightedPct += weightedPct;
      subjectCount++;
    }

    if (subjectCount > 0) {
      studentPercentages.push({ studentId: stu.id, avgPct: totalWeightedPct / subjectCount });
    }
  }

  studentPercentages.sort((a, b) => b.avgPct - a.avgPct);

  let rank = 0;
  let prevPct = -1;
  let actualPosition = 0;
  for (const sp of studentPercentages) {
    actualPosition++;
    if (sp.avgPct !== prevPct) {
      rank = actualPosition;
      prevPct = sp.avgPct;
    }
    if (sp.studentId === studentId) {
      return { rank, totalStudents: studentPercentages.length };
    }
  }

  return { rank: 0, totalStudents: studentPercentages.length };
}

// GET /api/reports/term/:studentId/:examTypeId
router.get("/term/:studentId/:examTypeId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, examTypeId } = req.params;
  await verifyStudent(studentId, schoolId);
  await verifyStudentAccess(req.user!.userId, req.user!.role, studentId);

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const examType = await prisma.examType.findUniqueOrThrow({
    where: { id: examTypeId },
  });

  // Fetch the academic year to get yearBS label
  const academicYear = await prisma.academicYear.findUniqueOrThrow({
    where: { id: examType.academicYearId },
  });

  const marks = await prisma.mark.findMany({
    where: { studentId, examTypeId },
    include: { subject: true },
    orderBy: { subject: { displayOrder: "asc" } },
  });

  if (marks.length === 0) {
    throw new AppError("No marks found for this student and exam", 404);
  }

  const school = await prisma.school.findFirst({ where: { id: schoolId } });

  const hasPracticalSubjects = marks.some((m) => m.subject.fullPracticalMarks > 0);

  const subjects = marks.map((m) => {
    const fullMarks = m.subject.fullTheoryMarks + m.subject.fullPracticalMarks;
    const theory = m.theoryMarks || 0;
    const practical = m.practicalMarks || 0;
    const total = theory + practical;
    const pct = calculatePercentage(total, fullMarks);
    const gradeResult = getGradeFromPercentage(pct);

    return {
      subjectName: m.subject.name,
      subjectNameNp: m.subject.nameNp,
      fullMarks,
      passMarks: m.subject.passMarks,
      theoryMarks: theory,
      practicalMarks: practical,
      totalMarks: total,
      percentage: parseFloat(pct.toFixed(1)),
      grade: gradeResult.grade,
      gpa: gradeResult.gpa,
      hasPassed: hasPassed(total, m.subject.passMarks),
      isAbsent: m.isAbsent,
    };
  });

  const gpas = subjects.map((s) => s.gpa);
  const overallGpa = calculateOverallGpa(gpas);
  const overallPct = parseFloat(
    (subjects.reduce((a, s) => a + s.percentage, 0) / subjects.length).toFixed(1)
  );
  const overallGrade = getGradeFromPercentage(overallPct);

  const attendance = await prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: examType.academicYearId } },
  });

  // Calculate rank if enabled for this exam type
  let rankData: { rank: number; totalStudents: number } | undefined;
  if (examType.showRank) {
    rankData = await calculateTermRank(studentId, student.sectionId, examTypeId, examType.academicYearId);
  }

  res.json({
    data: {
      school: school || {},
      student: {
        name: student.name,
        nameNp: student.nameNp,
        className: student.section.grade.name,
        section: student.section.name,
        rollNo: student.rollNo,
        dateOfBirth: student.dateOfBirth,
      },
      academicYear: academicYear.yearBS,
      examType: examType.name,
      paperSize: examType.paperSize,
      isTermReport: true,
      hasPractical: hasPracticalSubjects,
      subjects,
      overallPercentage: overallPct,
      overallGrade: overallGrade.grade,
      overallGpa,
      rank: rankData?.rank,
      totalStudents: rankData?.totalStudents,
      showRank: examType.showRank,
      attendance: attendance
        ? { totalDays: attendance.totalDays, presentDays: attendance.presentDays, absentDays: attendance.absentDays }
        : undefined,
    },
  });
});

// GET /api/reports/final/:studentId/:academicYearId
router.get("/final/:studentId/:academicYearId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, academicYearId } = req.params;
  await verifyStudent(studentId, schoolId);
  await verifyStudentAccess(req.user!.userId, req.user!.role, studentId);

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const gradeId = student.section.grade.id;

  // Fetch the academic year to get yearBS label
  const academicYear = await prisma.academicYear.findUniqueOrThrow({
    where: { id: academicYearId },
  });

  const policies = await prisma.gradingPolicy.findMany({
    where: { gradeId },
    include: { examType: true },
    orderBy: { examType: { displayOrder: "asc" } },
  });

  if (policies.length === 0) {
    throw new AppError("No grading policy found for this grade", 404);
  }

  const subjects = await prisma.subject.findMany({
    where: { gradeId },
    orderBy: { displayOrder: "asc" },
  });

  const allMarks = await prisma.mark.findMany({
    where: { studentId, academicYearId },
    include: { subject: true, examType: true },
  });

  const school = await prisma.school.findFirst({ where: { id: schoolId } });

  const finalSubjects = subjects.map((subject) => {
    const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;

    const terms = policies.map((policy) => {
      const mark = allMarks.find(
        (m) => m.subjectId === subject.id && m.examTypeId === policy.examTypeId
      );
      const total = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
      const pct = calculatePercentage(total, fullMarks);

      return {
        examTypeName: policy.examType.name,
        totalMarks: total,
        percentage: parseFloat(pct.toFixed(1)),
        weightage: policy.weightagePercent,
        weightedContribution: parseFloat((pct * (policy.weightagePercent / 100)).toFixed(1)),
      };
    });

    const weightedPct = calculateWeightedPercentage(
      policies.map((policy) => {
        const mark = allMarks.find(
          (m) => m.subjectId === subject.id && m.examTypeId === policy.examTypeId
        );
        const total = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
        return { obtained: total, fullMarks, weightage: policy.weightagePercent };
      })
    );

    const gradeResult = getGradeFromPercentage(weightedPct);

    return {
      subjectName: subject.name,
      subjectNameNp: subject.nameNp,
      fullMarks,
      passMarks: subject.passMarks,
      terms,
      weightedPercentage: parseFloat(weightedPct.toFixed(1)),
      grade: gradeResult.grade,
      gpa: gradeResult.gpa,
      hasPassed: hasPassed(weightedPct, (subject.passMarks / fullMarks) * 100),
    };
  });

  const gpas = finalSubjects.map((s) => s.gpa);
  const overallGpa = calculateOverallGpa(gpas);
  const overallPct = parseFloat(
    (finalSubjects.reduce((a, s) => a + s.weightedPercentage, 0) / finalSubjects.length).toFixed(1)
  );
  const overallGrade = getGradeFromPercentage(overallPct);

  const attendance = await prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });

  const consolidated = await prisma.consolidatedResult.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });

  // Find the Final exam type to check showRank and paperSize
  const finalExamType = await prisma.examType.findFirst({
    where: { isFinal: true, academicYearId },
  });
  const showRank = finalExamType?.showRank ?? true;

  let rankData: { rank: number; totalStudents: number } | undefined;
  if (showRank) {
    rankData = await calculateFinalRank(studentId, student.sectionId, gradeId, academicYearId);
  }

  res.json({
    data: {
      school: school || {},
      student: {
        name: student.name,
        nameNp: student.nameNp,
        className: student.section.grade.name,
        section: student.section.name,
        rollNo: student.rollNo,
        dateOfBirth: student.dateOfBirth,
      },
      academicYear: academicYear.yearBS,
      examType: finalExamType?.name || "Final",
      paperSize: finalExamType?.paperSize || "A4",
      isTermReport: false,
      hasPractical: subjects.some((s) => s.fullPracticalMarks > 0),
      subjects: finalSubjects,
      overallPercentage: overallPct,
      overallGrade: overallGrade.grade,
      overallGpa,
      rank: rankData?.rank,
      totalStudents: rankData?.totalStudents,
      showRank,
      attendance: attendance
        ? { totalDays: attendance.totalDays, presentDays: attendance.presentDays, absentDays: attendance.absentDays }
        : undefined,
      remarks: consolidated?.remarks,
      promoted: consolidated?.promoted,
      promotedTo: consolidated?.promotedTo,
    },
  });
});

export default router;