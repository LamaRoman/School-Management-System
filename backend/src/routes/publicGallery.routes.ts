import { Router } from "express";
import prisma from "../utils/prisma";

const router = Router();

// GET /public/gallery/:schoolId — unauthenticated read for the public website
router.get("/:schoolId", async (req, res) => {
  const photos = await prisma.galleryPhoto.findMany({
    where: { schoolId: req.params.schoolId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true, url: true, caption: true, description: true, displayOrder: true },
  });
  res.json({ data: photos });
});

export default router;
