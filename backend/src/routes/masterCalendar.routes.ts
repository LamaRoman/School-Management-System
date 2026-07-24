import { Router } from "express";
import { z } from "zod";
import prisma from "../utils/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { fetchNepalHolidaysForBSYear } from "../services/calendarific.service";

const router = Router();

// The master calendar is owned by the super admin and inherited (read-only) by
// every school. All routes require SUPER_ADMIN.
router.use(authenticate, authorize("SUPER_ADMIN"));

const EVENT_TYPES = ["EVENT", "HOLIDAY", "MEETING", "EXAM", "OTHER"] as const;
const BS_DATE = /^\d{4}\/\d{2}\/\d{2}$/;

// ─── GET /master-calendar — list, optional ?year=YYYY (BS) ──
router.get("/", async (req, res) => {
  const { year } = req.query;
  const where: any = {};
  if (year) where.date = { startsWith: `${year}/` };

  const events = await prisma.masterCalendarEvent.findMany({
    where,
    orderBy: { date: "asc" },
  });
  res.json({ data: events });
});

// ─── POST /master-calendar — add a national event ──
router.post("/", async (req, res) => {
  const user = req.user!;
  const schema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    date: z.string().regex(BS_DATE, "date must be in YYYY/MM/DD (BS) format"),
    type: z.enum(EVENT_TYPES).default("HOLIDAY"),
  });
  const data = schema.parse(req.body);

  const event = await prisma.masterCalendarEvent.create({
    data: {
      title: data.title,
      description: data.description || null,
      date: data.date,
      type: data.type,
      source: "MANUAL",
      createdBy: { connect: { id: user.userId } },
    },
  });
  res.status(201).json({ data: event });
});

// ─── PUT /master-calendar/:id — edit (imported holidays included) ──
router.put("/:id", async (req, res) => {
  await prisma.masterCalendarEvent.findUniqueOrThrow({ where: { id: req.params.id } });

  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    date: z.string().regex(BS_DATE, "date must be in YYYY/MM/DD (BS) format").optional(),
    type: z.enum(EVENT_TYPES).optional(),
  });
  const data = schema.parse(req.body);

  const updated = await prisma.masterCalendarEvent.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ data: updated });
});

// ─── DELETE /master-calendar/:id ──
router.delete("/:id", async (req, res) => {
  await prisma.masterCalendarEvent.findUniqueOrThrow({ where: { id: req.params.id } });
  await prisma.masterCalendarEvent.delete({ where: { id: req.params.id } });
  res.json({ data: { message: "Event deleted" } });
});

// ─── POST /master-calendar/import — import Nepal holidays for a BS year ──
// Idempotent: only creates holidays not already present (by externalId), so
// super-admin edits to previously imported holidays are preserved.
router.post("/import", async (req, res) => {
  const user = req.user!;
  const schema = z.object({ year: z.number().int().min(2070).max(2100) });
  const { year } = schema.parse(req.body);

  const fetched = await fetchNepalHolidaysForBSYear(year);
  if (fetched.length === 0) {
    throw new AppError(`No Nepal holidays found for BS ${year}`, 404);
  }

  const externalIds = fetched.map((f) => f.externalId);
  const existing = await prisma.masterCalendarEvent.findMany({
    where: { externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId));
  const toCreate = fetched.filter((f) => !existingSet.has(f.externalId));

  if (toCreate.length > 0) {
    await prisma.masterCalendarEvent.createMany({
      data: toCreate.map((f) => ({
        title: f.title,
        description: f.description ?? null,
        date: f.bsDate,
        type: "HOLIDAY",
        source: "CALENDARIFIC",
        externalId: f.externalId,
        createdById: user.userId,
      })),
    });
  }

  res.json({
    data: {
      year,
      fetched: fetched.length,
      imported: toCreate.length,
      skipped: fetched.length - toCreate.length,
    },
  });
});

export default router;
