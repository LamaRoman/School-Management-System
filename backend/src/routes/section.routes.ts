import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const sectionSchema = z.object({
  name: z.string().min(1),
  gradeId: z.string().min(1),
});

// GET /api/sections?gradeId=xxx
router.get("/", async (req, res) => {
  const { gradeId } = req.query;
  const sections = await prisma.section.findMany({
    where: gradeId ? { gradeId: String(gradeId) } : undefined,
    orderBy: { name: "asc" },
    include: {
      grade: { select: { name: true } },
      _count: { select: { students: true } },
    },
  });
  res.json({ data: sections });
});

// GET /api/sections/:id
router.get("/:id", async (req, res) => {
  const section = await prisma.section.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      grade: true,
      students: { where: { isActive: true }, orderBy: { rollNo: "asc" } },
    },
  });
  res.json({ data: section });
});

// POST /api/sections
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = sectionSchema.parse(req.body);
  const section = await prisma.section.create({ data });
  res.status(201).json({ data: section });
});

// PUT /api/sections/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = sectionSchema.partial().parse(req.body);
  const section = await prisma.section.update({ where: { id: req.params.id }, data });
  res.json({ data: section });
});

// DELETE /api/sections/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const section = await prisma.section.findUniqueOrThrow({ where: { id: req.params.id } });

  // Prevent deleting the last section of a grade
  const sectionCount = await prisma.section.count({ where: { gradeId: section.gradeId } });
  if (sectionCount <= 1) {
    throw new AppError("Cannot delete the last section. Every grade must have at least one section.");
  }

  await prisma.section.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Section deleted" } });
});

export default router;