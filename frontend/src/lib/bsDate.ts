// ─── Nepali (BS) Date Utility ───────────────────────────
// Single source of truth for all BS date operations.
// Uses nepali-date-converter library.

import NepaliDate from "nepali-date-converter";

export const BS_MONTH_NAMES = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

// ─── Core functions ─────────────────────────────────────

/** Get today's BS date as formatted string "YYYY/MM/DD" */
export function getTodayBS(): string {
  return new NepaliDate().format("YYYY/MM/DD");
}

/** Get today's BS date as an object */
export function getTodayBSParts(): { year: number; month: number; day: number } {
  const d = new NepaliDate();
  return { year: d.getYear(), month: d.getMonth() + 1, day: d.getDate() }; // month is 1-indexed in return
}

/** Get current BS month name */
export function getCurrentBSMonthName(): string {
  return BS_MONTH_NAMES[new NepaliDate().getMonth()];
}

// ─── Parsing and formatting ─────────────────────────────

/** Parse "YYYY/MM/DD" string into parts. Returns null if invalid format. */
export function parseBSDate(dateStr: string): { year: number; month: number; day: number } | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 32) return null;
  return { year, month, day };
}

/** Format BS parts into "YYYY/MM/DD" string */
export function formatBSDate(year: number, month: number, day: number): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

/** Get month name from 1-indexed month number */
function getBSMonthName(month: number): string {
  if (month < 1 || month > 12) return "";
  return BS_MONTH_NAMES[month - 1];
}

// ─── Comparison ─────────────────────────────────────────

/** Compare two BS date strings. Returns -1 (a<b), 0 (a==b), 1 (a>b) */
function compareBSDates(a: string, b: string): number {
  const pa = parseBSDate(a);
  const pb = parseBSDate(b);
  if (!pa || !pb) return 0;

  if (pa.year !== pb.year) return pa.year < pb.year ? -1 : 1;
  if (pa.month !== pb.month) return pa.month < pb.month ? -1 : 1;
  if (pa.day !== pb.day) return pa.day < pb.day ? -1 : 1;
  return 0;
}

/** Check if a BS date string is in the future */
export function isFutureBS(dateStr: string): boolean {
  return compareBSDates(dateStr, getTodayBS()) > 0;
}

/** Check if a BS date string is today */
export function isTodayBS(dateStr: string): boolean {
  return compareBSDates(dateStr, getTodayBS()) === 0;
}

// ─── Navigation (for date pickers) ─────────────────────

/** Get the previous day's BS date string */
export function getPreviousDayBS(dateStr: string): string {
  const parsed = parseBSDate(dateStr);
  if (!parsed) return dateStr;

  try {
    // Convert BS to AD, subtract 1 day, convert back
    const nd = new NepaliDate(parsed.year, parsed.month - 1, parsed.day);
    const ad = nd.toJsDate();
    ad.setDate(ad.getDate() - 1);
    const prev = new NepaliDate(ad);
    return prev.format("YYYY/MM/DD");
  } catch {
    return dateStr;
  }
}

/** Get the next day's BS date string */
export function getNextDayBS(dateStr: string): string {
  const parsed = parseBSDate(dateStr);
  if (!parsed) return dateStr;

  try {
    // Convert BS to AD, add 1 day, convert back
    const nd = new NepaliDate(parsed.year, parsed.month - 1, parsed.day);
    const ad = nd.toJsDate();
    ad.setDate(ad.getDate() + 1);
    const next = new NepaliDate(ad);
    return next.format("YYYY/MM/DD");
  } catch {
    return dateStr;
  }
}

// ─── Grade / Section label ───────────────────────────────

/**
 * Format a grade + section label.
 * Always shows the section name when provided.
 *
 * Examples:
 *   "VIII", "A" → "VIII - A"
 *   "Nursery", "A" → "Nursery - A"
 */
export function formatGradeSection(gradeName: string, sectionName: string): string {
  return sectionName ? `${gradeName} - ${sectionName}` : gradeName;
}

/** Get formatted BS date with month name: "12 Chaitra 2082" */
export function formatBSDateLong(dateStr: string): string {
  const parsed = parseBSDate(dateStr);
  if (!parsed) return dateStr;
  return `${parsed.day} ${getBSMonthName(parsed.month)} ${parsed.year}`;
}
