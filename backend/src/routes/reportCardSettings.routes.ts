import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";

const router = Router();

// GET /api/report-card-settings
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    return res.json({ data: null });
  }

  let settings = await prisma.reportCardSettings.findUnique({
    where: { schoolId: school.id },
  });

  // Auto-create default settings if none exist
  if (!settings) {
    settings = await prisma.reportCardSettings.create({
      data: {
        schoolId: school.id,
        showPassMarks: true,
        showTheoryPrac: true,
        showPercentage: false,
        showGrade: true,
        showGpa: true,
        showRank: true,
        showAttendance: true,
        showRemarks: true,
        showPromotion: true,
        showNepaliName: false,
        logoPosition: "center",
        logoSize: "medium",
      },
    });
  }

  res.json({ data: settings });
});

// PUT /api/report-card-settings
router.put("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const schema = z.object({
    showPassMarks: z.boolean().optional(),
    showTheoryPrac: z.boolean().optional(),
    showPercentage: z.boolean().optional(),
    showGrade: z.boolean().optional(),
    showGpa: z.boolean().optional(),
    showRank: z.boolean().optional(),
    showAttendance: z.boolean().optional(),
    showRemarks: z.boolean().optional(),
    showPromotion: z.boolean().optional(),
    showNepaliName: z.boolean().optional(),
    logoPosition: z.enum(["left", "center", "right"]).optional(),
    logoSize: z.enum(["small", "medium", "large"]).optional(),
  });

  const data = schema.parse(req.body);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    return res.status(404).json({ error: "School not found" });
  }

  const settings = await prisma.reportCardSettings.upsert({
    where: { schoolId: school.id },
    update: data,
    create: {
      schoolId: school.id,
      ...data,
    },
  });

  res.json({ data: settings });
});

export default router;