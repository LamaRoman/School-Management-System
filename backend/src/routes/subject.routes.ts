import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";

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
router.get("/", async (req, res) => {
  const { gradeId } = req.query;
  const subjects = await prisma.subject.findMany({
    where: gradeId ? { gradeId: String(gradeId) } : undefined,
    orderBy: { displayOrder: "asc" },
    include: { grade: { select: { name: true } } },
  });
  res.json({ data: subjects });
});

// GET /api/subjects/:id
router.get("/:id", async (req, res) => {
  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { grade: true },
  });
  res.json({ data: subject });
});

// POST /api/subjects
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = subjectSchema.parse(req.body);
  const subject = await prisma.subject.create({ data });
  res.status(201).json({ data: subject });
});

// POST /api/subjects/bulk — create multiple subjects at once for a grade
router.post("/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    gradeId: z.string().min(1),
    subjects: z.array(subjectSchema.omit({ gradeId: true })),
  });
  const { gradeId, subjects } = schema.parse(req.body);

  const created = await prisma.$transaction(
    subjects.map((sub, i) =>
      prisma.subject.create({
        data: { ...sub, gradeId, displayOrder: sub.displayOrder || i + 1 },
      })
    )
  );
  res.status(201).json({ data: created });
});

// PUT /api/subjects/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = subjectSchema.partial().parse(req.body);
  const subject = await prisma.subject.update({ where: { id: req.params.id }, data });
  res.json({ data: subject });
});

// DELETE /api/subjects/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Subject deleted" } });
});

export default router;
