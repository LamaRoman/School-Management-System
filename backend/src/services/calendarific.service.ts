import NepaliDate from "nepali-date-converter";
import { AppError } from "../middleware/errorHandler";

// Calendarific holidays API. Key lives in CALENDARIFIC_API_KEY (never client-side).
const CALENDARIFIC_BASE = "https://calendarific.com/api/v2/holidays";

export interface FetchedHoliday {
  title: string;
  description?: string;
  bsDate: string; // "YYYY/MM/DD"
  bsYear: number;
  externalId: string; // stable dedup key for idempotent re-import
}

// Convert an AD "YYYY-MM-DD" to a BS date. Noon local time avoids day-boundary
// shifts during the AD→BS conversion.
function adToBS(iso: string): { date: string; year: number } | null {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  try {
    const nd = new NepaliDate(new Date(y, m - 1, d, 12, 0, 0));
    const year = nd.getYear();
    const month = nd.getMonth() + 1;
    const day = nd.getDate();
    return { date: `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`, year };
  } catch {
    return null;
  }
}

// A BS year spans two AD years (starts ~mid-April of AD year bsYear-57), so we
// fetch both overlapping AD years and keep the holidays whose BS date lands in
// the requested BS year.
export async function fetchNepalHolidaysForBSYear(bsYear: number): Promise<FetchedHoliday[]> {
  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) throw new AppError("Calendarific API key is not configured on the server", 500);

  const adYears = [bsYear - 57, bsYear - 56];
  const seen = new Set<string>();
  const out: FetchedHoliday[] = [];

  for (const adYear of adYears) {
    const url = `${CALENDARIFIC_BASE}?api_key=${apiKey}&country=NP&year=${adYear}`;
    let json: any;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new AppError(`Calendarific request failed (HTTP ${res.status})`, 502);
      json = await res.json();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("Could not reach the Calendarific service", 502);
    }

    const holidays: any[] = json?.response?.holidays ?? [];
    for (const h of holidays) {
      const iso: string | undefined = h?.date?.iso;
      if (!iso || !h?.name) continue;
      const bs = adToBS(iso);
      if (!bs || bs.year !== bsYear) continue;
      const externalId = `calendarific:NP:${iso.slice(0, 10)}:${h.name}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);
      out.push({
        title: String(h.name),
        description: h.description ? String(h.description) : undefined,
        bsDate: bs.date,
        bsYear: bs.year,
        externalId,
      });
    }
  }

  return out.sort((a, b) => (a.bsDate < b.bsDate ? -1 : a.bsDate > b.bsDate ? 1 : 0));
}
