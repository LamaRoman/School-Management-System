import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// GET /api/teachers
router.get("/", authenticate, async (_req, res) => {
  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assignments: true } },
    },
  });
  res.json({ data: teachers });
});

// GET /api/teachers/:id
router.get("/:id", authenticate, async (req, res) => {
  const teacher = await prisma.teacher.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      assignments: {
        include: {
          section: { include: { grade: { select: { name: true } } } },
          subject: { select: { name: true } },
        },
      },
    },
  });
  res.json({ data: teacher });
});

// POST /api/teachers
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    nameNp: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  });
  const data = schema.parse(req.body);
  const teacher = await prisma.teacher.create({ data });
  res.status(201).json({ data: teacher });
});

// PUT /api/teachers/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    nameNp: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().optional(),
  });
  const data = schema.parse(req.body);
  const teacher = await prisma.teacher.update({ where: { id: req.params.id }, data });
  res.json({ data: teacher });
});

// DELETE /api/teachers/:id (soft delete)
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.teacher.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ data: { message: "Teacher deactivated" } });
});

export default router;