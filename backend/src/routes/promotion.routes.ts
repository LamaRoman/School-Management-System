import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// ─── SECTION TRANSFER ───────────────────────────────────

// POST /api/promotion/transfer — move student to a different section
router.post("/transfer", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    studentId: z.string().min(1),
    newSectionId: z.string().min(1),
  });

  const { studentId, newSectionId } = schema.parse(req.body);

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { section: { include: { grade: true } } },
  });

  const newSection = await prisma.section.findUniqueOrThrow({
    where: { id: newSectionId },
    include: { grade: true },
  });

  // Update student's section
  const updated = await prisma.student.update({
    where: { id: studentId },
    data: { sectionId: newSectionId },
    include: { section: { include: { grade: true } } },
  });

  res.json({
    data: {
      student: updated,
      message: `${student.name} transferred from ${student.section.grade.name} Section ${student.section.name} to ${newSection.grade.name} Section ${newSection.name}`,
    },
  });
});

// ─── COPY ACADEMIC YEAR STRUCTURE ───────────────────────

// POST /api/promotion/copy-structure — copy grades, sections, subjects, exam types, grading policy from one year to another
router.post("/copy-structure", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    sourceYearId: z.string().min(1),
    targetYearId: z.string().min(1),
  });

  const { sourceYearId, targetYearId } = schema.parse(req.body);

  // Check target year exists and has no grades yet
  const targetYear = await prisma.academicYear.findUniqueOrThrow({ where: { id: targetYearId } });
  const existingGrades = await prisma.grade.findMany({ where: { academicYearId: targetYearId } });
  if (existingGrades.length > 0) {
    throw new AppError("Target year already has grades. Cannot copy structure to a year that already has data.");
  }

  // Get source structure
  const sourceGrades = await prisma.grade.findMany({
    where: { academicYearId: sourceYearId },
    orderBy: { displayOrder: "asc" },
    include: {
      sections: { orderBy: { name: "asc" } },
      subjects: { orderBy: { displayOrder: "asc" } },
    },
  });

  const sourceExamTypes = await prisma.examType.findMany({
    where: { academicYearId: sourceYearId },
    orderBy: { displayOrder: "asc" },
  });

  const sourcePolicies = await prisma.gradingPolicy.findMany({
    where: { examType: { academicYearId: sourceYearId } },
    include: { examType: true, grade: true },
  });

  // Copy grades, sections, subjects
  const gradeIdMap: Record<string, string> = {}; // old -> new
  const examTypeIdMap: Record<string, string> = {}; // old -> new

  for (const grade of sourceGrades) {
    const newGrade = await prisma.grade.create({
      data: {
        name: grade.name,
        displayOrder: grade.displayOrder,
        academicYearId: targetYearId,
      },
    });
    gradeIdMap[grade.id] = newGrade.id;

    // Copy sections — if source has sections, copy them; otherwise auto-create "A"
    if (grade.sections.length > 0) {
      for (const section of grade.sections) {
        await prisma.section.create({
          data: {
            name: section.name,
            gradeId: newGrade.id,
          },
        });
      }
    } else {
      await prisma.section.create({
        data: { name: "A", gradeId: newGrade.id },
      });
    }

    // Copy subjects
    for (const subject of grade.subjects) {
      await prisma.subject.create({
        data: {
          name: subject.name,
          nameNp: subject.nameNp,
          fullTheoryMarks: subject.fullTheoryMarks,
          fullPracticalMarks: subject.fullPracticalMarks,
          passMarks: subject.passMarks,
          isOptional: subject.isOptional,
          displayOrder: subject.displayOrder,
          gradeId: newGrade.id,
        },
      });
    }
  }

  // Copy exam types
  for (const et of sourceExamTypes) {
    const newEt = await prisma.examType.create({
      data: {
        name: et.name,
        displayOrder: et.displayOrder,
        academicYearId: targetYearId,
        paperSize: et.paperSize,
        showRank: et.showRank,
      },
    });
    examTypeIdMap[et.id] = newEt.id;
  }

  // Copy grading policies
  for (const policy of sourcePolicies) {
    const newGradeId = gradeIdMap[policy.gradeId];
    const newExamTypeId = examTypeIdMap[policy.examTypeId];
    if (newGradeId && newExamTypeId) {
      await prisma.gradingPolicy.create({
        data: {
          gradeId: newGradeId,
          examTypeId: newExamTypeId,
          weightagePercent: policy.weightagePercent,
        },
      });
    }
  }

  // Copy observation categories
  for (const [oldGradeId, newGradeId] of Object.entries(gradeIdMap)) {
    const categories = await prisma.observationCategory.findMany({
      where: { gradeId: oldGradeId, isActive: true },
    });
    for (const cat of categories) {
      await prisma.observationCategory.create({
        data: {
          name: cat.name,
          nameNp: cat.nameNp,
          gradeId: newGradeId,
          displayOrder: cat.displayOrder,
          isActive: true,
        },
      });
    }
  }

  res.json({
    data: {
      message: `Copied ${sourceGrades.length} grades, ${sourceExamTypes.length} exam types, and grading policies to ${targetYear.yearBS} B.S.`,
      gradesCreated: sourceGrades.length,
      examTypesCreated: sourceExamTypes.length,
    },
  });
});

