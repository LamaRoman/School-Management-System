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

const MAX_NAME = 200;
const MAX_ADDRESS = 500;
const MAX_PHONE = 30;
const MAX_MOTTO = 500;
const MAX_YEAR = 10;

/**
 * Accept only logo values our own upload pipeline can produce:
 *   - empty string (logo cleared)
 *   - data:image/... base64 URI (dev fallback from upload.service)
 *   - https URL on our own S3 bucket
 * Rejects arbitrary URLs that would trigger SSRF when Puppeteer fetches them
 * for PDF rendering (see pdf.service.ts isSafeLogoUrl).
 */
function logoIsAllowed(value: string): boolean {
  if (!value) return true;
  if (value.startsWith("data:image/")) return true;
  const bucket = process.env.AWS_S3_BUCKET;
  if (
    bucket &&
    value.startsWith("https://") &&
    value.includes(`${bucket}.s3.`) &&
    value.includes(".amazonaws.com/")
  ) return true;
  return false;
}

const schoolSchema = z.object({
  name: z.string().min(1).max(MAX_NAME),
  nameNp: z.string().max(MAX_NAME).optional(),
  code: z.string().min(2).max(6).toUpperCase().optional(),
  address: z.string().max(MAX_ADDRESS).optional(),
  phone: z.string().max(MAX_PHONE).optional(),
  email: z.string().email().max(320).optional(),
  logo: z.string().max(2_000_000).refine(logoIsAllowed, {
    message: "Logo must be uploaded via POST /school/logo (S3 or data URI).",
  }).optional(),
  estdYear: z.string().max(MAX_YEAR).optional(),
  motto: z.string().max(MAX_MOTTO).optional(),
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