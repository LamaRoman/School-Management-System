// Pure builder for the month grid on the Calendar screen. No React / React Native /
// NepaliDate imports, so it is unit-tested with plain `node --test` (calendarMonth.test.ts).
// The caller supplies how many days the month has and which weekday it starts on.

export interface CalEvent {
  id: string;
  title: string;
  description?: string | null;
  date: string; // BS "YYYY/MM/DD"
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
  const byDate = new Map<string, CalEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date);
    if (list) list.push(e); else byDate.set(e.date, [e]);
  }
  const cells: DayCell[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}/${pad(month)}/${pad(day)}`;
    const weekday = (startWeekday + day - 1) % 7;
    const dayEvents = byDate.get(date) ?? [];
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
  const prefix = `${year}/${pad(month)}/`;
  return events.filter(e => e.date.startsWith(prefix)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
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
