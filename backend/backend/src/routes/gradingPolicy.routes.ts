import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { verifyGrade } from "../utils/schoolScope";

const router = Router();

// GET /api/grading-policy?gradeId=xxx
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const { gradeId } = req.query;
  if (gradeId) await verifyGrade(String(gradeId), schoolId);
  const policies = await prisma.gradingPolicy.findMany({
    where: gradeId ? { gradeId: String(gradeId) } : undefined,
    include: {
      examType: { select: { name: true, displayOrder: true } },
      grade: { select: { name: true } },
    },
    orderBy: { examType: { displayOrder: "asc" } },
  });
  res.json({ data: policies });
});

// POST /api/grading-policy/bulk — set weightages for a grade (replaces existing)
router.post("/bulk", authenticate, authorize("ADMIN"), async (req, res) => {
  const schema = z.object({
    gradeId: z.string().min(1),
    policies: z.array(
      z.object({
        examTypeId: z.string().min(1),
        weightagePercent: z.number().min(0).max(100),
      })
    ),
  });

  const { gradeId, policies } = schema.parse(req.body);
  const schoolId = getSchoolId(req);
  await verifyGrade(gradeId, schoolId);

  // Validate total = 100
  const total = policies.reduce((sum, p) => sum + p.weightagePercent, 0);
  if (Math.abs(total - 100) > 0.01) {
    return res.status(400).json({ error: `Weightages must total 100%. Current total: ${total}%` });
  }

  // Upsert each policy
  const results = await prisma.$transaction(
    policies.map((p) =>
      prisma.gradingPolicy.upsert({
        where: { examTypeId_gradeId: { examTypeId: p.examTypeId, gradeId } },
        update: { weightagePercent: p.weightagePercent },
        create: { examTypeId: p.examTypeId, gradeId, weightagePercent: p.weightagePercent },
      })
    )
  );

  res.json({ data: results });
});

export default router;
