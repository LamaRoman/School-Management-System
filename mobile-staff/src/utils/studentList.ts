// Pure helpers for the read-only "My Students" roster.

export interface RosterStudent {
  id: string; name: string; nameNp?: string | null; rollNo?: number | null; gender?: string | null;
  dateOfBirth?: string | null; fatherName?: string | null; motherName?: string | null;
  guardianName?: string | null; guardianPhone?: string | null; address?: string | null;
}

/** Roll-number order; students without a roll number go last, then by name. */
export function sortRoster<T extends RosterStudent>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const ra = a.rollNo ?? Infinity, rb = b.rollNo ?? Infinity;
    if (ra !== rb) return ra < rb ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/** Case-insensitive match on name, Nepali name or roll number. Blank query keeps everyone. */
export function filterRoster<T extends RosterStudent>(students: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return students;
  return students.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.nameNp ?? '').toLowerCase().includes(q) ||
    (s.rollNo != null && String(s.rollNo) === q),
  );
}

/** Label/value pairs for the expanded card; empty values are left out. */
export function detailRows(s: RosterStudent): { label: string; value: string }[] {
  const rows: [string, string | null | undefined][] = [
    ['Nepali name', s.nameNp], ['Gender', s.gender], ['Date of birth (BS)', s.dateOfBirth],
    ['Father', s.fatherName], ['Mother', s.motherName],
    ['Guardian', s.guardianName],
    ['Address', s.address],
  ];
  return rows.filter(([, v]) => !!v && String(v).trim() !== '').map(([label, value]) => ({ label, value: String(value).trim() }));
}

/** A dialable number: digits and a leading +; null if there are too few digits to call. */
export function dialable(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 7 ? cleaned : null;
}
