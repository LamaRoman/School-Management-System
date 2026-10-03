// Pure helpers for the attendance screen. No React / React Native imports so they can be
// unit-tested with plain `node --test` (see attendanceForm.test.ts).

export type Status = 'PRESENT' | 'ABSENT';

/** One row as the API returns it: `status` is null for a day that was never saved. */
export interface ServerRecord {
  studentId: string;
  studentName: string;
  rollNo: number | null;
  status: Status | null;
  isMarked: boolean;
}

/** One row as the screen shows it: every student has a status. */
export interface ShownRecord extends Omit<ServerRecord, 'status'> {
  status: Status;
}

/**
 * Students nobody has marked yet are shown PRESENT, like the web portal. One tap then
 * means "absent" (the exception), and an untouched day is simply all present. `isMarked`
 * is kept from the server so the screen can still tell "saved" from "just a default".
 */
export function withDefaults(records: ServerRecord[]): ShownRecord[] {
  return records.map(r => ({ ...r, status: r.status ?? 'PRESENT' }));
}

export function toggled(status: Status): Status {
  return status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
}

export function countStatuses(records: { status: Status | null }[]): { present: number; absent: number } {
  return {
    present: records.filter(r => r.status === 'PRESENT').length,
    absent: records.filter(r => r.status === 'ABSENT').length,
  };
}

/** How many students have nothing stored on the server for this day yet. */
export function unsavedCount(records: { isMarked: boolean }[]): number {
  return records.filter(r => !r.isMarked).length;
}

/** The Save bar is needed after an edit, and also for a day nobody has saved yet. */
export function needsSave(hasChanges: boolean, records: { isMarked: boolean }[]): boolean {
  return records.length > 0 && (hasChanges || unsavedCount(records) > 0);
}

export function toPayload(records: ShownRecord[]): { studentId: string; status: Status }[] {
  return records.map(r => ({ studentId: r.studentId, status: r.status }));
}

export function savedSummary(present: number, absent: number): string {
  return `Saved: ${present} present, ${absent} absent`;
}

// ─── Closed days (weekly day off / school holiday / public holiday) ─────────────

export interface DayReason { kind: 'WEEKLY_OFF' | 'SCHOOL_HOLIDAY' | 'NATIONAL_HOLIDAY'; title: string }
export interface DayStatus { date: string; closed: boolean; reasons: DayReason[] }

export function reasonText(r: DayReason): string {
  if (r.kind === 'WEEKLY_OFF') return `${r.title} (weekly day off)`;
  if (r.kind === 'SCHOOL_HOLIDAY') return `${r.title} (school holiday)`;
  return `${r.title} (public holiday)`;
}

/**
 * How the attendance screen treats a day:
 *  - 'open'      an ordinary school day (or we couldn't tell: never block on a failed lookup)
 *  - 'blocking'  closed and nothing recorded yet: show "Closed" and ask before taking attendance
 *  - 'recorded'  closed, but attendance already exists or the teacher confirmed: show it
 *                (existing records are never hidden behind the prompt)
 */
export function closedMode(
  day: DayStatus | null | undefined,
  hasSavedRecords: boolean,
  confirmedFor: string | null,
  date: string,
): 'open' | 'blocking' | 'recorded' {
  if (!day?.closed) return 'open';
  if (hasSavedRecords || confirmedFor === date) return 'recorded';
  return 'blocking';
}
