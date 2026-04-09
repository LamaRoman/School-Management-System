import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";

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

// GET /api/school — returns the current user's school
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  res.json({ data: school });
});

// PUT /api/school — update the current user's school
router.put("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const data = schoolSchema.parse(req.body);
  const school = await prisma.school.update({ where: { id: schoolId }, data });
  res.json({ data: school });
});

export default router;
