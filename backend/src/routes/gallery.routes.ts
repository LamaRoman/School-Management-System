import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { uploadGalleryPhoto, deleteGalleryPhoto } from "../services/upload.service";
import { revalidateWebsite } from "../services/websiteRevalidate.service";

const router = Router();
const MAX_FILES_PER_UPLOAD = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const MAX_CAPTION = 500;
const MAX_DESCRIPTION = 2000;

const updateSchema = z.object({
  caption: z.string().max(MAX_CAPTION).optional(),
  description: z.string().max(MAX_DESCRIPTION).optional(),
  displayOrder: z.number().int().optional(),
});

// GET /gallery — admin management list, newest first
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const photos = await prisma.galleryPhoto.findMany({
    where: { schoolId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
  });
  res.json({ data: photos });
});

// POST /gallery — upload one or more photos (same caption applied to each)
router.post("/", authenticate, authorize("ADMIN"), upload.array("photos", MAX_FILES_PER_UPLOAD), async (req, res) => {
  const schoolId = getSchoolId(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw new AppError("No file uploaded", 400);
  }
  const caption = typeof req.body.caption === "string" ? req.body.caption.slice(0, MAX_CAPTION) : undefined;
  const description =
    typeof req.body.description === "string" ? req.body.description.slice(0, MAX_DESCRIPTION) : undefined;

  const uploaded = [];
  for (const file of files) {
    const photo = await prisma.galleryPhoto.create({
      data: {
        schoolId,
        url: "",
        storageType: "base64",
        caption,
        description,
        createdById: req.user!.userId,
      },
    });

    const result = await uploadGalleryPhoto(file.buffer, file.mimetype, schoolId, photo.id);

    const updated = await prisma.galleryPhoto.update({
      where: { id: photo.id },
      data: { url: result.url, storageType: result.storageType },
    });
    uploaded.push(updated);
  }

  revalidateWebsite("gallery");

  res.status(201).json({ data: uploaded });
});

// PATCH /gallery/:id — update caption/order
router.patch("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const data = updateSchema.parse(req.body);

  const existing = await prisma.galleryPhoto.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    throw new AppError("Photo not found", 404);
  }

  const photo = await prisma.galleryPhoto.update({ where: { id: existing.id }, data });

  revalidateWebsite("gallery");

  res.json({ data: photo });
});

// DELETE /gallery/:id — remove a photo
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const existing = await prisma.galleryPhoto.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    throw new AppError("Photo not found", 404);
  }

  await deleteGalleryPhoto(existing.url);
  await prisma.galleryPhoto.delete({ where: { id: existing.id } });

  revalidateWebsite("gallery");

  res.json({ data: { message: "Photo deleted" } });
});

export default router;
