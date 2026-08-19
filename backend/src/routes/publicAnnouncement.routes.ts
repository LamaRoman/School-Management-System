import { Router } from "express";
import prisma from "../utils/prisma";
import { publicCache, publicSchoolFilter } from "../services/publicOrigins.service";

const router = Router();

// GET /public/announcements/:identifier — unauthenticated read for the
// public website. `identifier` accepts either the internal schoolId (cuid)
// or the school's public `code`, same as /public/gallery.
router.get("/:identifier", publicCache, async (req, res) => {
  const identifier = req.params.identifier;
  const announcement = await prisma.announcement.findFirst({
    where: {
      isActive: true,
      school: {
        OR: [{ id: identifier }, { code: identifier.toUpperCase() }],
        ...publicSchoolFilter,
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, imageUrl: true },
  });
  res.json({ data: announcement });
});

export default router;
