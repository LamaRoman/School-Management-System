import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyStudent, verifySection } from "../utils/schoolScope";
import {
  getGradeFromPercentage,
  calculatePercentage,
  calculateWeightedPercentage,
  calculateOverallGpa,
  calculateOverallGpaWeighted,
  hasPassed,
} from "../services/grading.service";
import {
  generatePdf,
  buildReportCardHtml,
  buildBatchReportCardHtml,
  defaultColumnSettings,
} from "../services/pdf.service";
import type { ReportCardColumnSettings } from "../services/pdf.service";
import { computeSectionRanks } from "../services/rank.service";
import type { SectionRanking } from "../services/rank.service";

const router = Router();

// Helper: fetch column settings from DB
async function getColumnSettings(schoolId: string): Promise<ReportCardColumnSettings> {
  const settings = await prisma.reportCardSettings.findUnique({
    where: { schoolId },
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
    showNepaliName: settings.showNepaliName,
    logoPosition: (settings.logoPosition as "left" | "center" | "center-inline" | "right") || "center",
    logoSize: (settings.logoSize as "small" | "medium" | "large") || "medium",
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

/**
 * `precomputedRanking` lets a bulk caller compute the section's ranking once and pass
 * it in, instead of this rebuilding the identical ranking for every student in the
 * class — the quadratic behaviour described in P3.
 */
async function buildTermReportData(
  studentId: string,
  examTypeId: string,
  schoolId: string,
  precomputedRanking?: SectionRanking
) {
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

  // Every subject in the grade, not just the ones this student has a mark row for.
  // A subject whose marks have not been entered yet still counts as 0 toward the
  // averages and the rank (R7), so it has to appear on the card — otherwise the
  // printed rows do not add up to the printed percentage, which is precisely the
  // hand-checkability R4 was about.
  const markBySubjectId = new Map(marks.map((m) => [m.subjectId, m]));
  const gradeSubjects = (
    await prisma.subject.findMany({
      where: { gradeId: student.section.gradeId },
      orderBy: { displayOrder: "asc" },
    })
  ).filter(
    // An optional subject with no mark row is one this student does not take, so it
    // is not on their card and not in their divisor (R7a). A *required* subject with
    // no mark row is an un-entered mark and stays, scored 0.
    (subject) => !(subject.isOptional && !markBySubjectId.has(subject.id))
  );

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const hasPracticalSubjects = gradeSubjects.some((s) => s.fullPracticalMarks > 0);
  const gradingStyle = student.section.grade.gradingStyle;

  let subjects: any[];
  let overallGpa: number | null;
  let overallPct: number;
  let overallGradeLabel: string;

  if (gradingStyle === "CREDIT_GRADE_BASED") {
    // Credit-hour / grade-point style (SEE/NEB-like): Theory and Practical
    // are each graded on their own full marks, then a Final Grade is derived
    // from the combined percentage — algebraically the same as weighting the
    // two component grade points by their share of full marks. See the
    // Aug-2026 report-card design discussion for why this reduces cleanly.
    subjects = gradeSubjects.map((subject) => {
      const m = markBySubjectId.get(subject.id);
      const hasPracticalComponent = subject.fullPracticalMarks > 0;
      // An absent subject deliberately falls through to the normal path below.
      // Its marks are null, so `|| 0` scores it 0%, which the scale grades as
      // E / 0.8 — and that grade point then counts toward the credit-weighted
      // GPA like any other subject.
      //
      // Do NOT reintroduce a short-circuit returning gradePoint: null here.
      // calculateOverallGpaWeighted filters nulls, so a null drops the subject
      // (and its credit hours) out of the average entirely, leaving a student
      // who skipped the exam ranked ABOVE one who sat it and failed.
      //
      // The "Ab" / "NG" printed on the card is driven by the isAbsent flag in
      // pdf.service.ts, not by these values, so the display is unaffected.
      const theoryResult = getGradeFromPercentage(
        calculatePercentage(m?.theoryMarks || 0, subject.fullTheoryMarks)
      );
      const practicalResult = hasPracticalComponent
        ? getGradeFromPercentage(calculatePercentage(m?.practicalMarks || 0, subject.fullPracticalMarks))
        : null;

      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      const total = (m?.theoryMarks || 0) + (m?.practicalMarks || 0);
      const finalResult = getGradeFromPercentage(calculatePercentage(total, fullMarks));

      return {
        subjectName: subject.name,
        creditHour: subject.creditHour,
        theoryGrade: theoryResult.grade,
        practicalGrade: practicalResult?.grade ?? null,
        finalGrade: finalResult.grade,
        gradePoint: finalResult.gpa,
        isAbsent: m?.isAbsent ?? false,
        // Distinct from isAbsent: the student was not recorded absent, the mark
        // simply has not been entered. Scores 0 like an absence, but prints "—"
        // rather than "Ab", which would assert something untrue about the student.
        notEntered: !m,
      };
    });

    overallGpa = calculateOverallGpaWeighted(
      subjects.map((s) => ({ gpa: s.gradePoint, creditHour: s.creditHour }))
    );
    overallPct = 0; // not used by the credit-grade template
    overallGradeLabel = "";
  } else {
    const marksSubjects = gradeSubjects.map((subject) => {
      const m = markBySubjectId.get(subject.id);
      const fullMarks = subject.fullTheoryMarks + subject.fullPracticalMarks;
      // Absent falls through to the normal path — null marks become 0, which
      // grades as E / 0.8 and counts toward the averages below. See the note in
      // the credit-grade branch above for why a null gpa short-circuit here is
      // the bug this replaced. A subject with no mark row at all is treated the
      // same way for arithmetic, and distinguished only in how it prints.
      const theory = m?.theoryMarks || 0;
      const practical = m?.practicalMarks || 0;
      const total = theory + practical;
      const pct = calculatePercentage(total, fullMarks);
      const gradeResult = getGradeFromPercentage(pct);
      return {
        subjectName: subject.name,
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
    subjects = marksSubjects;

    // Averaged over every subject in the grade — absent included, not-yet-entered
    // included. Shrinking the denominator per student would mean missing an exam
    // raises the average instead of lowering it, and would put this figure on a
    // different basis from the rank below, which scores both as 0.
    overallGpa = calculateOverallGpa(marksSubjects.map((s) => s.gpa));
    overallPct = marksSubjects.length > 0
      ? parseFloat((marksSubjects.reduce((a, s) => a + s.percentage, 0) / marksSubjects.length).toFixed(1))
      : 0;
    overallGradeLabel = marksSubjects.length > 0 ? getGradeFromPercentage(overallPct).grade : "";
  }

  const attendance = await prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: examType.academicYearId } },
  });

  // Rank — one shared implementation, see services/rank.service.ts (R7).
  let rank: number | undefined;
  let totalStudents: number | undefined;
  if (examType.showRank) {
    const ranking =
      precomputedRanking ??
      (await computeSectionRanks(student.sectionId, examTypeId, examType.academicYearId));
    const entry = ranking.ranks.get(studentId);
    // A student with no marks at all sorts last on 0%. That is right for the class
    // mark sheet, but printing "last of 40" on the report card of someone who
    // transferred in mid-year and has nothing to be ranked on is not — they get no
    // rank, exactly as before.
    if (entry?.hasAnyMarks) {
      rank = entry.rank;
      totalStudents = ranking.totalStudents;
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
    gradingStyle,
    hasPractical: hasPracticalSubjects,
    subjects,
    overallPercentage: overallPct,
    overallGrade: overallGradeLabel,
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

async function buildFinalReportData(studentId: string, academicYearId: string, schoolId: string) {
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

  const school = await prisma.school.findUnique({ where: { id: schoolId } });

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
        isAbsent: mark?.isAbsent ?? false,
      };
    });

    // Absent in every term still scores the subject rather than dropping it:
    // the weighted percentage below reads null marks as 0, grading it E / 0.8.
    // Only the display flag distinguishes it. (Absent in *some* terms already
    // weighted those terms in as 0, so this makes partial and full absence
    // consistent.)
    const allTermsAbsent = terms.every((t: any) => t.isAbsent);

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
      isAbsent: allTermsAbsent,
    };
  });

  // Credit-hour / grade-point style reshapes the annual report the same way
  // buildTermReportData does for term reports — otherwise a grade set to
  // CREDIT_GRADE_BASED would get the SEE-style term report but fall through
  // to the marks-based template at year end.
  //
  // Grades are derived weighted-marks-first: each component's term marks are
  // combined using the existing gradingPolicy weightages, and the resulting
  // percentage is graded once. That matches how the marks-based annual report
  // already consolidates terms, so both styles rank and pass/fail identically.
  const gradingStyle = student.section.grade.gradingStyle;

  let reportSubjects: any[];
  let overallGpa: number | null;
  let overallPct: number;
  let overallGradeLabel: string;

  if (gradingStyle === "CREDIT_GRADE_BASED") {
    const weightedComponentPct = (subjectId: string, component: "theory" | "practical", componentFullMarks: number) =>
      calculateWeightedPercentage(
        policies.map((policy) => {
          const mark = allMarks.find((m) => m.subjectId === subjectId && m.examTypeId === policy.examTypeId);
          const obtained = component === "theory" ? mark?.theoryMarks || 0 : mark?.practicalMarks || 0;
          return { obtained, fullMarks: componentFullMarks, weightage: policy.weightagePercent };
        })
      );

    reportSubjects = subjects.map((subject, i) => {
      // finalSubjects is built from `subjects` in order, so index i lines up.
      const consolidatedSubject = finalSubjects[i];
      const hasPracticalComponent = subject.fullPracticalMarks > 0;
      const theoryPct = weightedComponentPct(subject.id, "theory", subject.fullTheoryMarks);
      const practicalPct = hasPracticalComponent
        ? weightedComponentPct(subject.id, "practical", subject.fullPracticalMarks)
        : null;

      const subjectMarks = allMarks.filter((m) => m.subjectId === subject.id);
      const allAbsent = subjectMarks.length > 0 && subjectMarks.every((m) => m.isAbsent);

      // Absent is graded, not skipped — the weighted percentages above read
      // null marks as 0, so the subject scores E / 0.8 and its credit hours
      // stay in the denominator of the weighted GPA. Only the flag differs.
      return {
        subjectName: subject.name,
        creditHour: subject.creditHour,
        theoryGrade: getGradeFromPercentage(theoryPct).grade,
        practicalGrade: practicalPct === null ? null : getGradeFromPercentage(practicalPct).grade,
        finalGrade: consolidatedSubject.grade,
        gradePoint: consolidatedSubject.gpa,
        isAbsent: allAbsent,
      };
    });

    overallGpa = calculateOverallGpaWeighted(
      reportSubjects.map((s) => ({ gpa: s.gradePoint, creditHour: s.creditHour }))
    );
    overallPct = 0; // not used by the credit-grade template
    overallGradeLabel = "";
  } else {
    reportSubjects = finalSubjects;
    // Every subject counts, absent included — same reasoning as the term report.
    overallGpa = calculateOverallGpa(finalSubjects.map((s: any) => s.gpa));
    overallPct = finalSubjects.length > 0
      ? parseFloat((finalSubjects.reduce((a: number, s: any) => a + s.weightedPercentage, 0) / finalSubjects.length).toFixed(1))
      : 0;
    overallGradeLabel = finalSubjects.length > 0 ? getGradeFromPercentage(overallPct).grade : "";
  }

  const attendance = await prisma.attendance.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });

  const consolidated = await prisma.consolidatedResult.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });

  const finalExamType = await prisma.examType.findFirst({
    where: { isFinal: true, academicYearId },
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
    examType: finalExamType?.name || "Final",
    paperSize: finalExamType?.paperSize || "A4",
    isTermReport: false,
    gradingStyle,
    hasPractical: subjects.some((s) => s.fullPracticalMarks > 0),
    subjects: reportSubjects,
    overallPercentage: overallPct,
    overallGrade: overallGradeLabel,
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
router.get("/term/:studentId/:examTypeId", authenticate, authorize("ADMIN", "TEACHER", "STUDENT"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, examTypeId } = req.params;
  await verifyStudent(studentId, schoolId);

  if (req.user!.role === "STUDENT") {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { studentId: true } });
    if (user?.studentId !== studentId) throw new AppError("You can only access your own report", 403);
  }

  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const reportData = await buildTermReportData(studentId, examTypeId, schoolId);
  if (!reportData) throw new AppError("No marks found for this student and exam", 404);

  const cols = await getColumnSettings(schoolId);
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
router.get("/final/:studentId/:academicYearId", authenticate, authorize("ADMIN", "TEACHER", "STUDENT"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, academicYearId } = req.params;
  await verifyStudent(studentId, schoolId);

  if (req.user!.role === "STUDENT") {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { studentId: true } });
    if (user?.studentId !== studentId) throw new AppError("You can only access your own report", 403);
  }

  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const reportData = await buildFinalReportData(studentId, academicYearId, schoolId);
  if (!reportData) throw new AppError("No report data found for this student", 404);

  const cols = await getColumnSettings(schoolId);
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
router.get("/class/term/:sectionId/:examTypeId", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
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

  // Compute the section's ranking once for the whole batch. This loop used to rebuild
  // the identical ranking inside every student's report — loading every mark in the
  // section, sorting the whole class, and keeping one number from it, 40 times over
  // (P3). The ranking is the same for every student in the batch by definition.
  const ranking = examType.showRank
    ? await computeSectionRanks(sectionId, examTypeId, examType.academicYearId)
    : undefined;

  const reportDataArray: any[] = [];
  for (const stu of students) {
    const data = await buildTermReportData(stu.id, examTypeId, schoolId, ranking);
    if (data) {
      data._observations = await getObservations(stu.id, examTypeId, section.gradeId);
      reportDataArray.push(data);
    }
  }

  if (reportDataArray.length === 0) throw new AppError("No marks found for any student", 404);

  const cols = await getColumnSettings(schoolId);
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
router.get("/class/final/:sectionId/:academicYearId", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
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

  const finalExamType = await prisma.examType.findFirst({ where: { isFinal: true, academicYearId } });
  const section = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });

  const reportDataArray: any[] = [];
  for (const stu of students) {
    const data = await buildFinalReportData(stu.id, academicYearId, schoolId);
    if (data) {
      data._observations = await getObservations(stu.id, finalExamType?.id || "", section.gradeId);
      reportDataArray.push(data);
    }
  }

  if (reportDataArray.length === 0) throw new AppError("No report data found", 404);

  const paperSize = (finalExamType?.paperSize as "A4" | "A5") || "A4";
  const cols = await getColumnSettings(schoolId);
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