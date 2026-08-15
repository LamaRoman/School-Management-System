import { Router } from "express";
import prisma from "../utils/prisma";
import { publicCache, publicSchoolFilter } from "../services/publicOrigins.service";

const router = Router();

// GET /public/gallery/:schoolId — unauthenticated read for the public website
router.get("/:schoolId", publicCache, async (req, res) => {
  // S6a — the school must still be active *and* have registered a website.
  // Nesting the filter under the relation keeps this one query rather than a
  // lookup followed by a fetch.
  const photos = await prisma.galleryPhoto.findMany({
    where: { schoolId: req.params.schoolId, school: publicSchoolFilter },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true, url: true, caption: true, description: true, displayOrder: true },
  });
  res.json({ data: photos });
});

export default router;
