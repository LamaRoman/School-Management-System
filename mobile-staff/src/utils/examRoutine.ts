// Pure helpers for the read-only Exam Routine screen.

export interface RoutineEntry {
  id: string; examDate: string; dayName?: string | null; startTime?: string | null; endTime?: string | null;
  subject: { name: string };
}
export interface GradeRef { gradeId: string; gradeName: string; academicYearId: string }

/** Every distinct grade the teacher is involved in (class teacher or subject), first-seen order. */
export function teacherGrades(
  classSections: Partial<GradeRef>[], subjectAssignments: Partial<GradeRef>[],
): GradeRef[] {
  const seen = new Map<string, GradeRef>();
  for (const a of [...classSections, ...subjectAssignments]) {
    if (a.gradeId && a.gradeName && a.academicYearId && !seen.has(a.gradeId)) {
      seen.set(a.gradeId, { gradeId: a.gradeId, gradeName: a.gradeName, academicYearId: a.academicYearId });
    }
  }
  return [...seen.values()];
}

/** "10:00 – 12:00", "10:00" or "" depending on what is set. */
export function timeRange(e: Pick<RoutineEntry, 'startTime' | 'endTime'>): string {
  const s = e.startTime?.trim(), t = e.endTime?.trim();
  if (s && t) return `${s} – ${t}`;
  return s || t || '';
}

/** Date order (BS strings sort as dates), then start time, then subject. */
export function sortRoutine<T extends RoutineEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    a.examDate.localeCompare(b.examDate) ||
    (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
    a.subject.name.localeCompare(b.subject.name));
}

/** True for exams on or after `today` (BS "YYYY/MM/DD"). */
export function isUpcoming(entry: Pick<RoutineEntry, 'examDate'>, today: string): boolean {
  return entry.examDate >= today;
}
