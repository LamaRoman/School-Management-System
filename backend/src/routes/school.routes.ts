import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { uploadLogo, deleteLogo } from "../services/upload.service";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

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

// POST /api/school/logo — upload school logo
router.post("/logo", authenticate, authorize("ADMIN"), upload.single("logo"), async (req, res) => {
  const schoolId = getSchoolId(req);
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Delete old logo from S3 if it exists
  const existing = await prisma.school.findUnique({ where: { id: schoolId }, select: { logo: true } });
  if (existing?.logo) {
    await deleteLogo(existing.logo);
  }

  const result = await uploadLogo(req.file.buffer, req.file.mimetype, schoolId);

  const school = await prisma.school.update({
    where: { id: schoolId },
    data: { logo: result.url },
  });

  res.json({ data: { logo: school.logo, storageType: result.storageType } });
});

// DELETE /api/school/logo — remove school logo
router.delete("/logo", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const existing = await prisma.school.findUnique({ where: { id: schoolId }, select: { logo: true } });
  if (existing?.logo) {
    await deleteLogo(existing.logo);
  }
  await prisma.school.update({ where: { id: schoolId }, data: { logo: null } });
  res.json({ data: { message: "Logo removed" } });
});

export default router;