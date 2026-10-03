import NepaliDateImport, { dateConfigMap } from 'nepali-date-converter';

// Metro gives the class directly; Node's ESM loader (used by `npm test`) wraps the
// UMD build so the class is on `.default`. Accept either.
const NepaliDate: typeof NepaliDateImport = (NepaliDateImport as any).default ?? NepaliDateImport;

// Nepal's calendar date right now, independent of the phone's timezone setting. A
// device set to another timezone would otherwise show the wrong BS "today" for hours
// around midnight. Falls back to the device clock if Intl timezone support is missing.
function kathmanduCalendarDate(): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const num = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const y = num('year'), m = num('month'), d = num('day');
    if ([y, m, d].some(n => !Number.isFinite(n))) return new Date();
    return new Date(y, m - 1, d);
  } catch {
    return new Date();
  }
}

export function getTodayBS(): string {
  return new NepaliDate(kathmanduCalendarDate()).format('YYYY/MM/DD');
}

/** Parse "YYYY/MM/DD". Returns null if invalid. */
export function parseBSDate(dateStr: string): { year: number; month: number; day: number } | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(p => parseInt(p, 10));
  if ([year, month, day].some(n => isNaN(n))) return null;
  if (month < 1 || month > 12 || day < 1 || day > 32) return null;
  return { year, month, day };
}

function compareBSDates(a: string, b: string): number {
  const pa = parseBSDate(a), pb = parseBSDate(b);
  if (!pa || !pb) return 0;
  if (pa.year !== pb.year) return pa.year < pb.year ? -1 : 1;
  if (pa.month !== pb.month) return pa.month < pb.month ? -1 : 1;
  if (pa.day !== pb.day) return pa.day < pb.day ? -1 : 1;
  return 0;
}

export const isFutureBS = (dateStr: string): boolean => compareBSDates(dateStr, getTodayBS()) > 0;
export const isTodayBS = (dateStr: string): boolean => compareBSDates(dateStr, getTodayBS()) === 0;

function shiftBSDate(dateStr: string, deltaDays: number): string {
  const parsed = parseBSDate(dateStr);
  if (!parsed) return dateStr;
  try {
    // BS -> AD, move by whole days, AD -> BS (month lengths vary, so never do the
    // arithmetic on BS parts directly).
    const ad = new NepaliDate(parsed.year, parsed.month - 1, parsed.day).toJsDate();
    ad.setDate(ad.getDate() + deltaDays);
    return new NepaliDate(ad).format('YYYY/MM/DD');
  } catch {
    return dateStr;
  }
}

export const getPreviousDayBS = (dateStr: string): string => shiftBSDate(dateStr, -1);
export const getNextDayBS = (dateStr: string): string => shiftBSDate(dateStr, 1);

// ─── Month grid (for the calendar screen) ────────────────

export const BS_MONTH_NAMES = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];

// The library's own key spellings differ from BS_MONTH_NAMES ("Asar", "Aswin"), so keep a
// dedicated list for the dateConfigMap lookup.
const DATE_CONFIG_MONTH_KEYS = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Aswin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];

/** Number of days in a BS month (month is 1-12). Read from the library's table, not probed. */
export function getDaysInBSMonth(year: number, month: number): number {
  const map = (dateConfigMap as Record<string, Record<string, number> | undefined>)[String(year)];
  return map?.[DATE_CONFIG_MONTH_KEYS[month - 1]] ?? 30;
}

/** Weekday (0=Sunday .. 6=Saturday) of the 1st of a BS month. */
export function getStartWeekday(year: number, month: number): number {
  try {
    return new NepaliDate(year, month - 1, 1).toJsDate().getDay();
  } catch {
    return 0;
  }
}

export function formatBSDate(year: number, month: number, day: number): string {
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

/** "17 Ashwin 2083" */
export function formatBSDateLong(dateStr: string): string {
  const p = parseBSDate(dateStr);
  return p ? `${p.day} ${BS_MONTH_NAMES[p.month - 1] ?? ''} ${p.year}` : dateStr;
}
