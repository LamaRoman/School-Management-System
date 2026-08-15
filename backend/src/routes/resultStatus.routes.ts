/**
 * Results publish workflow (W1)
 *
 * Two deliberate human acts, by two different people:
 *   - the section's class teacher says marks entry is done  (READY, W1a)
 *   - an admin releases it to families                      (PUBLISHED, W1d)
 *
 * Neither is inferred from whether every mark row happens to exist. That
 * heuristic breaks on optional subjects and on students who transferred in
 * mid-year and legitimately have no earlier mark — see the soft gate in
 * resultStatus.service.ts.
 */

import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifySection, verifyExamType, verifyAcademicYear, verifyGrade } from "../utils/schoolScope";
import { getCompleteness, isClassTeacherOf } from "../services/resultStatus.service";

const router = Router();

async function teacherIdOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { teacherId: true } });
  return user?.teacherId ?? null;
}

/**
 * A TEACHER may act on a section only if they are its class teacher. ADMIN is
 * allowed through as well: an admin can publish directly anyway, so blocking
 * them here would only create a dead end when a class teacher is away.
 */
async function assertMayMarkReady(userId: string, role: string, sectionId: string): Promise<string | null> {
  if (role === "ADMIN") return null;
  const teacherId = await teacherIdOf(userId);
  if (!teacherId) throw new AppError("Teacher record not found", 403);
  if (!(await isClassTeacherOf(teacherId, sectionId))) {
    throw new AppError("Only this section's class teacher can mark its results complete", 403);
  }
  return teacherId;
}

// GET /api/result-status/section/:sectionId/:examTypeId
// Status plus exactly what is still missing — the running indicator during
// entry as well as the warning at the moment of marking complete (W1b).
router.get(
  "/section/:sectionId/:examTypeId",
  authenticate,
  authorize("ADMIN", "TEACHER"),
  async (req, res) => {
    const schoolId = getSchoolId(req);
    const { sectionId, examTypeId } = req.params;
    await verifySection(sectionId, schoolId);
    await verifyExamType(examTypeId, schoolId);

    const [row, completeness] = await Promise.all([
      prisma.examResultStatus.findUnique({
        where: { examTypeId_sectionId: { examTypeId, sectionId } },
        include: {
          markedReadyBy: { select: { name: true } },
          publishedBy: { select: { email: true } },
        },
      }),
      getCompleteness(sectionId, examTypeId),
    ]);

    res.json({
      data: {
        status: row?.status ?? "DRAFT",
        markedReadyAt: row?.markedReadyAt ?? null,
        markedReadyBy: row?.markedReadyBy?.name ?? null,
        publishedAt: row?.publishedAt ?? null,
        publishedBy: row?.publishedBy?.email ?? null,
        completeness,
      },
    });
  }
);

// GET /api/result-status/overview?academicYearId=&examTypeId=
// Every section of one exam at a glance, so an admin doesn't have to open each
// one to find out who is holding things up (W1c).
router.get("/overview", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    academicYearId: z.string().min(1),
    examTypeId: z.string().min(1),
  });
  const { academicYearId, examTypeId } = schema.parse(req.query);
  await verifyAcademicYear(academicYearId, schoolId);
  const examType = await verifyExamType(examTypeId, schoolId);
  if (examType.academicYearId !== academicYearId) {
    throw new AppError("Exam type not found for this academic year", 404);
  }

  const [grades, statuses, markCounts] = await Promise.all([
    prisma.grade.findMany({
      where: { academicYearId },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        sections: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            _count: { select: { students: { where: { isActive: true } } } },
          },
        },
      },
    }),
    prisma.examResultStatus.findMany({
      where: { examTypeId, section: { grade: { academicYearId } } },
      include: { markedReadyBy: { select: { name: true } } },
    }),
    // One grouped count rather than a completeness pass per section: the
    // overview only needs "has entry started", and the detail endpoint above
    // is there for the section a admin actually opens.
    prisma.mark.groupBy({
      by: ["studentId"],
      where: { examTypeId, student: { section: { grade: { academicYearId } } } },
      _count: { _all: true },
    }),
  ]);

  const statusBySection = new Map(statuses.map((s) => [s.sectionId, s]));
  const studentsWithMarks = new Set(markCounts.map((m) => m.studentId));
  const sectionOfStudent = await prisma.student.findMany({
    where: { id: { in: [...studentsWithMarks] } },
    select: { id: true, sectionId: true },
  });
  const startedSections = new Set(sectionOfStudent.map((s) => s.sectionId));

  const data = grades.map((grade) => ({
    gradeId: grade.id,
    gradeName: grade.name,
    sections: grade.sections.map((section) => {
      const row = statusBySection.get(section.id);
      return {
        sectionId: section.id,
        sectionName: section.name,
        studentCount: section._count.students,
        status: row?.status ?? "DRAFT",
        markedReadyBy: row?.markedReadyBy?.name ?? null,
        markedReadyAt: row?.markedReadyAt ?? null,
        publishedAt: row?.publishedAt ?? null,
        entryStarted: startedSections.has(section.id),
      };
    }),
  }));

  res.json({ data });
});

