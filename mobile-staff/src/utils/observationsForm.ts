// Pure logic for the Observations screen: grading students on general categories
// (discipline, punctuality, ...) per exam. Edits are an overlay on what the server has;
// only changed cells are sent, so a stale screen can never rewrite grades it did not touch.

export const GRADE_OPTIONS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E'] as const;

export interface ObsStudent { id: string; name: string; rollNo: number | null; grades: Record<string, string> }
export type Edits = Record<string, Record<string, string>>; // studentId -> categoryId -> grade

/** What a cell shows: the teacher's edit if any, else the saved grade, else ''. */
export function gradeOf(s: ObsStudent, edits: Edits, categoryId: string): string {
  return edits[s.id]?.[categoryId] ?? s.grades[categoryId] ?? '';
}

/** Set one cell. Choosing the grade the server already has drops the edit (nothing to save). */
export function setGrade(edits: Edits, s: ObsStudent, categoryId: string, grade: string): Edits {
  const next: Edits = { ...edits, [s.id]: { ...(edits[s.id] ?? {}) } };
  if (s.grades[categoryId] === grade) delete next[s.id][categoryId];
  else next[s.id][categoryId] = grade;
  if (Object.keys(next[s.id]).length === 0) delete next[s.id];
  return next;
}

/** Give every student with no grade yet in this category the same grade. Never overwrites. */
export function fillBlank(students: ObsStudent[], edits: Edits, categoryId: string, grade: string): Edits {
  let next = edits;
  for (const s of students) {
    if (gradeOf(s, next, categoryId) === '') next = setGrade(next, s, categoryId, grade);
  }
  return next;
}

export interface Entry { studentId: string; categoryId: string; grade: string }

/** The cells to send: only edited ones, with a valid grade. */
export function toEntries(edits: Edits): Entry[] {
  const out: Entry[] = [];
  for (const [studentId, cats] of Object.entries(edits)) {
    for (const [categoryId, grade] of Object.entries(cats)) {
      if ((GRADE_OPTIONS as readonly string[]).includes(grade)) out.push({ studentId, categoryId, grade });
    }
  }
  return out;
}

export function unsavedCount(edits: Edits): number {
  return toEntries(edits).length;
}

/** "7 of 10 graded" for one category. */
export function gradedCount(students: ObsStudent[], edits: Edits, categoryId: string): number {
  return students.filter(s => gradeOf(s, edits, categoryId) !== '').length;
}
