import { Router } from "express";
import prisma from "../utils/prisma";
import { publicCache, publicSchoolFilter } from "../services/publicOrigins.service";

const router = Router();

// GET /public/gallery/:identifier — unauthenticated read for the public website.
// `identifier` accepts either the internal schoolId (cuid) or the school's
// public `code` — S6b. Existing websites that were wired up against the raw
// cuid keep working indefinitely; new ones can use the code instead, which
// doesn't leak an internal primary key into public HTML.
router.get("/:identifier", publicCache, async (req, res) => {
  const identifier = req.params.identifier;
  // S6a — the school must still be active *and* have registered a website.
  // Nesting the filter under the relation keeps this one query rather than a
  // lookup followed by a fetch.
  const photos = await prisma.galleryPhoto.findMany({
    where: {
      school: {
        OR: [{ id: identifier }, { code: identifier.toUpperCase() }],
        ...publicSchoolFilter,
      },
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true, url: true, caption: true, description: true, displayOrder: true },
  });
  res.json({ data: photos });
});

export default router;
