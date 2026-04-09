import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyStudent, verifySection } from "../utils/schoolScope";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
  calculateOverallGpa,
  hasPassed,
} from "../services/grading.service";
import {
  generatePdf,
  buildReportCardHtml,
  buildBatchReportCardHtml,
  defaultColumnSettings,
} from "../services/pdf.service";
import type { ReportCardColumnSettings } from "../services/pdf.service";

const router = Router();

// Helper: fetch column settings from DB
async function getColumnSettings(): Promise<ReportCardColumnSettings> {
  const school = await prisma.school.findFirst();
  if (!school) return defaultColumnSettings;
  const settings = await prisma.reportCardSettings.findUnique({
    where: { schoolId: school.id },
  });
  if (!settings) return defaultColumnSettings;
  return {
    showPassMarks: settings.showPassMarks,
    showTheoryPrac: settings.showTheoryPrac,
    showPercentage: settings.showPercentage,
    showGrade: settings.showGrade,
    showGpa: settings.showGpa,
    showRank: settings.showRank,
    showAttendance: settings.showAttendance,
    showRemarks: settings.showRemarks,
    showPromotion: settings.showPromotion,
  };
}

// Helper: fetch observations for a student + exam
async function getObservations(studentId: string, examTypeId: string, gradeId: string): Promise<any[] | null> {
  const categories = await prisma.observationCategory.findMany({
    where: { gradeId, isActive: true },
    orderBy: { displayOrder: "asc" },
  });
  if (categories.length === 0) return null;
  const results = await prisma.observationResult.findMany({
    where: {
      studentId,
      examTypeId,
      categoryId: { in: categories.map((c) => c.id) },
    },
  });
  return categories.map((cat) => {
    const result = results.find((r) => r.categoryId === cat.id);
    return { categoryName: cat.name, grade: result?.grade || "—" };
  });
}

// ─── REPORT DATA BUILDERS ───────────────────────────────

