import NepaliDate from "nepali-date-converter";
import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";

// Is a school day "closed" — a weekly day off, a school-specific holiday, or a national
// holiday? Attendance uses this to say so and to ask for confirmation before recording a
// day that normally has none. It never *blocks* anything: a school may hold a make-up day
// or a Saturday class, so the decision stays with the teacher.

export const DEFAULT_WEEKLY_OFF_DAYS = [6]; // Saturday
const BS_DATE = /^\d{4}\/\d{2}\/\d{2}$/;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type DayReasonKind = "WEEKLY_OFF" | "SCHOOL_HOLIDAY" | "NATIONAL_HOLIDAY";
export interface DayReason { kind: DayReasonKind; title: string }
export interface DayStatus {
  date: string;
  weekday: number; // 0=Sunday .. 6=Saturday
  closed: boolean;
  reasons: DayReason[];
}

/** The two week patterns a school can choose: Saturday only, or Saturday + Sunday. */
export function isAllowedWeeklyOff(days: number[]): boolean {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  return (
    (sorted.length === 1 && sorted[0] === 6) ||
    (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6)
  );
}

/**
 * Weekday (0=Sunday .. 6=Saturday) of a BS date "YYYY/MM/DD". The conversion builds a
 * calendar date and reads it back with the same (local) getters, so the result does not
 * depend on the server's timezone.
 */
export function bsWeekday(date: string): number {
  if (!BS_DATE.test(date)) throw new AppError("date must be a BS date like 2083/06/17", 400);
  const [y, m, d] = date.split("/").map(Number);
  try {
    return new NepaliDate(y, m - 1, d).toJsDate().getDay();
  } catch {
    throw new AppError("Invalid BS date", 400);
  }
}

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? "";
}

/** Pure rule, separated from the database lookups so it can be tested on its own. */
export function buildDayStatus(
  date: string,
  weeklyOffDays: number[],
  schoolHolidays: string[],
  nationalHolidays: string[],
): DayStatus {
  const weekday = bsWeekday(date);
  const reasons: DayReason[] = [];
  if (weeklyOffDays.includes(weekday)) reasons.push({ kind: "WEEKLY_OFF", title: weekdayName(weekday) });
  for (const title of schoolHolidays) reasons.push({ kind: "SCHOOL_HOLIDAY", title });
  for (const title of nationalHolidays) reasons.push({ kind: "NATIONAL_HOLIDAY", title });
  return { date, weekday, closed: reasons.length > 0, reasons };
}

/** Closed-day status for one BS date, for one school (the school id always comes from the JWT). */
export async function getDayStatus(schoolId: string, date: string): Promise<DayStatus> {
  bsWeekday(date); // validate before touching the database

  // One round trip, not three: the admin dashboard calls this on every load (including
  // cache hits) and a test pins that path's query count.
  const [row] = await prisma.$queryRaw<
    { weekly_off_days: number[] | null; school_holidays: string[] | null; national_holidays: string[] | null }[]
  >(Prisma.sql`
    SELECT
      (SELECT s.weekly_off_days FROM schools s WHERE s.id = ${schoolId}) AS weekly_off_days,
      (SELECT array_agg(e.title ORDER BY e.title) FROM calendar_events e
         WHERE e.school_id = ${schoolId} AND e.type = 'HOLIDAY'
           AND e.date <= ${date} AND COALESCE(e.end_date, e.date) >= ${date}) AS school_holidays,
      (SELECT array_agg(m.title ORDER BY m.title) FROM master_calendar_events m
         WHERE m.date = ${date} AND m.type = 'HOLIDAY') AS national_holidays
  `);

  const weeklyOff = row?.weekly_off_days?.length ? row.weekly_off_days : DEFAULT_WEEKLY_OFF_DAYS;
  return buildDayStatus(date, weeklyOff, row?.school_holidays ?? [], row?.national_holidays ?? []);
}
