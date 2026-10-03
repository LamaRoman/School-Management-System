import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize, getSchoolId } from "../middleware/auth";
import { revalidateWebsite } from "../services/websiteRevalidate.service";
import { DEFAULT_WEEKLY_OFF_DAYS } from "../services/schoolDay.service";

const router = Router();

// Schema reference:
//   CalendarEvent { id, schoolId, title, description?, date, type, createdById, createdAt, updatedAt }
//   Relations: school -> School, createdBy -> User
// Admin-only: view, create, edit, delete.

const EVENT_TYPES = ["EVENT", "HOLIDAY", "MEETING", "EXAM", "OTHER"] as const;

// ─── GET /api/calendar-events — list, optional ?year=YYYY (BS) filter ──
// Returns the school's own events (editable) merged with the super-admin's
// master calendar (national holidays etc.), which are read-only here and
// flagged isMaster so the UI can lock them.

async function loadMergedEvents(schoolId: string, dateFilter: { startsWith: string } | { gte: string } | undefined) {
  const [schoolEvents, masterEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { schoolId, ...(dateFilter ? { date: dateFilter } : {}) },
      include: { createdBy: { select: { id: true, email: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.masterCalendarEvent.findMany({
      where: dateFilter ? { date: dateFilter } : {},
      orderBy: { date: "asc" },
    }),
  ]);

  return [
    ...masterEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date,
      type: e.type,
      isMaster: true as const,
      source: e.source,
    })),
    ...schoolEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date,
      type: e.type,
      isMaster: false as const,
      createdBy: e.createdBy,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

router.get("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const { year, from, limit } = req.query;

  const dateFilter = year ? { startsWith: `${year}/` } : from ? { gte: String(from) } : undefined;
  let merged = await loadMergedEvents(schoolId, dateFilter);
  if (limit) merged = merged.slice(0, Number(limit));

  res.json({ data: merged });
});

// ─── GET /api/calendar-events/view?year=YYYY — read-only calendar for staff ──
// The same merged list (school events + national holidays) plus the school's weekly days
// off, for the teacher and accountant app/screens. Created-by emails are left out: staff
// only need what is on the calendar, not who entered it.
router.get("/view", authenticate, authorize("ADMIN", "TEACHER", "ACCOUNTANT"), async (req, res) => {
  const schoolId = getSchoolId(req);
  const year = String(req.query.year ?? "");
  if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: "year (BS, e.g. 2083) is required" });

  const [events, school] = await Promise.all([
    loadMergedEvents(schoolId, { startsWith: `${year}/` }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { weeklyOffDays: true } }),
  ]);

  res.json({
    data: {
      weeklyOffDays: school?.weeklyOffDays?.length ? school.weeklyOffDays : DEFAULT_WEEKLY_OFF_DAYS,
      events: events.map(({ id, title, description, date, type, isMaster }) => ({ id, title, description, date, type, isMaster })),
    },
  });
});

// ─── POST /api/calendar-events ──────────────────────────

router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  const user = req.user!;
  const schoolId = getSchoolId(req);

  const schema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/, "date must be in YYYY/MM/DD (BS) format"),
    type: z.enum(EVENT_TYPES).default("EVENT"),
  });

  const data = schema.parse(req.body);

  const event = await prisma.calendarEvent.create({
    data: {
      title: data.title,
      description: data.description || null,
      date: data.date,
      type: data.type,
      school: { connect: { id: schoolId } },
      createdBy: { connect: { id: user.userId } },
    },
    include: { createdBy: { select: { id: true, email: true } } },
  });

  revalidateWebsite(schoolId, "calendar");

  res.status(201).json({ data: event });
});

// ─── PUT /api/calendar-events/:id ───────────────────────

router.put("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await prisma.calendarEvent.findFirstOrThrow({ where: { id: req.params.id, schoolId } });

  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/, "date must be in YYYY/MM/DD (BS) format").optional(),
    type: z.enum(EVENT_TYPES).optional(),
  });

  const data = schema.parse(req.body);

  const updated = await prisma.calendarEvent.update({
    where: { id: req.params.id },
    data,
    include: { createdBy: { select: { id: true, email: true } } },
  });

  revalidateWebsite(schoolId, "calendar");

  res.json({ data: updated });
});

// ─── DELETE /api/calendar-events/:id ────────────────────

router.delete("/:id", authenticate, authorize("ADMIN"), async (req, res) => {
  const schoolId = getSchoolId(req);
  await prisma.calendarEvent.findFirstOrThrow({ where: { id: req.params.id, schoolId } });

  await prisma.calendarEvent.delete({ where: { id: req.params.id } });

  revalidateWebsite(schoolId, "calendar");

  res.json({ data: { message: "Event deleted" } });
});

export default router;
