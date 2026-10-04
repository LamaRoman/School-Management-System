// Pure helpers for the attendance screen. No React / React Native imports so they can be
// unit-tested with plain `node --test` (see attendanceForm.test.ts).
//
// The screen shows what the server stored (`ServerRecord`) with the teacher's unsaved taps
// laid over it (`Edits`), and decides how an unrecorded student looks from the kind of day:
//   - ordinary school day: shown PRESENT (one tap = absent), like the web portal;
//   - closed day (weekly day off / holiday): shown GREY (no status). Nobody is assumed
//     present; the teacher can Mark All Present or tap students individually, and only
//     students that were actually marked are saved.

export type Status = 'PRESENT' | 'ABSENT';

/** One row as the API returns it: `status` is null for a student with nothing stored. */
export interface ServerRecord {
  studentId: string;
  studentName: string;
  rollNo: number | null;
  status: Status | null;
  isMarked: boolean;
}

/**
 * Unsaved taps: student id -> the status the teacher chose. `null` means "put back to grey"
 * (delete the stored row); it only ever appears on a closed day, for a student who has one.
 */
export type Edits = Record<string, Status | null>;

/** One row as shown: `status` is null only for a grey (unrecorded) student on a closed day. */
export interface ShownRecord extends Omit<ServerRecord, 'status'> {
  status: Status | null;
}

export function showRecords(raw: ServerRecord[], edits: Edits, closed: boolean): ShownRecord[] {
  return raw.map(r => ({
    ...r,
    // `in`, not `??`: an edit of null (back to grey) must beat the stored status.
    status: r.studentId in edits ? edits[r.studentId] : r.status ?? (closed ? null : 'PRESENT'),
  }));
}

/**
 * First tap on a grey student marks them present; after that a tap flips present/absent.
 * On a closed day a third tap goes back to grey (not recorded), so a mistaken mark can be undone.
 */
export function nextStatus(current: Status | null, closed = false): Status | null {
  if (current === 'PRESENT') return 'ABSENT';
  if (current === 'ABSENT' && closed) return null;
  return 'PRESENT';
}

/**
 * Lay one tap over the edits. An edit that lands back on what the server holds is dropped,
 * so tapping around to the start leaves nothing to save.
 */
export function withEdit(edits: Edits, record: ServerRecord, next: Status | null): Edits {
  const out = { ...edits };
  if (next === record.status) delete out[record.studentId];
  else out[record.studentId] = next;
  return out;
}

/** "Set all back to grey": an edit for every student that has something stored. */
export function clearAllEdits(raw: ServerRecord[]): Edits {
  return Object.fromEntries(raw.filter(r => r.isMarked).map(r => [r.studentId, null])) as Edits;
}

/** Students whose stored row the teacher put back to grey. */
export function toClears(edits: Edits): string[] {
  return Object.keys(edits).filter(id => edits[id] === null);
}

export function countStatuses(records: { status: Status | null }[]): { present: number; absent: number } {
  return {
    present: records.filter(r => r.status === 'PRESENT').length,
    absent: records.filter(r => r.status === 'ABSENT').length,
  };
}

/** How many students have nothing stored on the server for this day yet. */
export function unsavedCount(raw: { isMarked: boolean }[]): number {
  return raw.filter(r => !r.isMarked).length;
}

/**
 * When the Save bar is offered.
 *  - closed day: only once the teacher has marked something (nothing is implied).
 *  - ordinary day: after an edit, and also for a day nobody has saved yet, so an
 *    all-present day can be saved with one press.
 */
export function needsSave(hasEdits: boolean, raw: { isMarked: boolean }[], closed: boolean): boolean {
  if (raw.length === 0) return false;
  return closed ? hasEdits : hasEdits || unsavedCount(raw) > 0;
}

/** Only students that have a status are sent: on a closed day, grey students are left out. */
export function toPayload(shown: ShownRecord[]): { studentId: string; status: Status }[] {
  return shown
    .filter((r): r is ShownRecord & { status: Status } => r.status !== null)
    .map(r => ({ studentId: r.studentId, status: r.status }));
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

/** A failed or missing lookup is treated as an ordinary day: never grey out on a guess. */
export function isClosed(day: DayStatus | null | undefined): boolean {
  return !!day?.closed;
}
