import NepaliDate from "nepali-date-converter";
import { AppError } from "../middleware/errorHandler";
import { bsWeekday } from "./schoolDay.service";

// Multi-day calendar entries (a vacation is ONE entry from its first to its last day).
// BS dates are zero-padded "YYYY/MM/DD", so plain string comparison orders them correctly.

/** Longest range a single entry may cover. Keeps a typo (2083 vs 2093) from creating a decade-long break. */
export const MAX_RANGE_DAYS = 120;

const FORMAT = "YYYY/MM/DD";

/** The BS date `delta` days after `date`. Month lengths vary, so this goes through AD and back. */
export function addDaysBS(date: string, delta: number): string {
  bsWeekday(date); // validates the format and that it is a real date
  const [y, m, d] = date.split("/").map(Number);
  const ad = new NepaliDate(y, m - 1, d).toJsDate();
  ad.setDate(ad.getDate() + delta);
  return new NepaliDate(ad).format(FORMAT);
}

/** Every BS date from `start` to `end`, both included. */
export function expandRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  // The cap also bounds this loop if a caller forgot to validate first.
  for (let i = 0; i <= MAX_RANGE_DAYS && cur <= end; i++) {
    out.push(cur);
    cur = addDaysBS(cur, 1);
  }
  return out;
}

/** True when `date` falls inside the entry (single-day entries have no end date). */
export function coversDate(entry: { date: string; endDate?: string | null }, date: string): boolean {
  return entry.date <= date && (entry.endDate ?? entry.date) >= date;
}

/**
 * Validates a (start, end) pair and returns the end date to store: null for a single day.
 * Throws a 400 for an invalid date, an end before the start, or a range longer than MAX_RANGE_DAYS.
 */
export function normalizeRange(start: string, end: string | null | undefined): string | null {
  if (end == null || end === "") return null;
  bsWeekday(start);
  bsWeekday(end);
  if (end < start) throw new AppError("The last day can't be before the first day", 400);
  if (end === start) return null;
  const days = expandRange(start, end);
  // expandRange stops at the cap, so a range that never reached `end` was too long.
  if (days.length > MAX_RANGE_DAYS || days[days.length - 1] !== end) {
    throw new AppError(`A break can cover at most ${MAX_RANGE_DAYS} days`, 400);
  }
  return end;
}
