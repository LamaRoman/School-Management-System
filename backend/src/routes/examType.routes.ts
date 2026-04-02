import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

const examTypeSchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int().default(0),
  academicYearId: z.string().min(1),
  paperSize: z.enum(["A4", "A5"]).default("A5"),
  showRank: z.boolean().default(true),
});

// GET /api/exam-types?academicYearId=xxx
router.get("/", authenticate, async (req, res) => {
  const { academicYearId } = req.query;
  const examTypes = await prisma.examType.findMany({
    where: academicYearId ? { academicYearId: String(academicYearId) } : undefined,
    orderBy: { displayOrder: "asc" },
  });
  res.json({ data: examTypes });
});

// GET /api/exam-types/:id
router.get("/:id", authenticate, async (req, res) => {
  const examType = await prisma.examType.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { gradingPolicies: true },
  });
  res.json({ data: examType });
});

// POST /api/exam-types
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = examTypeSchema.parse(req.body);
  const createData: Prisma.ExamTypeCreateInput = {
    name: data.name,
    displayOrder: data.displayOrder,
    paperSize: data.paperSize,
    showRank: data.showRank,
    academicYear: { connect: { id: data.academicYearId } },
  };
  const examType = await prisma.examType.create({ data: createData });
  res.status(201).json({ data: examType });
});

// PUT /api/exam-types/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = examTypeSchema.partial().parse(req.body);
  const examType = await prisma.examType.update({ where: { id: req.params.id }, data });
  res.json({ data: examType });
});

// DELETE /api/exam-types/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.examType.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Exam type deleted" } });
});

export default router;