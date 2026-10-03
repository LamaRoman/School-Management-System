// Pure helpers for the Results screen (class teacher marks an exam complete; an admin publishes).

export type ResultStatus = 'DRAFT' | 'READY' | 'PUBLISHED';

export interface MissingStudent { id: string; name: string; rollNo: number | null }
export interface SubjectRow {
  subjectId: string; subjectName: string; isOptional: boolean;
  expected: number; entered: number; missingStudents: MissingStudent[];
}

export interface StatusInfo { title: string; detail: string; tone: 'muted' | 'info' | 'success' }

export function statusInfo(status: ResultStatus, markedReadyBy: string | null): StatusInfo {
  if (status === 'PUBLISHED') {
    return { title: 'Published', detail: 'Parents and students can see these results.', tone: 'success' };
  }
  if (status === 'READY') {
    return {
      title: 'Marked complete',
      detail: `Marked complete${markedReadyBy ? ` by ${markedReadyBy}` : ''}. Waiting for an admin to publish — families cannot see these yet.`,
      tone: 'info',
    };
  }
  return { title: 'Entry in progress', detail: 'Families see a “not published yet” message until an admin publishes.', tone: 'muted' };
}

/** Which action the class teacher may take. Once published only an admin can change it. */
export function availableAction(status: ResultStatus): 'ready' | 'reopen' | null {
  return status === 'DRAFT' ? 'ready' : status === 'READY' ? 'reopen' : null;
}

/** "No mark for A, B, C and 2 more" — null when nothing is missing. */
export function missingLine(row: SubjectRow, show = 4): string | null {
  const names = row.missingStudents;
  if (names.length === 0) return null;
  const shown = names.slice(0, show).map(m => m.name).join(', ');
  return `No mark for ${shown}${names.length > show ? ` and ${names.length - show} more` : ''}`;
}

export function progressFraction(complete: number, total: number): number {
  return total > 0 ? Math.min(1, complete / total) : 0;
}