async function buildTermReportData(studentId: string, examTypeId: string) {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const examType = await prisma.examType.findUniqueOrThrow({
    where: { id: examTypeId },
  });

  const academicYear = await prisma.academicYear.findUniqueOrThrow({
    where: { id: examType.academicYearId },
  });

  const marks = await prisma.mark.findMany({
    where: { studentId, examTypeId },
    include: { subject: true },
    orderBy: { subject: { displayOrder: "asc" } },
  });

  if (marks.length === 0) return null;

  const school = await prisma.school.findFirst();
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
      fullMarks,
      passMarks: m.subject.passMarks,
      theoryMarks: theory,
      practicalMarks: practical,
      totalMarks: total,
      percentage: parseFloat(pct.toFixed(1)),
      grade: gradeResult.grade,
      gpa: gradeResult.gpa,
      hasPassed: hasPassed(total, m.subject.passMarks),
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

  // Rank
  let rank: number | undefined;
  let totalStudents: number | undefined;
  if (examType.showRank) {
    const sectionStudents = await prisma.student.findMany({
      where: { sectionId: student.sectionId, isActive: true },
      select: { id: true },
    });
    const allMarks = await prisma.mark.findMany({
      where: {
        examTypeId,
        academicYearId: examType.academicYearId,
        studentId: { in: sectionStudents.map((s) => s.id) },
      },
      include: { subject: true },
    });
    const studentPercentages: { studentId: string; avgPct: number }[] = [];
    for (const stu of sectionStudents) {
      const stuMarks = allMarks.filter((m) => m.studentId === stu.id);
      if (stuMarks.length === 0) continue;
      let totalPctSum = 0;
      for (const m of stuMarks) {
        const fm = m.subject.fullTheoryMarks + m.subject.fullPracticalMarks;
        totalPctSum += calculatePercentage((m.theoryMarks || 0) + (m.practicalMarks || 0), fm);
      }
      studentPercentages.push({ studentId: stu.id, avgPct: totalPctSum / stuMarks.length });
    }
    studentPercentages.sort((a, b) => b.avgPct - a.avgPct);
    let r = 0, prevPct = -1, pos = 0;
    for (const sp of studentPercentages) {
      pos++;
      if (sp.avgPct !== prevPct) { r = pos; prevPct = sp.avgPct; }
      if (sp.studentId === studentId) { rank = r; totalStudents = studentPercentages.length; break; }
    }
  }

  return {
    _studentId: studentId,
    _gradeId: student.section.gradeId,
    school: school || {},
    student: {
      name: student.name,
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
    rank,
    totalStudents,
    showRank: examType.showRank,
    attendance: attendance
      ? { totalDays: attendance.totalDays, presentDays: attendance.presentDays, absentDays: attendance.absentDays }
      : undefined,
    _observations: null as any[] | null,
  };
}

async function buildFinalReportData(studentId: string, academicYearId: string) {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const gradeId = student.section.grade.id;

  const academicYear = await prisma.academicYear.findUniqueOrThrow({
    where: { id: academicYearId },
  });

  const policies = await prisma.gradingPolicy.findMany({
    where: { gradeId },
    include: { examType: true },
    orderBy: { examType: { displayOrder: "asc" } },
  });

  if (policies.length === 0) return null;

  const subjects = await prisma.subject.findMany({
    where: { gradeId },
    orderBy: { displayOrder: "asc" },
  });

  const allMarks = await prisma.mark.findMany({
    where: { studentId, academicYearId },
    include: { subject: true, examType: true },
  });

  const school = await prisma.school.findFirst();

  const finalSubjects = subjects.map((subject) => {
    const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
    const terms = policies.map((policy) => {
      const mark = allMarks.find((m) => m.subjectId === subject.id && m.examTypeId === policy.examTypeId);
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
        const mark = allMarks.find((m) => m.subjectId === subject.id && m.examTypeId === policy.examTypeId);
        const total = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
        return { obtained: total, fullMarks, weightage: policy.weightagePercent };
      })
    );

    const gradeResult = getGradeFromPercentage(weightedPct);
    return {
      subjectName: subject.name,
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

  const finalExamType = await prisma.examType.findFirst({
    where: { name: "Final", academicYearId },
  });
  const showRank = finalExamType?.showRank ?? true;

  // Rank
  let rank: number | undefined;
  let totalStudents: number | undefined;
  if (showRank) {
    const sectionStudents = await prisma.student.findMany({
      where: { sectionId: student.sectionId, isActive: true },
      select: { id: true },
    });
    const allStuMarks = await prisma.mark.findMany({
      where: { academicYearId, studentId: { in: sectionStudents.map((s) => s.id) } },
      include: { subject: true },
    });
    const studentPercentages: { studentId: string; avgPct: number }[] = [];
    for (const stu of sectionStudents) {
      const stuMarks = allStuMarks.filter((m) => m.studentId === stu.id);
      if (stuMarks.length === 0) continue;
      let totalWeightedPct = 0, subjectCount = 0;
      for (const subject of subjects) {
        const fm = subject.fullTheoryMarks + subject.fullPracticalMarks;
        const wp = calculateWeightedPercentage(
          policies.map((policy) => {
            const mark = stuMarks.find((m) => m.subjectId === subject.id && m.examTypeId === policy.examTypeId);
            const total = mark ? (mark.theoryMarks || 0) + (mark.practicalMarks || 0) : 0;
            return { obtained: total, fullMarks: fm, weightage: policy.weightagePercent };
          })
        );
        totalWeightedPct += wp;
        subjectCount++;
      }
      if (subjectCount > 0) studentPercentages.push({ studentId: stu.id, avgPct: totalWeightedPct / subjectCount });
    }
    studentPercentages.sort((a, b) => b.avgPct - a.avgPct);
    let r = 0, prevPct = -1, pos = 0;
    for (const sp of studentPercentages) {
      pos++;
      if (sp.avgPct !== prevPct) { r = pos; prevPct = sp.avgPct; }
      if (sp.studentId === studentId) { rank = r; totalStudents = studentPercentages.length; break; }
    }
  }

  return {
    _studentId: studentId,
    _gradeId: gradeId,
    _examTypeId: finalExamType?.id || "",
    school: school || {},
    student: {
      name: student.name,
      className: student.section.grade.name,
      section: student.section.name,
      rollNo: student.rollNo,
      dateOfBirth: student.dateOfBirth,
    },
    academicYear: academicYear.yearBS,
    examType: "Final",
    paperSize: finalExamType?.paperSize || "A4",
    isTermReport: false,
    hasPractical: subjects.some((s) => s.fullPracticalMarks > 0),
    subjects: finalSubjects,
    overallPercentage: overallPct,
    overallGrade: overallGrade.grade,
    overallGpa,
    rank,
    totalStudents,
    showRank,
    attendance: attendance
      ? { totalDays: attendance.totalDays, presentDays: attendance.presentDays, absentDays: attendance.absentDays }
      : undefined,
    remarks: consolidated?.remarks,
    promoted: consolidated?.promoted,
    promotedTo: consolidated?.promotedTo,
    _observations: null as any[] | null,
  };
}

// ─── ROUTES ─────────────────────────────────────────────

// GET /api/pdf/term/:studentId/:examTypeId?mode=color|bw
router.get("/term/:studentId/:examTypeId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, examTypeId } = req.params;
  await verifyStudent(studentId, schoolId);
  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const reportData = await buildTermReportData(studentId, examTypeId);
  if (!reportData) throw new AppError("No marks found for this student and exam", 404);

  const cols = await getColumnSettings();
  const obs = await getObservations(reportData._studentId, examTypeId, reportData._gradeId);
  const html = buildReportCardHtml(reportData, mode, cols, obs);
  const pdfBuffer = await generatePdf({
    html,
    paperSize: reportData.paperSize as "A4" | "A5",
  });

  const filename = `${reportData.student.name.replace(/\s+/g, "_")}_${reportData.examType.replace(/\s+/g, "_")}_${reportData.academicYear}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});

// GET /api/pdf/final/:studentId/:academicYearId?mode=color|bw
router.get("/final/:studentId/:academicYearId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, academicYearId } = req.params;
  await verifyStudent(studentId, schoolId);
  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const reportData = await buildFinalReportData(studentId, academicYearId);
  if (!reportData) throw new AppError("No report data found for this student", 404);

  const cols = await getColumnSettings();
  const obs = await getObservations(reportData._studentId, reportData._examTypeId, reportData._gradeId);
  const html = buildReportCardHtml(reportData, mode, cols, obs);
  const pdfBuffer = await generatePdf({
    html,
    paperSize: reportData.paperSize as "A4" | "A5",
  });

  const filename = `${reportData.student.name.replace(/\s+/g, "_")}_Final_${reportData.academicYear}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});

// GET /api/pdf/class/term/:sectionId/:examTypeId?mode=color|bw
router.get("/class/term/:sectionId/:examTypeId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, examTypeId } = req.params;
  await verifySection(sectionId, schoolId);
  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const students = await prisma.student.findMany({
    where: { sectionId, isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true },
  });

  if (students.length === 0) throw new AppError("No students found in this section", 404);

  const examType = await prisma.examType.findUniqueOrThrow({ where: { id: examTypeId } });
  const section = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });

  const reportDataArray: any[] = [];
  for (const stu of students) {
    const data = await buildTermReportData(stu.id, examTypeId);
    if (data) {
      data._observations = await getObservations(stu.id, examTypeId, section.gradeId);
      reportDataArray.push(data);
    }
  }

  if (reportDataArray.length === 0) throw new AppError("No marks found for any student", 404);

  const cols = await getColumnSettings();
  const html = buildBatchReportCardHtml(reportDataArray, mode, examType.paperSize as "A4" | "A5", cols);
  const pdfBuffer = await generatePdf({ html, paperSize: examType.paperSize as "A4" | "A5" });

  const sectionWithGrade = await prisma.section.findUniqueOrThrow({
    where: { id: sectionId },
    include: { grade: true },
  });

  const filename = `${sectionWithGrade.grade.name}_Section_${sectionWithGrade.name}_${examType.name.replace(/\s+/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});

// GET /api/pdf/class/final/:sectionId/:academicYearId?mode=color|bw
router.get("/class/final/:sectionId/:academicYearId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, academicYearId } = req.params;
  await verifySection(sectionId, schoolId);
  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const students = await prisma.student.findMany({
    where: { sectionId, isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true },
  });

  if (students.length === 0) throw new AppError("No students found in this section", 404);

  const finalExamType = await prisma.examType.findFirst({ where: { name: "Final", academicYearId } });
  const section = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });

  const reportDataArray: any[] = [];
  for (const stu of students) {
    const data = await buildFinalReportData(stu.id, academicYearId);
    if (data) {
      data._observations = await getObservations(stu.id, finalExamType?.id || "", section.gradeId);
      reportDataArray.push(data);
    }
  }

  if (reportDataArray.length === 0) throw new AppError("No report data found", 404);

  const paperSize = (finalExamType?.paperSize as "A4" | "A5") || "A4";
  const cols = await getColumnSettings();
  const html = buildBatchReportCardHtml(reportDataArray, mode, paperSize, cols);
  const pdfBuffer = await generatePdf({ html, paperSize });

  const sectionWithGrade = await prisma.section.findUniqueOrThrow({
    where: { id: sectionId },
    include: { grade: true },
  });

  const academicYear = await prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } });

  const filename = `${sectionWithGrade.grade.name}_Section_${sectionWithGrade.name}_Final_${academicYear.yearBS}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});

export default router;