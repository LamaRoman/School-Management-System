// Pure builder for the month grid on the Calendar screen. No React / React Native /
// NepaliDate imports, so it is unit-tested with plain `node --test` (calendarMonth.test.ts).
// The caller supplies how many days the month has and which weekday it starts on.

export interface CalEvent {
  id: string;
  title: string;
  description?: string | null;
  date: string; // BS "YYYY/MM/DD" (first day)
  endDate?: string | null; // last day (inclusive) of a multi-day entry such as a vacation
  type: string; // EVENT, HOLIDAY, MEETING, EXAM, OTHER
  isMaster?: boolean; // national / super-admin calendar
}

export interface DayCell {
  day: number;
  date: string;
  weekday: number; // 0=Sunday .. 6=Saturday
  isWeeklyOff: boolean;
  isToday: boolean;
  events: CalEvent[];
  hasHoliday: boolean; // a HOLIDAY event on this day
}

const pad = (n: number) => String(n).padStart(2, '0');

/** True when `date` falls inside the entry. BS dates are zero-padded, so string order is date order. */
export function coversDate(e: { date: string; endDate?: string | null }, date: string): boolean {
  return e.date <= date && (e.endDate ?? e.date) >= date;
}

export function buildMonthCells(args: {
  year: number;
  month: number; // 1-12
  daysInMonth: number;
  startWeekday: number; // weekday of the 1st
  weeklyOffDays: number[];
  events: CalEvent[];
  today: string; // BS "YYYY/MM/DD"
}): DayCell[] {
  const { year, month, daysInMonth, startWeekday, weeklyOffDays, events, today } = args;
  const cells: DayCell[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}/${pad(month)}/${pad(day)}`;
    const weekday = (startWeekday + day - 1) % 7;
    const dayEvents = events.filter(e => coversDate(e, date));
    cells.push({
      day, date, weekday,
      isWeeklyOff: weeklyOffDays.includes(weekday),
      isToday: date === today,
      events: dayEvents,
      hasHoliday: dayEvents.some(e => e.type === 'HOLIDAY'),
    });
  }
  return cells;
}

/** Cells laid out in 7-column rows; leading/trailing blanks are null. */
export function toWeeks(cells: DayCell[], startWeekday: number): (DayCell | null)[][] {
  const padded: (DayCell | null)[] = [...Array(startWeekday).fill(null), ...cells];
  while (padded.length % 7 !== 0) padded.push(null);
  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}

/** This month's events in date order (the list under the grid). */
export function monthEvents(events: CalEvent[], year: number, month: number): CalEvent[] {
  // An entry belongs to every month it touches, so a vacation shows in the month it continues into.
  const prefix = `${year}/${pad(month)}/`;
  return events.filter(e => e.date <= `${prefix}32` && (e.endDate ?? e.date) >= `${prefix}01`).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
}

/** Month navigation across year boundaries. */
export function shiftMonth(year: number, month: number, delta: 1 | -1): { year: number; month: number } {
  const m = month + delta;
  if (m < 1) return { year: year - 1, month: 12 };
  if (m > 12) return { year: year + 1, month: 1 };
  return { year, month: m };
}

export function dayLabel(weekday: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday] ?? '';
}
