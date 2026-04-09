import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { verifyGrade, verifySubject } from "../utils/schoolScope";
import { Prisma } from "@prisma/client";

const router = Router();

const subjectSchema = z.object({
  name: z.string().min(1),
  nameNp: z.string().optional(),
  fullTheoryMarks: z.number().int().min(0),
  fullPracticalMarks: z.number().int().min(0).default(0),
  passMarks: z.number().int().min(0),
  isOptional: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  gradeId: z.string().min(1),
});

// GET /api/subjects?gradeId=xxx
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { gradeId } = req.query;
  if (gradeId) await verifyGrade(String(gradeId), schoolId);
  const subjects = await prisma.subject.findMany({
    where: gradeId
      ? { gradeId: String(gradeId) }
      : { grade: { academicYear: { schoolId } } },
    orderBy: { displayOrder: "asc" },
    include: { grade: { select: { name: true } } },
  });
  res.json({ data: subjects });
});

// GET /api/subjects/:id
router.get("/:id", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifySubject(req.params.id, schoolId);
  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { grade: true },
  });
  res.json({ data: subject });
});

// POST /api/subjects
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const data = subjectSchema.parse(req.body);
  await verifyGrade(data.gradeId, schoolId);
  const createData: Prisma.SubjectCreateInput = {
    name: data.name,
    nameNp: data.nameNp,
    fullTheoryMarks: data.fullTheoryMarks,
    fullPracticalMarks: data.fullPracticalMarks,
    passMarks: data.passMarks,
    isOptional: data.isOptional,
    displayOrder: data.displayOrder,
    grade: { connect: { id: data.gradeId } },
  };
  const subject = await prisma.subject.create({ data: createData });
  res.status(201).json({ data: subject });
});

// POST /api/subjects/bulk — create multiple subjects at once for a grade
router.post("/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    gradeId: z.string().min(1),
    subjects: z.array(subjectSchema.omit({ gradeId: true })),
  });
  const { gradeId, subjects } = schema.parse(req.body);
  await verifyGrade(gradeId, schoolId);

  const created = await prisma.$transaction(
    subjects.map((sub, i) =>
      prisma.subject.create({
        data: {
          name: sub.name,
          nameNp: sub.nameNp,
          fullTheoryMarks: sub.fullTheoryMarks,
          fullPracticalMarks: sub.fullPracticalMarks,
          passMarks: sub.passMarks,
          isOptional: sub.isOptional,
          displayOrder: sub.displayOrder || i + 1,
          grade: { connect: { id: gradeId } },
        },
      })
    )
  );
  res.status(201).json({ data: created });
});

// PUT /api/subjects/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifySubject(req.params.id, schoolId);
  const data = subjectSchema.partial().parse(req.body);
  const subject = await prisma.subject.update({ where: { id: req.params.id }, data });
  res.json({ data: subject });
});

// DELETE /api/subjects/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await verifySubject(req.params.id, schoolId);
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Subject deleted" } });
});

export default router;
