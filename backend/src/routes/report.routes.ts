import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyStudent } from "../utils/schoolScope";
import { verifyStudentAccess } from "../utils/studentAccess";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
  calculateOverallGpa,
  hasPassed,
  totalMarksPercentage,
} from "../services/grading.service";
import { computeSectionRanks, computeFinalSectionRanks } from "../services/rank.service";
import {
  isSectionPublished,
  pendingTermsForAnnual,
  isGatedRole,
} from "../services/resultStatus.service";

const router = Router();

// Helper: calculate rank for a student among section peers for a given exam.
// The algorithm lives in services/rank.service.ts — this used to be a second copy of
// it, and the PDF report card a third (R7). Keeping the thin wrapper so the call sites
// below read the same as before.
async function calculateTermRank(
  studentId: string,
  sectionId: string,
  examTypeId: string,
  academicYearId: string
): Promise<{ rank: number | null; totalStudents: number }> {
  const ranking = await computeSectionRanks(sectionId, examTypeId, academicYearId);
  // null = not ranked: only students who passed get a position (see rank.service).
  return { rank: ranking.ranks.get(studentId)?.rank ?? null, totalStudents: ranking.totalStudents };
}

// Helper: rank for the final weighted result — the shared annual ranking (rank.service).
async function calculateFinalRank(
  studentId: string,
  sectionId: string,
  academicYearId: string
): Promise<{ rank: number | null; totalStudents: number }> {
  const ranking = await computeFinalSectionRanks(sectionId, academicYearId);
  return { rank: ranking.ranks.get(studentId)?.rank ?? null, totalStudents: ranking.totalStudents };
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

  // W1e — a family sees an explicit pending state, not a live number computed
  // from half-entered marks and not a bare error. 200 with a pending payload
  // rather than 4xx: "not out yet" is a normal state of the world, and the
  // portal should be able to say so without treating it as a failure.
  if (isGatedRole(req.user!.role) && !(await isSectionPublished(student.sectionId, examTypeId))) {
    return res.json({
      data: {
        pending: true,
        examName: examType.name,
        studentName: student.name,
        message: `${examType.name} results have not been published yet.`,
      },
    });
  }

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

  // Every subject in the grade, not only the ones with a mark row — see the same
  // reasoning in pdf.routes.ts. The portal and the printed card must agree.
  const markBySubjectId = new Map(marks.map((m) => [m.subjectId, m]));
  const takesOptional = new Set(
    (
      await prisma.studentOptionalSubject.findMany({
        where: { studentId },
        select: { subjectId: true },
      })
    ).map((e) => e.subjectId)
  );
  const gradeSubjects = (
    await prisma.subject.findMany({
      where: { gradeId: student.section.gradeId },
      orderBy: { displayOrder: "asc" },
    })
  ).filter(
    // See pdf.routes.ts — an elective is on the card only for students enrolled in it (R7a).
    (subject) => !subject.isOptional || takesOptional.has(subject.id)
  );

  const hasPracticalSubjects = gradeSubjects.some((s) => s.fullPracticalMarks > 0);

  const subjects = gradeSubjects.map((subject) => {
    const m = markBySubjectId.get(subject.id);
    const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
    // Absent falls through to the normal path: null marks read as 0, grading
    // the subject E / 0.8 so it counts toward the averages below rather than
    // being dropped from them. A subject with no mark row at all is scored the
    // same way and differs only in how it prints. Kept deliberately identical to
    // the PDF builder in pdf.routes.ts.
    const theory = m?.theoryMarks || 0;
    const practical = m?.practicalMarks || 0;
    const total = theory + practical;
    const pct = calculatePercentage(total, fullMarks);
    const gradeResult = getGradeFromPercentage(pct);

    return {
      subjectName: subject.name,
      subjectNameNp: subject.nameNp,
      fullMarks,
      passMarks: subject.passMarks,
      theoryMarks: theory,
      practicalMarks: practical,
      totalMarks: total,
      percentage: parseFloat(pct.toFixed(1)),
      grade: gradeResult.grade,
      gpa: gradeResult.gpa,
      hasPassed: hasPassed(total, subject.passMarks),
      isAbsent: m?.isAbsent ?? false,
      notEntered: !m,
    };
  });

  // Averaged over every subject in the grade — absent and not-yet-entered
  // included, so a missing paper lowers the result instead of raising it and the
  // figures stay on the same basis as the rank below.
  const overallGpa = calculateOverallGpa(subjects.map((s) => s.gpa));
  // Total marks over total full marks (totalMarksPercentage) — the school's method, and
  // the same figure the rank uses.
  const overallPct = subjects.length > 0 ? parseFloat(totalMarksPercentage(subjects).toFixed(1)) : 0;
  const overallGrade = subjects.length > 0 ? getGradeFromPercentage(overallPct) : { grade: "", gpa: null, description: "" };

  const attendance = await prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: examType.academicYearId } },
  });

  // Calculate rank if enabled for this exam type
  let rankData: { rank: number | null; totalStudents: number } | undefined;
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
      // An absent or not-yet-entered paper: the overall %, grade and GPA are not shown
      // ("—") while the result is Incomplete. The numbers stay in the payload so older
      // app versions that format them keep working.
      incomplete: subjects.some((s: any) => s.isAbsent || s.notEntered),
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

  // The annual result is the weighted combination of the terms, so it is
  // gated by them rather than published separately: it becomes visible when
  // every exam type carrying weight in this grade's policy is out. Naming the
  // terms still pending is more use to a parent than "not yet".
  if (isGatedRole(req.user!.role)) {
    const pendingTerms = await pendingTermsForAnnual(student.sectionId, gradeId);
    if (pendingTerms.length > 0) {
      return res.json({
        data: {
          pending: true,
          pendingTerms,
          studentName: student.name,
          message:
            `The final result is published once every term is out. ` +
            `Still pending: ${pendingTerms.join(", ")}.`,
        },
      });
    }
  }

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
        isAbsent: mark?.isAbsent ?? false,
      };
    });

    // Absent in every term is still graded, not dropped — the weighted
    // percentage below reads null marks as 0. This also makes full absence
    // consistent with partial absence, which already weighted in as 0.
    const allTermsAbsent = terms.every((t: any) => t.isAbsent);

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
      isAbsent: allTermsAbsent,
    };
  });

  // Every subject counts, absent included — same reasoning as the term report.
  const overallGpa = calculateOverallGpa(finalSubjects.map((s) => s.gpa));
  const overallPct = finalSubjects.length > 0
    ? parseFloat(totalMarksPercentage(finalSubjects.map((s: any) => ({ percentage: s.weightedPercentage, fullMarks: s.fullMarks }))).toFixed(1))
    : 0;
  const overallGrade = finalSubjects.length > 0 ? getGradeFromPercentage(overallPct) : { grade: "", gpa: null, description: "" };

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

  let rankData: { rank: number | null; totalStudents: number } | undefined;
  if (showRank) {
    rankData = await calculateFinalRank(studentId, student.sectionId, academicYearId);
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
      // An absent or not-yet-entered paper: the overall %, grade and GPA are not shown
      // ("—") while the result is Incomplete. The numbers stay in the payload so older
      // app versions that format them keep working.
      incomplete: finalSubjects.some((s: any) => s.isAbsent || s.notEntered),
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