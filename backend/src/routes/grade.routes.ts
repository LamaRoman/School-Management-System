import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

const gradeSchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int().min(0),
  academicYearId: z.string().min(1),
});

// GET /api/grades?academicYearId=xxx
router.get("/", async (req, res) => {
  const { academicYearId } = req.query;
  const grades = await prisma.grade.findMany({
    where: academicYearId ? { academicYearId: String(academicYearId) } : undefined,
    orderBy: { displayOrder: "asc" },
    include: {
      sections: {
        orderBy: { name: "asc" },
        include: { _count: { select: { students: true } } },
      },
      _count: { select: { subjects: true, sections: true } },
    },
  });
  res.json({ data: grades });
});

// GET /api/grades/:id
router.get("/:id", async (req, res) => {
  const grade = await prisma.grade.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      sections: { orderBy: { name: "asc" }, include: { _count: { select: { students: true } } } },
      subjects: { orderBy: { displayOrder: "asc" } },
    },
  });
  res.json({ data: grade });
});

// POST /api/grades
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = gradeSchema.parse(req.body);
  const grade = await prisma.grade.create({ data });
  res.status(201).json({ data: grade });
});

// PUT /api/grades/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = gradeSchema.partial().parse(req.body);
  const grade = await prisma.grade.update({ where: { id: req.params.id }, data });
  res.json({ data: grade });
});

// DELETE /api/grades/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.grade.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Grade deleted" } });
});

export default router;