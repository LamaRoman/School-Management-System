import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyStudent, verifySection } from "../utils/schoolScope";
import { verifyStudentAccess, verifySectionTeacherAccess } from "../utils/studentAccess";
import {
  isSectionPublished,
  pendingTermsForAnnual,
  isGatedRole,
} from "../services/resultStatus.service";
import {
  generatePdf,
  buildReportCardHtml,
  buildBatchReportCardHtml,
  defaultColumnSettings,
} from "../services/pdf.service";
import type { ReportCardColumnSettings } from "../services/pdf.service";
import {
  PDF_LINK_TTL_SECONDS, parsePdfPath, signPdfLink, verifyPdfLink, mintShortAccessToken,
} from "../services/pdfLink.service";
import { loadTermReportBatch, buildTermReportData, buildFinalReportData } from "../services/reportCard.service";

const router = Router();

// Helper: fetch column settings from DB
async function getColumnSettings(schoolId: string): Promise<ReportCardColumnSettings> {
  const settings = await prisma.reportCardSettings.findUnique({
    where: { schoolId },
  });
  if (!settings) return defaultColumnSettings;
  return {
    showTheoryPrac: settings.showTheoryPrac,
    showGrade: settings.showGrade,
    showGpa: settings.showGpa,
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

/**
 * The same thing for a whole class in two queries instead of two per student.
 *
 * The categories are a property of the grade, so they are identical for every student
 * in the batch; only the results differ. Returns a Map so the caller can index by
 * studentId, and `null` for the whole batch when the grade has no categories — the
 * same signal the single-student version gives.
 */
async function getObservationsBatch(
  studentIds: string[],
  examTypeId: string,
  gradeId: string
): Promise<Map<string, any[] | null>> {
  const categories = await prisma.observationCategory.findMany({
    where: { gradeId, isActive: true },
    orderBy: { displayOrder: "asc" },
  });
  if (categories.length === 0) {
    return new Map(studentIds.map((id) => [id, null]));
  }

  const results = await prisma.observationResult.findMany({
    where: {
      studentId: { in: studentIds },
      examTypeId,
      categoryId: { in: categories.map((c) => c.id) },
    },
  });

  const byStudent = new Map<string, Map<string, string>>();
  for (const r of results) {
    let forStudent = byStudent.get(r.studentId);
    if (!forStudent) {
      forStudent = new Map();
      byStudent.set(r.studentId, forStudent);
    }
    forStudent.set(r.categoryId, r.grade);
  }

  return new Map(
    studentIds.map((id) => [
      id,
      categories.map((cat) => ({
        categoryName: cat.name,
        grade: byStudent.get(id)?.get(cat.id) || "—",
      })),
    ])
  );
}

// ─── ROUTES ─────────────────────────────────────────────

// ─── Download links (for opening a PDF in the phone's browser) ───────────────
// POST /api/pdf/link { path: "/pdf/term/<student>/<exam>?mode=color" } -> { url, expiresInSeconds }
// The caller must already be allowed to read that PDF; we check the same school/ownership
// rules up front so a refusal reaches the app as a normal error instead of a browser page.
router.post("/link", authenticate, authorize("ADMIN", "TEACHER", "STUDENT", "PARENT"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { route, mode } = parsePdfPath(req.body?.path);
  const [, kind, id1] = route.match(/^\/(term|final|class\/term|class\/final)\/([^/]+)\//)!;
  if (kind.startsWith("class")) {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "TEACHER") {
      throw new AppError("You do not have permission to perform this action", 403);
    }
    await verifySection(id1, schoolId);
    if (req.user!.role === "TEACHER") await verifySectionTeacherAccess(req.user!.userId, id1);
  } else {
    await verifyStudent(id1, schoolId);
    await verifyStudentAccess(req.user!.userId, req.user!.role, id1);
  }
  res.json({
    data: { url: `/pdf/dl/${signPdfLink(req.user!.userId, route, mode)}`, expiresInSeconds: PDF_LINK_TTL_SECONDS },
  });
});

// GET /api/pdf/dl/:token — no Authorization header (a browser opens it). Re-enters this
// router as the linked user, so the real route below does all its own checks.
router.get("/dl/:token", async (req, res, next) => {
  const { userId, route, mode } = verifyPdfLink(req.params.token);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, schoolId: true, isActive: true },
  });
  if (!user || !user.isActive) throw new AppError("This download link is no longer valid.", 401);

  delete (req as any).cookies?.zs_access_token; // the link's user, not whoever else is signed in in this browser
  req.headers.authorization = `Bearer ${mintShortAccessToken(user)}`;
  (req as any).query = { mode };
  res.setHeader("Cache-Control", "no-store");
  req.url = route;
  next();
});

/**
 * `?format=html` on the two single-student routes: the exact HTML the PDF is printed from, for
 * the on-screen report card, so the screen cannot disagree with the paper. Same route, so the same school scope, student access and publish gate apply; no
 * Puppeteer, so it is cheap. The browser shows it in a sandboxed iframe (no scripts).
 */
function sendPreview(res: import("express").Response, html: string, paperSize: string) {
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: { html, paperSize } });
}

