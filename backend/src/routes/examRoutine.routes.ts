import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  verifyExamType,
  verifyGrade,
  verifySubjectInGrade,
  verifySubjectsInGrade,
  verifyExamTypeInYear,
} from "../utils/schoolScope";

const router = Router();

/**
 * A routine entry is reachable only through its grade's academic year, so this
 * is the tenancy check for the by-id handlers. They previously took the id
 * straight from the URL into `update`/`delete`, which let an admin of one
 * school edit or delete any other school's printed exam routine.
 */
async function findRoutineInSchool(id: string, schoolId: string) {
  const routine = await prisma.examRoutine.findFirst({
    where: { id, grade: { academicYear: { schoolId } } },
  });
  if (!routine) throw new AppError("Exam routine entry not found or access denied", 404);
  return routine;
}

// GET /api/exam-routine?examTypeId=xxx&gradeId=xxx
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { examTypeId, gradeId } = req.query;
  if (examTypeId) await verifyExamType(String(examTypeId), schoolId);
  if (gradeId) await verifyGrade(String(gradeId), schoolId);
  const where: any = {};
  if (examTypeId) where.examTypeId = String(examTypeId);
  if (gradeId) where.gradeId = String(gradeId);

  const routines = await prisma.examRoutine.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true, nameNp: true } },
      grade: { select: { id: true, name: true } },
      examType: { select: { id: true, name: true } },
    },
    orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
  });

  res.json({ data: routines });
});

// POST /api/exam-routine — create single entry
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    examTypeId: z.string().min(1),
    gradeId: z.string().min(1),
    subjectId: z.string().min(1),
    examDate: z.string().min(1),
    dayName: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  });

  const data = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifyExamType(data.examTypeId, schoolId);
  const grade = await verifyGrade(data.gradeId, schoolId);
  // `@@unique([examTypeId, gradeId, subjectId])` will happily persist a
  // mismatched trio, and it prints on the routine handed to students.
  await verifySubjectInGrade(data.subjectId, data.gradeId);
  await verifyExamTypeInYear(data.examTypeId, grade.academicYearId);

  const routine = await prisma.examRoutine.create({
    data: {
      examTypeId: data.examTypeId,
      gradeId: data.gradeId,
      subjectId: data.subjectId,
      examDate: data.examDate,
      dayName: data.dayName || null,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
    },
    include: {
      subject: { select: { id: true, name: true, nameNp: true } },
      grade: { select: { id: true, name: true } },
      examType: { select: { id: true, name: true } },
    },
  });

  res.status(201).json({ data: routine });
});

// POST /api/exam-routine/bulk — create multiple entries at once
router.post("/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    examTypeId: z.string().min(1),
    gradeId: z.string().min(1),
    entries: z.array(z.object({
      subjectId: z.string().min(1),
      examDate: z.string().min(1).max(20),
      dayName: z.string().max(20).optional(),
      startTime: z.string().max(20).optional(),
      endTime: z.string().max(20).optional(),
    })).min(1).max(100),
  });

  const { examTypeId, gradeId, entries } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifyExamType(examTypeId, schoolId);
  const grade = await verifyGrade(gradeId, schoolId);
  // Whole batch or nothing — the delete below wipes the grade's existing
  // routine, so a batch that fails halfway would leave it with no routine at
  // all.
  await verifySubjectsInGrade(entries.map((e) => e.subjectId), gradeId);
  await verifyExamTypeInYear(examTypeId, grade.academicYearId);

  // Delete existing entries for this exam type + grade first
  await prisma.examRoutine.deleteMany({
    where: { examTypeId, gradeId },
  });

  const created = await prisma.$transaction(
    entries.map((entry) =>
      prisma.examRoutine.create({
        data: {
          examTypeId,
          gradeId,
          subjectId: entry.subjectId,
          examDate: entry.examDate,
          dayName: entry.dayName || null,
          startTime: entry.startTime || null,
          endTime: entry.endTime || null,
        },
      })
    )
  );

  res.status(201).json({ data: { message: `${created.length} exam routine entries saved` } });
});

// PUT /api/exam-routine/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    examDate: z.string().optional(),
    dayName: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  });

  const data = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await findRoutineInSchool(req.params.id, schoolId);

  const routine = await prisma.examRoutine.update({
    where: { id: req.params.id },
    data,
    include: {
      subject: { select: { id: true, name: true, nameNp: true } },
      grade: { select: { id: true, name: true } },
      examType: { select: { id: true, name: true } },
    },
  });

  res.json({ data: routine });
});

// DELETE /api/exam-routine/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await findRoutineInSchool(req.params.id, schoolId);

  await prisma.examRoutine.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Exam routine entry deleted" } });
});

// POST /api/exam-routine/copy — copy routine from one grade to another
router.post("/copy", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    examTypeId: z.string().min(1),
    sourceGradeId: z.string().min(1),
    targetGradeId: z.string().min(1),
  });

  const { examTypeId, sourceGradeId, targetGradeId } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifyExamType(examTypeId, schoolId);
  const sourceGrade = await verifyGrade(sourceGradeId, schoolId);
  const targetGrade = await verifyGrade(targetGradeId, schoolId);
  // The subjects here are resolved by name within the target grade, so they
  // can't cross a grade boundary — but the exam type still can cross a year.
  await verifyExamTypeInYear(examTypeId, sourceGrade.academicYearId);
  await verifyExamTypeInYear(examTypeId, targetGrade.academicYearId);

  const sourceEntries = await prisma.examRoutine.findMany({
    where: { examTypeId, gradeId: sourceGradeId },
    include: { subject: true },
  });

  if (sourceEntries.length === 0) {
    throw new AppError("No routine entries found in source grade");
  }

  // Get target grade subjects to match by name
  const targetSubjects = await prisma.subject.findMany({
    where: { gradeId: targetGradeId },
  });

  const targetSubjectMap = new Map(targetSubjects.map((s) => [s.name.toLowerCase(), s.id]));

  // Delete existing entries for target
  await prisma.examRoutine.deleteMany({
    where: { examTypeId, gradeId: targetGradeId },
  });

  let copied = 0;
  for (const entry of sourceEntries) {
    const targetSubjectId = targetSubjectMap.get(entry.subject.name.toLowerCase());
    if (targetSubjectId) {
      await prisma.examRoutine.create({
        data: {
          examTypeId,
          gradeId: targetGradeId,
          subjectId: targetSubjectId,
          examDate: entry.examDate,
          dayName: entry.dayName,
          startTime: entry.startTime,
          endTime: entry.endTime,
        },
      });
      copied++;
    }
  }

  res.json({ data: { message: `Copied ${copied} entries to target grade` } });
});

export default router;