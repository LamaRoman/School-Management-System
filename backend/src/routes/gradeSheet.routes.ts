import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifySection } from "../utils/schoolScope";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
  calculateOverallGpa,
} from "../services/grading.service";
import { computeSectionRanks } from "../services/rank.service";
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
    select: { id: true, name: true, fullTheoryMarks: true, fullPracticalMarks: true, passMarks: true, isOptional: true },
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
      // subject grades E / 0.8 and counts toward the averages below. This is
      // also what keeps the Total column (which has always summed absences as
      // 0 over the full marks) agreeing with the Percentage column beside it.
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
        isAbsent: mark?.isAbsent ?? false,
        // Optional subject this student is not enrolled in (R7a). The column stays on
        // the sheet — it is class-wide — but the cell is not theirs and must not be
        // scored as a zero in their totals below.
        notTaken: subject.isOptional && !takesOptional?.has(subject.id),
      };
    });

    // Everything the student is actually assessed on. Absences stay in (they score 0
    // by decision R1); only an optional subject they do not take drops out.
    const counted = subjectResults.filter((s) => !s.notTaken);

    const totalObtained = counted.reduce((a, s) => a + s.obtained, 0);
    const totalFullMarks = counted.reduce((a, s) => a + s.fullMarks, 0);
    // Averaged over every counted subject, absent included, so this column stays
    // consistent with totalObtained / totalFullMarks above and with the rank
    // derived from it below.
    const avgPct = counted.length > 0
      ? parseFloat((counted.reduce((a, s) => a + s.percentage, 0) / counted.length).toFixed(1))
      : 0;
    const avgGpa = calculateOverallGpa(counted.map((s) => s.gpa));
    const overallGrade = counted.length > 0 ? getGradeFromPercentage(avgPct) : { grade: "", gpa: null, description: "" };

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

  // Ranks come from the one shared implementation (R7) so this sheet and the report
  // cards printed from the same marks cannot disagree. It recomputes the averages from
  // the same rule used for the Percentage column above — deliberately, so the service
  // stays the single definition rather than this passing its own numbers in.
  const { ranks } = await computeSectionRanks(
    String(sectionId),
    String(examTypeId),
    String(academicYearId)
  );
  for (const row of rows) {
    row.rank = ranks.get(row.studentId)?.rank ?? 0;
  }

  res.json({
    data: {
      gradeName: section.grade.name,
      sectionName: section.name,
      examType: examType.name,
      isFinal: false,
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
    where: { isFinal: true, academicYearId: String(academicYearId) },
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
        weightedPercentage: parseFloat(weightedPct.toFixed(1)),
        grade: gradeResult.grade,
        gpa: gradeResult.gpa,
        passed: weightedPct >= (subject.passMarks / fullMarks) * 100,
        isAbsent: allAbsent,
      };
    });

    // Every subject counts, absent included — same reasoning as the term sheet.
    const avgPct = subjectResults.length > 0
      ? parseFloat((subjectResults.reduce((a, s) => a + s.weightedPercentage, 0) / subjectResults.length).toFixed(1))
      : 0;
    const avgGpa = calculateOverallGpa(subjectResults.map((s) => s.gpa));
    const overallGrade = subjectResults.length > 0 ? getGradeFromPercentage(avgPct) : { grade: "", gpa: null, description: "" };

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
      isFinal: true,
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