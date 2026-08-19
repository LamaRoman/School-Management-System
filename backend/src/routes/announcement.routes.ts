import { Router } from "express";
import multer from "multer";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { uploadAnnouncementImage, deleteAnnouncementImage } from "../services/upload.service";
import { revalidateWebsite } from "../services/websiteRevalidate.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// GET /announcements — admin history list, newest first
router.get("/", authenticate, async (req, res) => {
  const schoolId = getSchoolId(req);
  const announcements = await prisma.announcement.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ data: announcements });
});

// POST /announcements — publish a new announcement image. Only one is ever
// active per school, so this deactivates whichever one currently is first.
router.post("/", authenticate, authorize("ADMIN"), upload.single("image"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const file = req.file;
  if (!file) {
    throw new AppError("No file uploaded", 400);
  }

  await prisma.announcement.updateMany({
    where: { schoolId, isActive: true },
    data: { isActive: false },
  });

  const announcement = await prisma.announcement.create({
    data: {
      schoolId,
      imageUrl: "",
      storageType: "base64",
      isActive: true,
      createdById: req.user!.userId,
    },
  });

  const result = await uploadAnnouncementImage(file.buffer, file.mimetype, schoolId, announcement.id);

  const updated = await prisma.announcement.update({
    where: { id: announcement.id },
    data: { imageUrl: result.url, storageType: result.storageType },
  });

  revalidateWebsite(schoolId, "announcement");

  res.status(201).json({ data: updated });
});

// PATCH /announcements/:id — toggle isActive. Setting one active
// deactivates any other currently-active announcement for the school.
router.patch("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const isActive = Boolean(req.body.isActive);

  const existing = await prisma.announcement.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    throw new AppError("Announcement not found", 404);
  }

  if (isActive) {
    await prisma.announcement.updateMany({
      where: { schoolId, isActive: true, id: { not: existing.id } },
      data: { isActive: false },
    });
  }

  const announcement = await prisma.announcement.update({
    where: { id: existing.id },
    data: { isActive },
  });

  revalidateWebsite(schoolId, "announcement");

  res.json({ data: announcement });
});

// DELETE /announcements/:id
router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const existing = await prisma.announcement.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    throw new AppError("Announcement not found", 404);
  }

  await deleteAnnouncementImage(existing.imageUrl);
  await prisma.announcement.delete({ where: { id: existing.id } });

  revalidateWebsite(schoolId, "announcement");

  res.json({ data: { message: "Announcement deleted" } });
});

export default router;
