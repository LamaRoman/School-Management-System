import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { verifyExamType, verifyGrade } from "../utils/schoolScope";

const router = Router();

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
  await verifyGrade(data.gradeId, schoolId);
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
      examDate: z.string().min(1),
      dayName: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    })),
  });

  const { examTypeId, gradeId, entries } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifyExamType(examTypeId, schoolId);
  await verifyGrade(gradeId, schoolId);

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
  await verifyGrade(sourceGradeId, schoolId);
  await verifyGrade(targetGradeId, schoolId);

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