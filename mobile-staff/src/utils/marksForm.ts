// Pure helpers for the mark-entry form. No React / React Native imports so they can
// be unit-tested with plain `node --test` (see marksForm.test.ts).

export interface MarkEntry { theoryMarks: string; practicalMarks: string; isAbsent: boolean }

// The shape /marks returns that we use.
export interface ExistingMark {
  studentId: string;
  theoryMarks: number | null;
  practicalMarks: number | null;
  isAbsent: boolean;
}

export const emptyEntry = (): MarkEntry => ({ theoryMarks: '', practicalMarks: '', isAbsent: false });

const show = (n: number | null | undefined): string => (n == null ? '' : String(n));

/**
 * Builds the whole form from scratch for one class + exam: a student with no saved
 * mark gets an EMPTY entry. Never merge into the previous form — doing that carried
 * the previous exam's marks into the new exam's form, and Save then wrote them there.
 */
export function buildMarksForm(studentIds: string[], existing: ExistingMark[]): Record<string, MarkEntry> {
  const byStudent = new Map(existing.map(m => [m.studentId, m]));
  const form: Record<string, MarkEntry> = {};
  for (const id of studentIds) {
    const m = byStudent.get(id);
    form[id] = !m
      ? emptyEntry()
      : m.isAbsent
        ? { theoryMarks: '', practicalMarks: '', isAbsent: true }
        : { theoryMarks: show(m.theoryMarks), practicalMarks: show(m.practicalMarks), isAbsent: false };
  }
  return form;
}

/** Parses a typed mark. '' -> null (not entered); anything unparseable -> null. */
export function parseMark(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Student ids whose typed theory/practical mark is above full marks (absent students skipped). */
export function overFullMarks(
  form: Record<string, MarkEntry>,
  fullTheory: number,
  fullPractical: number,
): string[] {
  return Object.entries(form)
    .filter(([, m]) => {
      if (m.isAbsent) return false;
      const t = parseMark(m.theoryMarks);
      const p = parseMark(m.practicalMarks);
      return (t != null && t > fullTheory) || (p != null && p > fullPractical);
    })
    .map(([id]) => id);
}

/** Student ids with something typed that isn't a valid non-negative number. */
export function unparseableMarks(form: Record<string, MarkEntry>): string[] {
  return Object.entries(form)
    .filter(([, m]) => !m.isAbsent && [m.theoryMarks, m.practicalMarks].some(v => v.trim() !== '' && parseMark(v) == null))
    .map(([id]) => id);
}

export interface BulkMark { studentId: string; theoryMarks: number | null; practicalMarks: number | null; isAbsent: boolean }

export function toBulkPayload(studentIds: string[], form: Record<string, MarkEntry>): BulkMark[] {
  return studentIds.map(id => {
    const m = form[id] ?? emptyEntry();
    return {
      studentId: id,
      theoryMarks: m.isAbsent ? null : parseMark(m.theoryMarks),
      practicalMarks: m.isAbsent ? null : parseMark(m.practicalMarks),
      isAbsent: m.isAbsent,
    };
  });
}
