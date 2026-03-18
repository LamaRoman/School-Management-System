import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

const schoolSchema = z.object({
  name: z.string().min(1),
  nameNp: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  logo: z.string().optional(),
  estdYear: z.string().optional(),
  motto: z.string().optional(),
});

// GET /api/school
router.get("/", async (_req, res) => {
  const school = await prisma.school.findFirst();
  res.json({ data: school });
});

// PUT /api/school
router.put("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const data = schoolSchema.parse(req.body);
  const existing = await prisma.school.findFirst();
  const school = existing
    ? await prisma.school.update({ where: { id: existing.id }, data })
    : await prisma.school.create({ data });
  res.json({ data: school });
});

export default router;
