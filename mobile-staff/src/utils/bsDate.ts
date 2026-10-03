import NepaliDateImport from 'nepali-date-converter';

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
