import { Router } from "express";
import prisma from "../utils/prisma";
import { authenticate, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyStudent } from "../utils/schoolScope";
import { verifyStudentAccess } from "../utils/studentAccess";
import { buildTermReportData, buildFinalReportData, toPortalReport } from "../services/reportCard.service";
import {
  isSectionPublished,
  pendingTermsForAnnual,
  isGatedRole,
} from "../services/resultStatus.service";

const router = Router();

// GET /api/reports/term/:studentId/:examTypeId
router.get("/term/:studentId/:examTypeId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, examTypeId } = req.params;
  await Promise.all([
    verifyStudent(studentId, schoolId),
    verifyStudentAccess(req.user!.userId, req.user!.role, studentId),
  ]);

  const [student, examType] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { name: true, sectionId: true } }),
    prisma.examType.findFirstOrThrow({ where: { id: examTypeId, academicYear: { schoolId } } }),
  ]);

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

  // The same data the printed card is built from (reportCard.service), so the portal and
  // the parent app cannot show a different grade or GPA from the paper.
  const report = await buildTermReportData(studentId, examTypeId, schoolId);
  if (!report) throw new AppError("No marks found for this student and exam", 404);
  res.json({ data: toPortalReport(report) });
});

// GET /api/reports/final/:studentId/:academicYearId
router.get("/final/:studentId/:academicYearId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, academicYearId } = req.params;
  await Promise.all([
    verifyStudent(studentId, schoolId),
    verifyStudentAccess(req.user!.userId, req.user!.role, studentId),
  ]);

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

  const report = await buildFinalReportData(studentId, academicYearId, schoolId);
  if (!report) throw new AppError("No grading policy found for this grade", 404);
  res.json({ data: toPortalReport(report) });
});

export default router;