// ─── PROMOTION ──────────────────────────────────────────

// GET /api/promotion/students?sourceYearId=xxx&gradeId=xxx — get students with pass/fail status for promotion
router.get("/students", authenticate, authorize("ADMIN"), async (req, res) => {
  const { sourceYearId, gradeId } = req.query;
  if (!sourceYearId || !gradeId) throw new AppError("sourceYearId and gradeId are required");

  const grade = await prisma.grade.findUniqueOrThrow({
    where: { id: String(gradeId) },
    include: { sections: { orderBy: { name: "asc" } } },
  });

  const students = await prisma.student.findMany({
    where: {
      section: { gradeId: String(gradeId) },
      status: "ACTIVE",
    },
    include: { section: true },
    orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
  });

  // Get consolidated results to check pass/fail
  const results = await prisma.consolidatedResult.findMany({
    where: {
      academicYearId: String(sourceYearId),
      studentId: { in: students.map((s) => s.id) },
    },
  });

  const resultMap = new Map(results.map((r) => [r.studentId, r]));

  const studentData = students.map((s) => ({
    id: s.id,
    name: s.name,
    nameNp: s.nameNp,
    rollNo: s.rollNo,
    sectionName: s.section.name,
    sectionId: s.sectionId,
    promoted: resultMap.get(s.id)?.promoted || false,
    totalPercentage: resultMap.get(s.id)?.totalPercentage || null,
    remarks: resultMap.get(s.id)?.remarks || null,
    status: s.status,
  }));

  res.json({
    data: {
      grade: { id: grade.id, name: grade.name },
      students: studentData,
    },
  });
});

// POST /api/promotion/promote — bulk promote students to next grade in new year
router.post("/promote", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    sourceYearId: z.string().min(1),
    targetYearId: z.string().min(1),
    sourceGradeId: z.string().min(1),
    promotions: z.array(z.object({
      studentId: z.string().min(1),
      action: z.enum(["PROMOTE", "RETAIN", "GRADUATE"]),
      targetSectionId: z.string().optional(), // for promoted students
    })),
  });

  const { sourceYearId, targetYearId, sourceGradeId, promotions } = schema.parse(req.body);

  const sourceGrade = await prisma.grade.findUniqueOrThrow({
    where: { id: sourceGradeId },
  });

  // Find the next grade in the target year
  const targetGrades = await prisma.grade.findMany({
    where: { academicYearId: targetYearId },
    orderBy: { displayOrder: "asc" },
    include: { sections: { orderBy: { name: "asc" } } },
  });

  const nextGrade = targetGrades.find((g) => g.displayOrder === sourceGrade.displayOrder + 1);
  const sameGrade = targetGrades.find((g) => g.displayOrder === sourceGrade.displayOrder);

  let promoted = 0;
  let retained = 0;
  let graduated = 0;

  for (const p of promotions) {
    if (p.action === "GRADUATE") {
      // Mark as graduated
      await prisma.student.update({
        where: { id: p.studentId },
        data: { status: "GRADUATED", isActive: false },
      });
      graduated++;
    } else if (p.action === "RETAIN") {
      // Move to same grade in new year
      if (!sameGrade) throw new AppError(`Grade ${sourceGrade.name} not found in target year`);
      const targetSection = p.targetSectionId
        ? sameGrade.sections.find((s) => s.id === p.targetSectionId)
        : sameGrade.sections[0];
      if (!targetSection) throw new AppError("No section found in target year for retention");

      await prisma.student.update({
        where: { id: p.studentId },
        data: { sectionId: targetSection.id, status: "ACTIVE", rollNo: null },
      });
      retained++;
    } else if (p.action === "PROMOTE") {
      if (!nextGrade) throw new AppError(`No next grade found after ${sourceGrade.name} in target year`);
      const targetSection = p.targetSectionId
        ? nextGrade.sections.find((s) => s.id === p.targetSectionId)
        : nextGrade.sections[0];
      if (!targetSection) throw new AppError("No section found in target year for promotion");

      await prisma.student.update({
        where: { id: p.studentId },
        data: { sectionId: targetSection.id, status: "ACTIVE", rollNo: null },
      });
      promoted++;
    }
  }

  res.json({
    data: {
      message: `Promotion complete: ${promoted} promoted, ${retained} retained, ${graduated} graduated`,
      promoted,
      retained,
      graduated,
    },
  });
});

export default router;