// POST /api/result-status/ready — class teacher marks a section's exam complete (W1a)
router.post("/ready", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schema = z.object({
    sectionId: z.string().min(1),
    examTypeId: z.string().min(1),
  });
  const { sectionId, examTypeId } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifySection(sectionId, schoolId);
  await verifyExamType(examTypeId, schoolId);

  const teacherId = await assertMayMarkReady(req.user!.userId, req.user!.role, sectionId);

  const existing = await prisma.examResultStatus.findUnique({
    where: { examTypeId_sectionId: { examTypeId, sectionId } },
    select: { status: true },
  });
  if (existing?.status === "PUBLISHED") {
    throw new AppError("These results are already published. Ask an admin to unpublish first.", 400);
  }

  const row = await prisma.examResultStatus.upsert({
    where: { examTypeId_sectionId: { examTypeId, sectionId } },
    update: { status: "READY", markedReadyById: teacherId, markedReadyAt: new Date() },
    create: {
      examTypeId,
      sectionId,
      status: "READY",
      markedReadyById: teacherId,
      markedReadyAt: new Date(),
    },
  });

  // Reported back rather than blocked on: the teacher has already seen this
  // list and chosen to proceed, and the admin publishing later should see the
  // same figure.
  const completeness = await getCompleteness(sectionId, examTypeId);
  res.json({ data: { status: row.status, missingCount: completeness.missingCount } });
});

// POST /api/result-status/reopen — back to DRAFT while entry is still going
router.post("/reopen", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schema = z.object({
    sectionId: z.string().min(1),
    examTypeId: z.string().min(1),
  });
  const { sectionId, examTypeId } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifySection(sectionId, schoolId);
  await verifyExamType(examTypeId, schoolId);
  await assertMayMarkReady(req.user!.userId, req.user!.role, sectionId);

  const existing = await prisma.examResultStatus.findUnique({
    where: { examTypeId_sectionId: { examTypeId, sectionId } },
    select: { status: true },
  });
  if (existing?.status === "PUBLISHED") {
    throw new AppError("These results are published. Ask an admin to unpublish first.", 400);
  }

  await prisma.examResultStatus.upsert({
    where: { examTypeId_sectionId: { examTypeId, sectionId } },
    update: { status: "DRAFT", markedReadyById: null, markedReadyAt: null },
    create: { examTypeId, sectionId, status: "DRAFT" },
  });

  res.json({ data: { status: "DRAFT" } });
});