// GET /api/pdf/term/:studentId/:examTypeId?mode=color|bw[&format=html]
router.get("/term/:studentId/:examTypeId", authenticate, authorize("ADMIN", "TEACHER", "STUDENT", "PARENT"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, examTypeId } = req.params;
  await verifyStudent(studentId, schoolId);
  await verifyStudentAccess(req.user!.userId, req.user!.role, studentId);

  // The portal's pending state (W1e) would be worth nothing if the PDF for the
  // same exam were one URL away. Gated for the same roles and on the same
  // condition as report.routes.ts.
  if (isGatedRole(req.user!.role)) {
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { sectionId: true },
    });
    if (!(await isSectionPublished(student.sectionId, examTypeId))) {
      throw new AppError("These results have not been published yet", 403);
    }
  }

  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const reportData = await buildTermReportData(studentId, examTypeId, schoolId);
  if (!reportData) throw new AppError("No marks found for this student and exam", 404);

  const cols = await getColumnSettings(schoolId);
  const obs = await getObservations(reportData._studentId, examTypeId, reportData._gradeId);
  const html = buildReportCardHtml(reportData, mode, cols, obs);
  if (req.query.format === "html") return sendPreview(res, html, reportData.paperSize);
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

// GET /api/pdf/final/:studentId/:academicYearId?mode=color|bw[&format=html]
router.get("/final/:studentId/:academicYearId", authenticate, authorize("ADMIN", "TEACHER", "STUDENT", "PARENT"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, academicYearId } = req.params;
  await verifyStudent(studentId, schoolId);
  await verifyStudentAccess(req.user!.userId, req.user!.role, studentId);

  if (isGatedRole(req.user!.role)) {
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { sectionId: true, section: { select: { gradeId: true } } },
    });
    const pendingTerms = await pendingTermsForAnnual(student.sectionId, student.section.gradeId);
    if (pendingTerms.length > 0) {
      throw new AppError(
        `The final result is published once every term is out. Still pending: ${pendingTerms.join(", ")}.`,
        403
      );
    }
  }

  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const reportData = await buildFinalReportData(studentId, academicYearId, schoolId);
  if (!reportData) throw new AppError("No report data found for this student", 404);

  const cols = await getColumnSettings(schoolId);
  const obs = await getObservations(reportData._studentId, reportData._examTypeId, reportData._gradeId);
  const html = buildReportCardHtml(reportData, mode, cols, obs);
  if (req.query.format === "html") return sendPreview(res, html, reportData.paperSize);
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
  if (req.user!.role === "TEACHER") await verifySectionTeacherAccess(req.user!.userId, sectionId);
  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const students = await prisma.student.findMany({
    where: { sectionId, isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true },
  });

  if (students.length === 0) throw new AppError("No students found in this section", 404);

  const section = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });

  // Everything the whole class shares — exam type, academic year, school, the grade's
  // subjects — plus every student's marks, electives and attendance,
  // fetched once for the section rather than once per student (P3). What used to be
  // ~10 sequential queries per student, against a pool capped at 5, is now a fixed
  // handful regardless of class size.
  const [batch, observationsByStudent, cols] = await Promise.all([
    loadTermReportBatch(sectionId, examTypeId, schoolId),
    getObservationsBatch(students.map((s) => s.id), examTypeId, section.gradeId),
    getColumnSettings(schoolId),
  ]);
  const examType = batch.examType;

  const reportDataArray: any[] = [];
  for (const stu of students) {
    const data = await buildTermReportData(stu.id, examTypeId, schoolId, batch);
    if (data) {
      data._observations = observationsByStudent.get(stu.id) ?? null;
      reportDataArray.push(data);
    }
  }

  if (reportDataArray.length === 0) throw new AppError("No marks found for any student", 404);
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
  if (req.user!.role === "TEACHER") await verifySectionTeacherAccess(req.user!.userId, sectionId);
  const mode = (req.query.mode as string) === "bw" ? "bw" : "color";

  const students = await prisma.student.findMany({
    where: { sectionId, isActive: true },
    orderBy: { rollNo: "asc" },
    select: { id: true },
  });

  if (students.length === 0) throw new AppError("No students found in this section", 404);

  const finalExamType = await prisma.examType.findFirst({ where: { isFinal: true, academicYearId } });
  const section = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });

  // Observations and column settings are the same for every student here too.
  // The annual builder itself still fetches per student — see the note under P3.
  const [observationsByStudent, cols] = await Promise.all([
    getObservationsBatch(students.map((s) => s.id), finalExamType?.id || "", section.gradeId),
    getColumnSettings(schoolId),
  ]);

  const reportDataArray: any[] = [];
  for (const stu of students) {
    const data = await buildFinalReportData(stu.id, academicYearId, schoolId);
    if (data) {
      data._observations = observationsByStudent.get(stu.id) ?? null;
      reportDataArray.push(data);
    }
  }

  if (reportDataArray.length === 0) throw new AppError("No report data found", 404);

  const paperSize = (finalExamType?.paperSize as "A4" | "A5") || "A4";
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