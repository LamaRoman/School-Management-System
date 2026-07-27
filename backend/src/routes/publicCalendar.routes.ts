import { Router } from "express";
import prisma from "../utils/prisma";

const router = Router();

// Only these types are safe to show on a school's public website — internal
// staff MEETINGs and EXAM schedules stay admin-only.
const PUBLIC_EVENT_TYPES = ["EVENT", "HOLIDAY"] as const;

// GET /public/calendar/:schoolId — unauthenticated read for the public website.
// Merges the school's own events with the super-admin's master calendar
// (national holidays), same shape as the admin calendar endpoint.
router.get("/:schoolId", async (req, res) => {
  const schoolId = req.params.schoolId;

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
