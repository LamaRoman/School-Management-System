import { Router } from "express";
import prisma from "../utils/prisma";
import { publicCache, publicSchoolFilter } from "../services/publicOrigins.service";

const router = Router();

// Only these types are safe to show on a school's public website — internal
// staff MEETINGs and EXAM schedules stay admin-only.
const PUBLIC_EVENT_TYPES = ["EVENT", "HOLIDAY"] as const;

// GET /public/calendar/:identifier — unauthenticated read for the public website.
// `identifier` accepts either the internal schoolId (cuid) or the school's
// public `code` — S6b, same as publicGallery. Merges the school's own events
// with the super-admin's master calendar (national holidays), same shape as
// the admin calendar endpoint.
router.get("/:identifier", publicCache, async (req, res) => {
  const identifier = req.params.identifier;

  // S6a — a suspended school, or one that never registered a website, is not
  // served publicly. Checked once here rather than nested into both queries,
  // because the master-calendar half has no school relation to filter on.
  const school = await prisma.school.findFirst({
    where: { OR: [{ id: identifier }, { code: identifier.toUpperCase() }], ...publicSchoolFilter },
    select: { id: true },
  });
  if (!school) return res.json({ data: [] });
  const schoolId = school.id;

  const [schoolEvents, masterEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { schoolId, type: { in: [...PUBLIC_EVENT_TYPES] } },
      select: { id: true, title: true, description: true, date: true, type: true },
      orderBy: { date: "asc" },
    }),
    prisma.masterCalendarEvent.findMany({
      where: { type: { in: [...PUBLIC_EVENT_TYPES] } },
      select: { id: true, title: true, description: true, date: true, type: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const merged = [
    ...schoolEvents.map((e) => ({ ...e, isMaster: false as const })),
    ...masterEvents.map((e) => ({ ...e, isMaster: true as const })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  res.json({ data: merged });
});

export default router;