// POST /api/result-status/publish — admin releases results to families (W1d)
//
// Three scopes, all through one endpoint: named sections, a whole grade, or
// every section of the exam. A grade that is ready shouldn't have to wait on a
// slower one.
router.post("/publish", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z
    .object({
      examTypeId: z.string().min(1),
      sectionIds: z.array(z.string().min(1)).min(1).max(200).optional(),
      gradeId: z.string().min(1).optional(),
      all: z.boolean().optional(),
      notify: z.boolean().default(true),
      publishDateBS: z.string().max(20).optional(),
    })
    .refine((v) => !!v.sectionIds || !!v.gradeId || v.all === true, {
      message: "Specify sectionIds, gradeId, or all",
    });

  const body = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  const examType = await verifyExamType(body.examTypeId, schoolId);

  let sectionIds: string[];
  let gradeIdForNotice: string | null = null;

  if (body.sectionIds) {
    // Verify each one belongs to this school *and* to the exam's own year —
    // publishing is the act that makes data visible to families, so it is the
    // last place to be loose about which rows are being touched.
    const sections = await prisma.section.findMany({
      where: {
        id: { in: body.sectionIds },
        grade: { academicYearId: examType.academicYearId, academicYear: { schoolId } },
      },
      select: { id: true },
    });
    if (sections.length !== new Set(body.sectionIds).size) {
      throw new AppError("One or more sections do not belong to this exam's academic year", 404);
    }
    sectionIds = sections.map((s) => s.id);
  } else if (body.gradeId) {
    const grade = await verifyGrade(body.gradeId, schoolId);
    if (grade.academicYearId !== examType.academicYearId) {
      throw new AppError("Grade does not belong to this exam's academic year", 404);
    }
    gradeIdForNotice = grade.id;
    sectionIds = (
      await prisma.section.findMany({ where: { gradeId: grade.id }, select: { id: true } })
    ).map((s) => s.id);
  } else {
    sectionIds = (
      await prisma.section.findMany({
        where: { grade: { academicYearId: examType.academicYearId } },
        select: { id: true },
      })
    ).map((s) => s.id);
  }

  if (sectionIds.length === 0) throw new AppError("No sections to publish", 400);

  const now = new Date();
  await prisma.$transaction(
    sectionIds.map((sectionId) =>
      prisma.examResultStatus.upsert({
        where: { examTypeId_sectionId: { examTypeId: body.examTypeId, sectionId } },
        update: { status: "PUBLISHED", publishedById: req.user!.userId, publishedAt: now },
        create: {
          examTypeId: body.examTypeId,
          sectionId,
          status: "PUBLISHED",
          publishedById: req.user!.userId,
          publishedAt: now,
        },
      })
    )
  );

  // W1f — Notice already has isPublished, targetAudience and gradeId; this
  // wires it to the moment results actually go out instead of leaving the
  // admin to remember to write one.
  let noticeId: string | null = null;
  if (body.notify) {
    const notice = await prisma.notice.create({
      data: {
        title: `${examType.name} results published`,
        content:
          `${examType.name} results are now available. ` +
          `Log in to the portal to view your report card.`,
        type: "EXAM",
        priority: "IMPORTANT",
        targetAudience: "ALL",
        gradeId: gradeIdForNotice,
        publishDate: body.publishDateBS ?? "",
        createdById: req.user!.userId,
      },
    });
    noticeId = notice.id;
  }

  res.json({ data: { published: sectionIds.length, noticeId } });
});

// POST /api/result-status/unpublish — take it back
router.post("/unpublish", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    examTypeId: z.string().min(1),
    sectionIds: z.array(z.string().min(1)).min(1).max(200),
  });
  const { examTypeId, sectionIds } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  const examType = await verifyExamType(examTypeId, schoolId);

  const sections = await prisma.section.findMany({
    where: {
      id: { in: sectionIds },
      grade: { academicYearId: examType.academicYearId, academicYear: { schoolId } },
    },
    select: { id: true },
  });
  if (sections.length !== new Set(sectionIds).size) {
    throw new AppError("One or more sections do not belong to this exam's academic year", 404);
  }

  // Back to READY, not DRAFT: entry was finished, it is the release that is
  // being withdrawn.
  const result = await prisma.examResultStatus.updateMany({
    where: { examTypeId, sectionId: { in: sections.map((s) => s.id) }, status: "PUBLISHED" },
    data: { status: "READY", publishedById: null, publishedAt: null },
  });

  res.json({ data: { unpublished: result.count } });
});

export default router;
