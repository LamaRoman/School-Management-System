import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { Prisma } from "@prisma/client";
import { verifyGrade, verifyExamType, verifySection, verifyStudent, verifyAcademicYear } from "../utils/schoolScope";
import { assertSectionOwnership } from "../services/resultStatus.service";

const router = Router();

// ─── CATEGORIES ─────────────────────────────────────────

// GET /api/observations/categories?gradeId=xxx
router.get("/categories", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { gradeId } = req.query;
  if (!gradeId) throw new AppError("gradeId is required");
  await verifyGrade(String(gradeId), schoolId);

  const categories = await prisma.observationCategory.findMany({
    where: { gradeId: String(gradeId), isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  res.json({ data: categories });
});

// POST /api/observations/categories
router.post("/categories", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    name: z.string().min(1).max(200),
    nameNp: z.string().max(200).optional(),
    gradeId: z.string().min(1),
    displayOrder: z.number().int().default(0),
  });

  const data = schema.parse(req.body);
  await verifyGrade(data.gradeId, schoolId);
  const createData: Prisma.ObservationCategoryCreateInput = {
    name: data.name,
    nameNp: data.nameNp,
    displayOrder: data.displayOrder,
    grade: { connect: { id: data.gradeId } },
  };
  const category = await prisma.observationCategory.create({ data: createData });
  res.status(201).json({ data: category });
});

// POST /api/observations/categories/bulk
router.post("/categories/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    gradeId: z.string().min(1),
    categories: z.array(z.object({
      name: z.string().min(1).max(200),
      nameNp: z.string().max(200).optional(),
      displayOrder: z.number().int().default(0),
    })).min(1).max(50),
  });

  const { gradeId, categories } = schema.parse(req.body);
  await verifyGrade(gradeId, schoolId);

  const created = await prisma.$transaction(
    categories.map((cat, i) =>
      prisma.observationCategory.create({
        data: {
          name: cat.name,
          nameNp: cat.nameNp || null,
          gradeId,
          displayOrder: cat.displayOrder || i,
        },
      })
    )
  );

  res.status(201).json({ data: created });
});

// PUT /api/observations/categories/:id
router.put("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  // Verify the category belongs to this school before updating
  await prisma.observationCategory.findFirstOrThrow({
    where: { id: req.params.id, grade: { academicYear: { schoolId } } },
  });

  const schema = z.object({
    name: z.string().min(1).max(200).optional(),
    nameNp: z.string().max(200).optional(),
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  });

  const data = schema.parse(req.body);
  const category = await prisma.observationCategory.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ data: category });
});

// DELETE /api/observations/categories/:id
router.delete("/categories/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  // Verify the category belongs to this school before deactivating
  await prisma.observationCategory.findFirstOrThrow({
    where: { id: req.params.id, grade: { academicYear: { schoolId } } },
  });

  await prisma.observationCategory.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ data: { message: "Category deactivated" } });
});

// ─── RESULTS ────────────────────────────────────────────

// GET /api/observations/results?sectionId=xxx&examTypeId=xxx
router.get("/results", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { sectionId, examTypeId } = req.query;
  if (!sectionId || !examTypeId) throw new AppError("sectionId and examTypeId are required");
  await verifySection(String(sectionId), schoolId);
  await verifyExamType(String(examTypeId), schoolId);

  const section = await prisma.section.findUniqueOrThrow({
    where: { id: String(sectionId) },
    include: { grade: true },
  });

  const categories = await prisma.observationCategory.findMany({
    where: { gradeId: section.gradeId, isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  const students = await prisma.student.findMany({
    where: { sectionId: String(sectionId), isActive: true },
    orderBy: { rollNo: "asc" },
  });

  const results = await prisma.observationResult.findMany({
    where: {
      examTypeId: String(examTypeId),
      studentId: { in: students.map((s) => s.id) },
      categoryId: { in: categories.map((c) => c.id) },
    },
  });

  // Build a map: studentId -> categoryId -> grade
  const resultMap: Record<string, Record<string, string>> = {};
  for (const r of results) {
    if (!resultMap[r.studentId]) resultMap[r.studentId] = {};
    resultMap[r.studentId][r.categoryId] = r.grade;
  }

  res.json({
    data: {
      categories,
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        rollNo: s.rollNo,
        grades: resultMap[s.id] || {},
      })),
    },
  });
});

