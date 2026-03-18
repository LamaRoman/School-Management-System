import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

const yearSchema = z.object({
  yearBS: z.string().min(4, "Year must be like 2081"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/academic-years
router.get("/", async (_req, res) => {
  const years = await prisma.academicYear.findMany({
    orderBy: { yearBS: "desc" },
    include: { _count: { select: { grades: true } } },
  });
  res.json({ data: years });
});

// GET /api/academic-years/active
router.get("/active", async (_req, res) => {
  const year = await prisma.academicYear.findFirst({
    where: { isActive: true },
    include: { grades: { orderBy: { displayOrder: "asc" } } },
  });
  res.json({ data: year });
});

// GET /api/academic-years/:id
router.get("/:id", async (req, res) => {
  const year = await prisma.academicYear.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      grades: { orderBy: { displayOrder: "asc" }, include: { sections: true } },
      examTypes: { orderBy: { displayOrder: "asc" } },
    },
  });
  res.json({ data: year });
});

// POST /api/academic-years
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = yearSchema.parse(req.body);
  if (data.isActive) {
    await prisma.academicYear.updateMany({ data: { isActive: false } });
  }
  const year = await prisma.academicYear.create({ data });
  res.status(201).json({ data: year });
});

// PUT /api/academic-years/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = yearSchema.partial().parse(req.body);
  if (data.isActive) {
    await prisma.academicYear.updateMany({ data: { isActive: false } });
  }
  const year = await prisma.academicYear.update({ where: { id: req.params.id }, data });
  res.json({ data: year });
});

// DELETE /api/academic-years/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  await prisma.academicYear.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Academic year deleted" } });
});

export default router;
