import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";

const router = Router();

const yearSchema = z.object({
  yearBS: z.string().min(4, "Year must be like 2081"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/academic-years
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const years = await prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { yearBS: "desc" },
    include: { _count: { select: { grades: true } } },
  });
  res.json({ data: years });
});

// GET /api/academic-years/active
router.get("/active", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const year = await prisma.academicYear.findFirst({
    where: { isActive: true, schoolId },
    include: { grades: { orderBy: { displayOrder: "asc" } } },
  });
  res.json({ data: year });
});

// GET /api/academic-years/:id
router.get("/:id", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const year = await prisma.academicYear.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
    include: {
      grades: { orderBy: { displayOrder: "asc" }, include: { sections: true } },
      examTypes: { orderBy: { displayOrder: "asc" } },
    },
  });
  res.json({ data: year });
});

// POST /api/academic-years
router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const data = yearSchema.parse(req.body);
  if (data.isActive) {
    // Only deactivate this school's years
    await prisma.academicYear.updateMany({
      where: { schoolId },
      data: { isActive: false },
    });
  }
  const year = await prisma.academicYear.create({
    data: {
      schoolId,
      yearBS: data.yearBS,
      startDate: data.startDate,
      endDate: data.endDate,
      isActive: data.isActive,
    },
  });
  res.status(201).json({ data: year });
});

// PUT /api/academic-years/:id
router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const data = yearSchema.partial().parse(req.body);

  // Verify ownership
  await prisma.academicYear.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
  });

  if (data.isActive) {
    await prisma.academicYear.updateMany({
      where: { schoolId },
      data: { isActive: false },
    });
  }
  const year = await prisma.academicYear.update({ where: { id: req.params.id }, data });
  res.json({ data: year });
});

// DELETE /api/academic-years/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  // Verify ownership before delete
  await prisma.academicYear.findFirstOrThrow({
    where: { id: req.params.id, schoolId },
  });
  await prisma.academicYear.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Academic year deleted" } });
});

export default router;