// POST /api/observations/results/bulk
router.post("/results/bulk", authenticate, authorize("ADMIN", "TEACHER"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    examTypeId: z.string().min(1),
    academicYearId: z.string().min(1),
    entries: z.array(z.object({
      studentId: z.string().min(1),
      categoryId: z.string().min(1),
      grade: z.string().min(1).max(10),
    })).min(1).max(1000),
  });

  const { examTypeId, academicYearId, entries } = schema.parse(req.body);
  const examType = await verifyExamType(examTypeId, schoolId);
  await verifyAcademicYear(academicYearId, schoolId);

  // Both ids are part of the row's unique key, so a mismatched pair writes a row
  // that looks valid but belongs to no coherent (year, exam) combination.
  if (examType.academicYearId !== academicYearId) {
    throw new AppError("Exam type does not belong to this academic year", 400);
  }

  // Verify every studentId and categoryId resolves inside this school. Neither
  // was checked before, so observation grades could be written onto another
  // school's students and would then surface on that school's report cards.
  const uniqueStudentIds = [...new Set(entries.map((e) => e.studentId))];
  const validStudentCount = await prisma.student.count({
    where: {
      id: { in: uniqueStudentIds },
      section: { grade: { academicYear: { schoolId } } },
    },
  });
  if (validStudentCount !== uniqueStudentIds.length) {
    throw new AppError("One or more students do not belong to this school", 400);
  }

  // W3b — grading observations belongs to the section's class teacher, not to
  // any teacher in the school. This endpoint takes students rather than a
  // section, so the sections are derived from the batch; in practice a teacher
  // grades one section at a time, and a batch spanning several must satisfy the
  // check for every one of them.
  if (req.user!.role === "TEACHER") {
    const sections = await prisma.student.findMany({
      where: { id: { in: uniqueStudentIds } },
      select: { sectionId: true },
      distinct: ["sectionId"],
    });
    for (const { sectionId } of sections) {
      await assertSectionOwnership(req.user!.userId, req.user!.role, sectionId, "grade this section");
    }
  }

  const uniqueCategoryIds = [...new Set(entries.map((e) => e.categoryId))];
  const validCategoryCount = await prisma.observationCategory.count({
    where: {
      id: { in: uniqueCategoryIds },
      grade: { academicYear: { schoolId } },
    },
  });
  if (validCategoryCount !== uniqueCategoryIds.length) {
    throw new AppError("One or more observation categories do not belong to this school", 400);
  }

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.observationResult.upsert({
        where: {
          studentId_categoryId_examTypeId_academicYearId: {
            studentId: entry.studentId,
            categoryId: entry.categoryId,
            examTypeId,
            academicYearId,
          },
        },
        update: { grade: entry.grade },
        create: {
          studentId: entry.studentId,
          categoryId: entry.categoryId,
          examTypeId,
          academicYearId,
          grade: entry.grade,
        },
      })
    )
  );

  res.json({ data: { message: `${entries.length} observations saved` } });
});

// GET /api/observations/student/:studentId/:examTypeId — for report card
router.get("/student/:studentId/:examTypeId", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { studentId, examTypeId } = req.params;
  await verifyStudent(studentId, schoolId);

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const categories = await prisma.observationCategory.findMany({
    where: { gradeId: student.section.gradeId, isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  if (categories.length === 0) {
    return res.json({ data: null }); // No observations for this grade
  }

  const results = await prisma.observationResult.findMany({
    where: {
      studentId,
      examTypeId,
      categoryId: { in: categories.map((c) => c.id) },
    },
  });

  const observations = categories.map((cat) => {
    const result = results.find((r) => r.categoryId === cat.id);
    return {
      categoryName: cat.name,
      categoryNameNp: cat.nameNp,
      grade: result?.grade || "—",
    };
  });

  res.json({ data: observations });
});

export default router;